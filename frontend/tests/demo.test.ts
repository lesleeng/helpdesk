import { demoRequest } from '../src/demo/demoApi'
import { ApiError } from '../src/services/errors'

const call = <T>(method: string, path: string, token: string, body?: unknown) =>
  demoRequest<T>(method, path, body === undefined ? undefined : JSON.stringify(body), token)
const USER = 'demo-token-user-1'
const USER2 = 'demo-token-user-2'
const MANAGER = 'demo-token-manager-1'
const TECH = 'demo-token-tech-1'
const ADMIN = 'demo-token-admin-1'

type T = {
  id: number
  status: string
  approval_status?: string
  priority: string
  assigned_to_id?: string
}
type List = { items: T[]; total: number }

async function rejection(promise: Promise<unknown>) {
  try {
    await promise
  } catch (e) {
    return e as ApiError
  }
  throw new Error('expected a rejection')
}

async function newTicket(token: string, sub: string, title = 'Demo ticket') {
  const subs = await call<{ id: number; name: string; category_id: number }[]>(
    'GET',
    '/categories/1/subcategories',
    token,
  )
  const s = subs.find((x) => x.name === sub)!
  return call<T>('POST', '/tickets', token, {
    title,
    description: 'details',
    category_id: s.category_id,
    subcategory_id: s.id,
    urgency: 'medium',
    extra_fields: {},
  })
}

