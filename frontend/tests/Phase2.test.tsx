import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import App from '../src/App'
import TicketDetail from '../src/pages/TicketDetail'
import { tokenStore } from '../src/services/api'
import { mockFetch, renderApp } from './helpers'

const users = {
  admin: { id: 'admin-1', name: 'Admin User', email: 'a@x', role: 'admin' },
  tech: { id: 'tech-1', name: 'Tina Tech', email: 't@x', role: 'tech' },
  user: { id: 'user-1', name: 'John', email: 'j@x', role: 'user' },
}
const staff = [
  { id: 'tech-1', name: 'Tina Tech', email: 't@x', role: 'tech' },
  { id: 'tech-2', name: 'Tom Tech', email: 'to@x', role: 'tech' },
  { id: 'admin-1', name: 'Admin User', email: 'a@x', role: 'admin' },
]
const ticket = (id: number, extra: Record<string, unknown> = {}) => ({
  id,
  title: `Ticket ${id}`,
  description: 'desc',
  user_id: 'user-1',
  category_id: 1,
  status: 'open',
  priority: 'medium',
  urgency: 'medium',
  created_at: '2026-10-07T10:00:00',
  updated_at: '2026-10-07T10:00:00',
  reopen_count: 0,
  assigned_to_id: null,
  sla_status: 'ok',
  sla_response_due: '2026-10-08T10:00:00',
  sla_resolution_due: '2026-10-10T10:00:00',
  ...extra,
})
const page = (items: unknown[]) => ({ items, total: items.length, page: 1, page_size: 20 })
const lastQuery = (calls: { url: string }[], path = '/tickets?') =>
  new URLSearchParams(
    calls
      .filter((c) => c.url.includes(path))
      .at(-1)!
      .url.split('?')[1],
  )

