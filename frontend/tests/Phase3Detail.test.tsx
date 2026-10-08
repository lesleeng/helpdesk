import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import TicketDetail from '../src/pages/TicketDetail'
import TicketForm from '../src/components/TicketForm/TicketForm'
import { tokenStore } from '../src/services/api'
import { mockFetch, renderApp } from './helpers'

const people = {
  admin: { id: 'admin-1', name: 'Admin User', email: 'a@x', role: 'admin' },
  tech: { id: 'tech-1', name: 'Tina Tech', email: 't@x', role: 'tech' },
  owner: { id: 'user-1', name: 'John', email: 'j@x', role: 'user' },
  manager: { id: 'manager-1', name: 'Maria', email: 'm@x', role: 'user' },
}
const ticket = (extra: Record<string, unknown> = {}) => ({
  id: 9,
  title: 'Need Finance share',
  description: 'Please grant access',
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
  extra_fields: [],
  attachments: [],
  feedback: null,
  ...extra,
})
const article = (id: number, title = `Article ${id}`, published = true) => ({
  id,
  title,
  body: 'b',
  tags: null,
  category_id: null,
  published,
  created_by_id: 'admin-1',
  created_at: '2026-10-01T10:00:00',
  updated_at: '2026-10-01T10:00:00',
})

function open(as: keyof typeof people, ticketBody: unknown, routes: Record<string, unknown> = {}) {
  tokenStore.set('demo-token-x')
  const calls = mockFetch({
    'GET /me': people[as],
    'GET /staff': [],
    'GET /tickets/9': ticketBody,
    'GET /tickets/9/comments': [],
    'GET /tickets/9/history': [],
    'GET /tickets/9/kb': [],
    'GET /tickets/9/duplicates': [],
    'GET /kb/articles?page=1&page_size=100': { items: [], total: 0, page: 1, page_size: 100 },
    'GET /ai/status': { enabled: false, model: 'm' },
    ...routes,
  })
  renderApp(
    <Routes>
      <Route path="/tickets/:id" element={<TicketDetail />} />
    </Routes>,
    '/tickets/9',
  )
  return calls
}

afterEach(() => tokenStore.clear())

describe('approval on the ticket', () => {
  const pending = ticket({ approval_status: 'pending', approver_id: 'manager-1' })

  it('lets the approver approve with a comment', async () => {
    const calls = open('manager', pending, {
      'POST /tickets/9/approval': ticket({ approval_status: 'approved' }),
    })
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText('Approval comment'), 'Fine by me')
    await user.click(screen.getByRole('button', { name: 'Approve' }))
    await waitFor(() => {
      const post = calls.find((c) => c.url.endsWith('/approval'))!
      expect(JSON.parse(post.init!.body as string)).toEqual({
        decision: 'approve',
        comment: 'Fine by me',
      })
    })
  })

  it('lets the approver reject', async () => {
    const calls = open('manager', pending, {
      'POST /tickets/9/approval': ticket({ approval_status: 'rejected' }),
    })
    await userEvent.click(await screen.findByRole('button', { name: 'Reject' }))
    await waitFor(() => {
      const post = calls.find((c) => c.url.endsWith('/approval'))!
      expect(JSON.parse(post.init!.body as string)).toMatchObject({ decision: 'reject' })
    })
  })

  it('shows the requester the status but no decision buttons', async () => {
    open('owner', pending)
    expect(await screen.findByText('Approval: pending')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument()
  })

  it('does not let an admin approve their own request', async () => {
    open('admin', ticket({ user_id: 'admin-1', approval_status: 'pending', approver_id: null }))
    expect(await screen.findByText('Approval: pending')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument()
  })

  it('lets an admin decide when there is no manager', async () => {
    open('admin', ticket({ approval_status: 'pending', approver_id: null }))
    expect(await screen.findByRole('button', { name: 'Approve' })).toBeInTheDocument()
  })

  it('only offers cancelling while approval is pending', async () => {
    open('admin', pending)
    const status = await screen.findByLabelText('Status')
    expect(Array.from((status as HTMLSelectElement).options).map((o) => o.text)).toEqual([
      'Open (current)',
      'Cancelled',
    ])
  })

  it('shows the decision and comment afterwards', async () => {
    open('owner', ticket({ approval_status: 'rejected', approval_comment: 'Not needed' }))
    expect(await screen.findByText('Approval: rejected · Not needed')).toBeInTheDocument()
  })
})

describe('feedback survey', () => {
  const resolved = ticket({ status: 'resolved' })

  it('lets the requester rate a resolved ticket once', async () => {
    const calls = open('owner', resolved, {
      'POST /tickets/9/feedback': {
        rating: 4,
        comment: 'Quick',
        created_at: '2026-10-08T10:00:00',
      },
    })
    const user = userEvent.setup()
    await screen.findByRole('heading', { name: 'How did we do?' })
    await user.selectOptions(screen.getByLabelText('Rating'), '4')
    await user.type(screen.getByLabelText('Comment'), 'Quick')
    await user.click(screen.getByRole('button', { name: 'Send feedback' }))
    await waitFor(() => {
      const post = calls.find((c) => c.url.endsWith('/feedback'))!
      expect(JSON.parse(post.init!.body as string)).toEqual({ rating: 4, comment: 'Quick' })
    })
  })

  it('shows the rating instead of the form once given', async () => {
    open(
      'owner',
      ticket({ status: 'closed', feedback: { rating: 5, comment: 'Great', created_at: 'x' } }),
    )
    expect(await screen.findByText('Rating: 5/5 · Great')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'How did we do?' })).not.toBeInTheDocument()
  })

  it('does not ask anyone but the requester, or before resolution', async () => {
    open('admin', resolved)
    await screen.findByText(/Need Finance share/)
    expect(screen.queryByRole('heading', { name: 'How did we do?' })).not.toBeInTheDocument()
  })

  it('does not ask while the ticket is still open', async () => {
    open('owner', ticket())
    await screen.findByText(/Need Finance share/)
    expect(screen.queryByRole('heading', { name: 'How did we do?' })).not.toBeInTheDocument()
  })
})