describe('demo backend', () => {
  it('rejects unknown tokens', async () => {
    expect((await rejection(call('GET', '/me', 'nope'))).status).toBe(401)
    expect((await call<{ id: string }>('GET', '/me', USER)).id).toBe('user-1')
  })

  it('scopes tickets by role', async () => {
    const mine = await call<List>('GET', '/tickets?page=1', USER)
    expect(
      mine.items.every((t) => (t as unknown as { user_id: string }).user_id === 'user-1'),
    ).toBe(true)
    const all = await call<List>('GET', '/tickets?page=1', ADMIN)
    expect(all.total).toBeGreaterThan(mine.total)
    const assigned = await call<List>('GET', '/tickets?page=1', TECH)
    expect(assigned.total).toBeGreaterThan(0)
    expect(assigned.total).toBeLessThan(all.total)
  })

  it('runs the approval flow end to end', async () => {
    const t = await newTicket(USER, 'Access request')
    expect(t.approval_status).toBe('pending')
    expect(
      (await rejection(call('PATCH', `/tickets/${t.id}`, ADMIN, { status: 'in_progress' }))).status,
    ).toBe(409)
    expect((await call<T[]>('GET', '/approvals', MANAGER)).some((x) => x.id === t.id)).toBe(true)
    expect(
      (await rejection(call('POST', `/tickets/${t.id}/approval`, USER, { decision: 'approve' })))
        .status,
    ).toBe(403)
    expect(
      (await rejection(call('POST', `/tickets/${t.id}/approval`, USER2, { decision: 'approve' })))
        .status,
    ).toBe(404)
    const approved = await call<T>('POST', `/tickets/${t.id}/approval`, MANAGER, {
      decision: 'approve',
      comment: 'ok',
    })
    expect(approved.approval_status).toBe('approved')
    expect(
      (await call<T>('PATCH', `/tickets/${t.id}`, ADMIN, { status: 'in_progress' })).status,
    ).toBe('in_progress')
  })

  it('cancels a rejected request', async () => {
    const t = await newTicket(USER, 'License assignment')
    const rejected = await call<T>('POST', `/tickets/${t.id}/approval`, MANAGER, {
      decision: 'reject',
    })
    expect(rejected.status).toBe('cancelled')
  })

  it('allows feedback only on resolved tickets, once', async () => {
    const t = await newTicket(USER, 'Password reset')
    expect(
      (await rejection(call('POST', `/tickets/${t.id}/feedback`, USER, { rating: 5 }))).status,
    ).toBe(409)
    await call('PATCH', `/tickets/${t.id}`, ADMIN, { status: 'in_progress' })
    await call('PATCH', `/tickets/${t.id}`, ADMIN, { status: 'resolved' })
    expect(
      (await rejection(call('POST', `/tickets/${t.id}/feedback`, ADMIN, { rating: 5 }))).status,
    ).toBe(403)
    await call('POST', `/tickets/${t.id}/feedback`, USER, { rating: 4, comment: 'ok' })
    expect(
      (await rejection(call('POST', `/tickets/${t.id}/feedback`, USER, { rating: 4 }))).status,
    ).toBe(409)
    const detail = await call<{ feedback: { rating: number } }>('GET', `/tickets/${t.id}`, USER)
    expect(detail.feedback.rating).toBe(4)
  })

  it('reports partial failures on bulk updates', async () => {
    const t = await newTicket(USER, 'Password reset', 'Bulk me')
    const result = await call<{ updated: number[]; failed: { id: number }[] }>(
      'POST',
      '/tickets/bulk',
      ADMIN,
      {
        ticket_ids: [t.id, 99999],
        status: 'in_progress',
        priority: 'high',
        assignee_id: 'tech-2',
      },
    )
    expect(result.updated).toEqual([t.id])
    expect(result.failed.map((f) => f.id)).toEqual([99999])
    const after = await call<T>('GET', `/tickets/${t.id}`, ADMIN)
    expect([after.status, after.priority, after.assigned_to_id]).toEqual([
      'in_progress',
      'high',
      'tech-2',
    ])
  })

  it('keeps admin endpoints admin-only', async () => {
    for (const path of ['/reports', '/dashboard', '/sla-rules', '/staff']) {
      expect((await rejection(call('GET', path, TECH))).status).toBe(403)
      expect(await call('GET', path, ADMIN)).toBeTruthy()
    }
  })

  it('applies custom SLA targets', async () => {
    const rules = await call<{ category_id: number; custom: boolean }[]>(
      'PUT',
      '/sla-rules/3',
      ADMIN,
      { response_hours: 2, resolution_hours: 8 },
    )
    expect(rules.find((r) => r.category_id === 3)!.custom).toBe(true)
    expect(
      (
        await rejection(
          call('PUT', '/sla-rules/3', ADMIN, { response_hours: 9, resolution_hours: 2 }),
        )
      ).status,
    ).toBe(422)
    await call('DELETE', '/sla-rules/3', ADMIN)
    const after = await call<{ category_id: number; custom: boolean }[]>('GET', '/sla-rules', ADMIN)
    expect(after.find((r) => r.category_id === 3)!.custom).toBe(false)
  })

  it('hides draft articles from regular users and ranks search results', async () => {
    const user = await call<{ items: { title: string; published: boolean }[] }>(
      'GET',
      '/kb/articles?page=1',
      USER,
    )
    expect(user.items.every((a) => a.published)).toBe(true)
    const admin = await call<{ items: { published: boolean }[] }>(
      'GET',
      '/kb/articles?page=1',
      ADMIN,
    )
    expect(admin.items.some((a) => !a.published)).toBe(true)
    const hits = await call<{ items: { title: string }[] }>(
      'GET',
      '/kb/articles?q=vpn&page=1',
      USER,
    )
    expect(hits.items[0].title).toBe('Connecting to the VPN')
  })

  it('simulates AI categorization from keywords', async () => {
    const r = await call<{ subcategory_id: number; urgency: string }>(
      'POST',
      '/ai/categorize',
      USER,
      { title: 'Printer jam', description: 'urgent, paper stuck' },
    )
    const subs = await call<{ id: number; name: string }[]>(
      'GET',
      '/categories/2/subcategories',
      USER,
    )
    expect(subs.find((s) => s.id === r.subcategory_id)!.name).toBe('Printer issue')
    expect(r.urgency).toBe('high')
  })
})