describe('tech staff', () => {
  afterEach(() => tokenStore.clear())

  it('can sign in as tech and sees only the assigned-tickets link', async () => {
    tokenStore.set('demo-token-tech-1')
    mockFetch({
      'GET /me': users.tech,
      'GET /categories': [],
      'GET /tickets?assignee_id=tech-1&page=1': page([ticket(3, { assigned_to_id: 'tech-1' })]),
    })
    renderApp(<App />, '/tickets/assigned')
    expect(await screen.findByRole('heading', { name: 'Assigned to me' })).toBeInTheDocument()
    expect(await screen.findByText('Ticket 3')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'All Tickets' })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Filter by assignee')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Filter by priority')).toBeInTheDocument()
  })

  it('redirects regular users away from the assigned page', async () => {
    tokenStore.set('demo-token-user-1')
    mockFetch({
      'GET /me': users.user,
      'GET /categories': [],
      'GET /tickets?mine=true&page=1': page([]),
    })
    renderApp(<App />, '/tickets/assigned')
    expect(await screen.findByRole('heading', { name: 'My Tickets' })).toBeInTheDocument()
  })

  it('offers the tech demo user on the sign-in screen', async () => {
    mockFetch({})
    renderApp(<App />, '/login')
    expect(await screen.findByRole('option', { name: 'Tina Tech (tech)' })).toBeInTheDocument()
  })

  function detail(user: typeof users.tech, assignedTo: string | null) {
    tokenStore.set('demo-token-x')
    mockFetch({
      'GET /me': user,
      'GET /tickets/9': {
        ...ticket(9, { assigned_to_id: assignedTo }),
        extra_fields: [],
        attachments: [],
      },
      'GET /tickets/9/comments': [],
      'GET /tickets/9/history': [],
    })
    renderApp(
      <Routes>
        <Route path="/tickets/:id" element={<TicketDetail />} />
      </Routes>,
      '/tickets/9',
    )
  }

  it('lets tech work an assigned ticket but not reassign it', async () => {
    detail(users.tech, 'tech-1')
    expect(await screen.findByLabelText('Status')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'History' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Assignee')).not.toBeInTheDocument()
    expect(screen.getByText(/SLA: ok/)).toBeInTheDocument()
  })

  it('gives tech no controls on a ticket assigned to someone else', async () => {
    detail(users.tech, 'tech-2')
    expect(await screen.findByText(/Ticket 9/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Status')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'History' })).not.toBeInTheDocument()
  })
})

describe('admin assignment, filters, bulk, reports', () => {
  beforeEach(() => tokenStore.set('demo-token-admin-1'))
  afterEach(() => tokenStore.clear())

  it('assigns from the ticket detail without touching status', async () => {
    tokenStore.set('demo-token-admin-1')
    const calls = mockFetch({
      'GET /me': users.admin,
      'GET /staff': staff,
      'GET /tickets/9': { ...ticket(9), extra_fields: [], attachments: [] },
      'GET /tickets/9/comments': [],
      'GET /tickets/9/history': [],
      'PUT /tickets/9/assignee': ticket(9, { assigned_to_id: 'tech-2' }),
    })
    renderApp(
      <Routes>
        <Route path="/tickets/:id" element={<TicketDetail />} />
      </Routes>,
      '/tickets/9',
    )
    const select = await screen.findByLabelText('Assignee')
    expect(within(select).getByRole('option', { name: 'Unassigned (current)' })).toBeInTheDocument()
    await waitFor(() =>
      expect(within(select).getByRole('option', { name: 'Tom Tech' })).toBeInTheDocument(),
    )
    await userEvent.selectOptions(select, 'tech-2')
    await userEvent.click(screen.getByRole('button', { name: 'Update ticket' }))
    await waitFor(() => {
      const put = calls.find((c) => c.init?.method === 'PUT')!
      expect(JSON.parse(put.init!.body as string)).toEqual({ assignee_id: 'tech-2' })
    })
    expect(calls.some((c) => c.init?.method === 'PATCH')).toBe(false)
  })

  it('sends the staff filters to the API and shows assignee and SLA columns', async () => {
    const calls = mockFetch({
      'GET /me': users.admin,
      'GET /categories': [],
      'GET /staff': staff,
      'GET /tickets?page=1': page([ticket(1, { assigned_to_id: 'tech-1', sla_status: 'at_risk' })]),
    })
    const user = userEvent.setup()
    renderApp(<App />, '/admin/tickets')
    expect(await screen.findByText('at risk')).toBeInTheDocument()
    expect(screen.getByText('tech-1')).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Filter by priority'), 'urgent')
    await user.selectOptions(screen.getByLabelText('Filter by assignee'), '__none__')
    await user.type(screen.getByLabelText('Created from'), '2026-10-01')
    await user.type(screen.getByLabelText('Created to'), '2026-10-31')
    await user.click(screen.getByLabelText('SLA breached'))
    await waitFor(() => {
      const q = lastQuery(calls)
      expect(Object.fromEntries(q)).toMatchObject({
        priority: 'urgent',
        unassigned: 'true',
        created_from: '2026-10-01',
        created_to: '2026-10-31',
        sla_breached: 'true',
      })
    })
    await user.selectOptions(screen.getByLabelText('Filter by assignee'), 'tech-2')
    await waitFor(() => {
      const q = lastQuery(calls)
      expect(q.get('assignee_id')).toBe('tech-2')
      expect(q.has('unassigned')).toBe(false)
    })
  })

  function bulkSetup(result: unknown) {
    const calls = mockFetch({
      'GET /me': users.admin,
      'GET /categories': [],
      'GET /staff': staff,
      'GET /tickets?page=1': page([ticket(1), ticket(2)]),
      'POST /tickets/bulk': result,
    })
    renderApp(<App />, '/admin/tickets')
    return calls
  }

  it('applies a bulk action to the selected tickets', async () => {
    const calls = bulkSetup({ updated: [1, 2], failed: [] })
    const user = userEvent.setup()
    await screen.findByText('Ticket 1')
    expect(screen.queryByLabelText('Bulk status')).not.toBeInTheDocument()

    await user.click(screen.getByLabelText('Select all tickets'))
    const apply = screen.getByRole('button', { name: 'Apply to 2 tickets' })
    expect(apply).toBeDisabled()
    await user.selectOptions(screen.getByLabelText('Bulk status'), 'in_progress')
    await user.selectOptions(screen.getByLabelText('Bulk priority'), 'high')
    await waitFor(() =>
      expect(
        within(screen.getByLabelText('Bulk assignee')).getByRole('option', { name: 'Tom Tech' }),
      ).toBeInTheDocument(),
    )
    await user.selectOptions(screen.getByLabelText('Bulk assignee'), 'tech-2')
    await user.click(apply)
    await waitFor(() => {
      const post = calls.find((c) => c.url.endsWith('/tickets/bulk'))!
      expect(JSON.parse(post.init!.body as string)).toEqual({
        ticket_ids: [1, 2],
        status: 'in_progress',
        priority: 'high',
        assignee_id: 'tech-2',
      })
    })
    await waitFor(() => expect(screen.queryByLabelText('Bulk status')).not.toBeInTheDocument())
    expect(screen.queryByText(/not updated/)).not.toBeInTheDocument()
  })

  it('reports tickets a bulk action could not update', async () => {
    bulkSetup({
      updated: [1],
      failed: [{ id: 2, reason: 'Cannot move ticket from closed to open' }],
    })
    const user = userEvent.setup()
    await screen.findByText('Ticket 1')
    await user.click(screen.getByLabelText('Select ticket #1'))
    await user.click(screen.getByLabelText('Select ticket #2'))
    expect(screen.getByRole('button', { name: 'Apply to 2 tickets' })).toBeInTheDocument()
    await user.click(screen.getByLabelText('Select ticket #2'))
    expect(screen.getByRole('button', { name: 'Apply to 1 ticket' })).toBeInTheDocument()
    await user.click(screen.getByLabelText('Select ticket #2'))
    await user.selectOptions(screen.getByLabelText('Bulk status'), 'open')
    await user.click(screen.getByRole('button', { name: 'Apply to 2 tickets' }))
    expect(await screen.findByText(/Some tickets were not updated/)).toHaveTextContent(
      '#2: Cannot move ticket from closed to open',
    )
  })

  it('renders the reports page with assignee names', async () => {
    mockFetch({
      'GET /me': users.admin,
      'GET /staff': staff,
      'GET /reports': {
        open_count: 4,
        resolved_count: 6,
        avg_resolution_hours: 12.5,
        avg_first_response_hours: null,
        response_sla_met_pct: 90,
        resolution_sla_met_pct: null,
        unassigned_open: 1,
        by_assignee: [{ assignee_id: 'tech-1', open: 3, resolved: 5 }],
      },
    })
    renderApp(<App />, '/admin/reports')
    expect(await screen.findByRole('heading', { name: 'Reports' })).toBeInTheDocument()
    expect(screen.getByText('Response SLA met').nextSibling).toHaveTextContent('90%')
    expect(screen.getByText('Resolution SLA met').nextSibling).toHaveTextContent('—')
    expect(await screen.findByText('Tina Tech')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Reports' })).toBeInTheDocument()
  })

  it('keeps tech and users out of reports', async () => {
    tokenStore.set('demo-token-tech-1')
    mockFetch({
      'GET /me': users.tech,
      'GET /categories': [],
      'GET /tickets?mine=true&page=1': page([]),
    })
    renderApp(<App />, '/admin/reports')
    expect(await screen.findByRole('heading', { name: 'My Tickets' })).toBeInTheDocument()
  })
})