describe('knowledge base links and duplicates', () => {
  const assigned = ticket({ assigned_to_id: 'tech-1' })

  it('lets staff link and remove articles', async () => {
    const calls = open('tech', assigned, {
      'GET /tickets/9/kb': [article(1, 'Connect to VPN')],
      'GET /kb/articles?page=1&page_size=100': {
        items: [
          article(1, 'Connect to VPN'),
          article(2, 'Reset password'),
          article(3, 'Hidden draft', false),
        ],
        total: 3,
        page: 1,
        page_size: 100,
      },
      'POST /tickets/9/kb': [article(1), article(2)],
      'DELETE /tickets/9/kb/1': [],
    })
    const user = userEvent.setup()
    expect(await screen.findByRole('link', { name: 'Connect to VPN' })).toHaveAttribute(
      'href',
      '/kb/1',
    )

    const picker = screen.getByLabelText('Link an article')
    await waitFor(() =>
      expect(within(picker).getByRole('option', { name: 'Reset password' })).toBeInTheDocument(),
    )
    const options = Array.from((picker as HTMLSelectElement).options).map((o) => o.text)
    expect(options).toEqual(['Link an article…', 'Reset password']) // not already linked, not a draft
    await user.selectOptions(picker, '2')
    await user.click(screen.getByRole('button', { name: 'Link' }))
    await waitFor(() => {
      const post = calls.find((c) => c.init?.method === 'POST' && c.url.endsWith('/kb'))!
      expect(JSON.parse(post.init!.body as string)).toEqual({ article_id: 2 })
    })

    await user.click(screen.getByRole('button', { name: 'Remove Connect to VPN' }))
    await waitFor(() => expect(calls.some((c) => c.init?.method === 'DELETE')).toBe(true))
  })

  it('shows requesters their linked articles read-only', async () => {
    open('owner', ticket(), { 'GET /tickets/9/kb': [article(1, 'Connect to VPN')] })
    expect(await screen.findByRole('link', { name: 'Connect to VPN' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Link an article')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Remove/ })).not.toBeInTheDocument()
  })

  it('hides the knowledge base card from requesters when nothing is linked', async () => {
    open('owner', ticket())
    await screen.findByText(/Need Finance share/)
    expect(screen.queryByRole('heading', { name: 'Knowledge base' })).not.toBeInTheDocument()
  })

  it('lists possible duplicates for staff only', async () => {
    open('tech', assigned, {
      'GET /tickets/9/duplicates': [
        { id: 4, title: 'Finance drive access', status: 'in_progress', score: 0.52 },
      ],
    })
    const link = await screen.findByRole('link', { name: '#4 Finance drive access' })
    expect(link).toHaveAttribute('href', '/tickets/4')
    expect(screen.getByText(/in progress · 52% similar/)).toBeInTheDocument()
  })
})

describe('suggested reply', () => {
  const assigned = ticket({ assigned_to_id: 'tech-1' })

  it('drafts a reply into the comment box when AI is on', async () => {
    open('tech', assigned, {
      'GET /ai/status': { enabled: true, model: 'm' },
      'POST /tickets/9/ai/suggest-response': {
        draft: 'Hi John, see the guide.',
        used_article_ids: [1],
        articles: [article(1)],
      },
    })
    await userEvent.click(await screen.findByRole('button', { name: 'Suggest reply' }))
    expect(await screen.findByDisplayValue('Hi John, see the guide.')).toBeInTheDocument()
    expect(screen.getByText(/Draft written by AI from 1 article\. Review it/)).toBeInTheDocument()
  })

  it('has no button when AI is off, or for requesters', async () => {
    open('tech', assigned)
    await screen.findByText(/Need Finance share/)
    expect(screen.queryByRole('button', { name: 'Suggest reply' })).not.toBeInTheDocument()
  })

  it('shows requesters no AI controls even when AI is on', async () => {
    open('owner', ticket(), { 'GET /ai/status': { enabled: true, model: 'm' } })
    await screen.findByText(/Need Finance share/)
    expect(screen.queryByRole('button', { name: 'Suggest reply' })).not.toBeInTheDocument()
  })

  it('shows an error when the draft fails', async () => {
    open('tech', assigned, { 'GET /ai/status': { enabled: true, model: 'm' } })
    await userEvent.click(await screen.findByRole('button', { name: 'Suggest reply' }))
    expect(await screen.findByText(/no mock POST/)).toBeInTheDocument()
  })
})

describe('ticket form assistance', () => {
  const cats = [
    { id: 1, name: 'Service Request' },
    { id: 2, name: 'Incident' },
  ]
  const subs = [
    {
      id: 5,
      category_id: 1,
      name: 'Access request',
      requires_approval: true,
      extra_fields_template: { fields: [] },
    },
    {
      id: 6,
      category_id: 1,
      name: 'Password reset',
      requires_approval: false,
      extra_fields_template: { fields: [] },
    },
  ]
  const base = {
    'GET /me': people.owner,
    'GET /categories': cats,
    'GET /categories/1/subcategories': subs,
  }

  it('warns when the chosen request type needs manager approval', async () => {
    tokenStore.set('t')
    mockFetch({ ...base, 'GET /ai/status': { enabled: false, model: 'm' } })
    const user = userEvent.setup()
    renderApp(<TicketForm onCreated={() => {}} />)
    await screen.findByRole('option', { name: 'Service Request' })
    await user.selectOptions(screen.getByLabelText('Category'), '1')
    await screen.findByRole('option', { name: 'Access request' })
    await user.selectOptions(screen.getByLabelText('Request type'), '5')
    expect(screen.getByText(/needs your manager's approval/)).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Request type'), '6')
    expect(screen.queryByText(/needs your manager's approval/)).not.toBeInTheDocument()
  })

  it('has no AI button when AI is off', async () => {
    mockFetch({ ...base, 'GET /ai/status': { enabled: false, model: 'm' } })
    renderApp(<TicketForm onCreated={() => {}} />)
    await screen.findByRole('option', { name: 'Service Request' })
    expect(screen.queryByRole('button', { name: 'Suggest category' })).not.toBeInTheDocument()
  })

  it('fills category, request type and urgency from the AI suggestion', async () => {
    const calls = mockFetch({
      ...base,
      'GET /ai/status': { enabled: true, model: 'm' },
      'POST /ai/categorize': {
        category_id: 1,
        subcategory_id: 5,
        urgency: 'high',
        reasoning: 'Needs access',
      },
    })
    const user = userEvent.setup()
    renderApp(<TicketForm onCreated={() => {}} />)
    const button = await screen.findByRole('button', { name: 'Suggest category' })
    expect(button).toBeDisabled() // nothing typed yet
    await user.type(screen.getByLabelText('Title'), 'Need share')
    await user.type(screen.getByLabelText('Description'), 'Finance drive')
    await user.click(button)
    expect(await screen.findByText('Suggested: Needs access')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText('Request type')).toHaveValue('5'))
    expect(screen.getByLabelText('Category')).toHaveValue('1')
    expect(screen.getByLabelText('Urgency')).toHaveValue('high')
    const post = calls.find((c) => c.url.endsWith('/ai/categorize'))!
    expect(JSON.parse(post.init!.body as string)).toEqual({
      title: 'Need share',
      description: 'Finance drive',
    })
  })

  it('suggests related articles while typing', async () => {
    mockFetch({
      ...base,
      'GET /ai/status': { enabled: false, model: 'm' },
      'GET /kb/suggest?q=VPN+drops': [article(1, 'Connecting to the VPN')],
    })
    renderApp(<TicketForm onCreated={() => {}} />)
    await userEvent.type(await screen.findByLabelText('Title'), 'VPN drops')
    const link = await screen.findByRole('link', { name: 'Connecting to the VPN' })
    expect(link).toHaveAttribute('href', '/kb/1')
    expect(link).toHaveAttribute('target', '_blank')
  })
})
