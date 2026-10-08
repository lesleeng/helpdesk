import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../src/App'
import TicketForm from '../src/components/TicketForm/TicketForm'
import { tokenStore } from '../src/services/api'
import { mockFetch, renderApp } from './helpers'

const admin = { id: 'admin-1', name: 'Admin User', email: 'a@x', role: 'admin' }
const user = { id: 'user-1', name: 'John', email: 'j@x', role: 'user' }
const lastBody = (
  calls: { url: string; init?: RequestInit }[],
  match: (u: string, m?: string) => boolean,
) => JSON.parse(calls.filter((c) => match(c.url, c.init?.method)).at(-1)!.init!.body as string)

beforeEach(() => tokenStore.set('t'))
afterEach(() => tokenStore.clear())

// ---------------------------------------------------------------- analytics
const analytics = (days = 30) => ({
  days,
  totals: {
    created: 12,
    resolved: 9,
    avg_first_response_hours: 1.5,
    avg_resolution_hours: 20.25,
    reopen_rate_pct: 8.3,
  },
  volume: Array.from({ length: 7 }, (_, i) => ({
    date: `2026-10-0${i + 1}`,
    created: i,
    resolved: i > 2 ? 1 : 0,
  })),
  backlog_age: [
    { bucket: 'Under 1 day', count: 3 },
    { bucket: '1-3 days', count: 2 },
    { bucket: '3-7 days', count: 0 },
    { bucket: 'Over 7 days', count: 1 },
  ],
  resolution_by_category: [{ category: 'Incident', avg_hours: 12.5, resolved: 4 }],
  sla_by_week: [{ week_start: '2026-09-28', met: 3, total: 4, pct: 75 }],
  satisfaction_by_week: [{ week_start: '2026-09-28', avg_rating: 4.5, count: 2 }],
})

describe('analytics page', () => {
  it('shows totals and a chart for each question', async () => {
    mockFetch({
      'GET /me': admin,
      'GET /ai/status': { enabled: false, model: 'm' },
      'GET /analytics?days=30': analytics(),
    })
    renderApp(<App />, '/admin/analytics')
    expect(await screen.findByRole('heading', { name: 'Analytics' })).toBeInTheDocument()
    expect(screen.getByText('Tickets created').nextSibling).toHaveTextContent('12')
    expect(screen.getByText('Reopen rate').nextSibling).toHaveTextContent('8.3%')
    for (const title of [
      'Tickets created and resolved',
      'Open tickets by age',
      'Average resolution time by category',
      'Resolved within the SLA, by week',
      'Satisfaction by week',
    ]) {
      expect(screen.getByRole('heading', { name: title })).toBeInTheDocument()
    }
    expect(screen.getByRole('list', { name: 'Legend' })).toHaveTextContent('Created')
    expect(screen.getByRole('list', { name: 'Open tickets by age' })).toHaveTextContent(
      'Over 7 days',
    )
  })

  it('reloads for another range', async () => {
    const calls = mockFetch({
      'GET /me': admin,
      'GET /ai/status': { enabled: false, model: 'm' },
      'GET /analytics?days=30': analytics(),
      'GET /analytics?days=90': analytics(90),
    })
    renderApp(<App />, '/admin/analytics')
    await userEvent.selectOptions(await screen.findByLabelText('Time range'), '90')
    await waitFor(() => expect(calls.some((c) => c.url.endsWith('days=90'))).toBe(true))
    expect(screen.getByRole('heading', { name: 'Analytics' })).toBeInTheDocument() // frame kept while loading
  })

  it('says so when there is nothing to chart', async () => {
    const empty = {
      ...analytics(),
      resolution_by_category: [],
      sla_by_week: [],
      satisfaction_by_week: [],
    }
    mockFetch({
      'GET /me': admin,
      'GET /ai/status': { enabled: false, model: 'm' },
      'GET /analytics?days=30': empty,
    })
    renderApp(<App />, '/admin/analytics')
    expect((await screen.findAllByText('No tickets were resolved in this period.')).length).toBe(2)
    expect(screen.getByText('No feedback was received in this period.')).toBeInTheDocument()
  })

  it('offers each chart as a table', async () => {
    mockFetch({
      'GET /me': admin,
      'GET /ai/status': { enabled: false, model: 'm' },
      'GET /analytics?days=30': analytics(),
    })
    renderApp(<App />, '/admin/analytics')
    const section = (
      await screen.findByRole('heading', { name: 'Resolved within the SLA, by week' })
    ).closest('section')!
    await userEvent.click(within(section).getByRole('button', { name: 'Show table' }))
    expect(within(section).getByRole('cell', { name: '75%' })).toBeInTheDocument()
  })

  it('downloads the ticket export', async () => {
    const created = vi.fn(() => 'blob:x')
    const revoked = vi.fn()
    Object.assign(URL, { createObjectURL: created, revokeObjectURL: revoked })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    mockFetch({
      'GET /me': admin,
      'GET /ai/status': { enabled: false, model: 'm' },
      'GET /analytics?days=30': analytics(),
      'GET /reports/tickets.csv': 'id,title\n1,Printer',
    })
    renderApp(<App />, '/admin/analytics')
    await userEvent.click(await screen.findByRole('button', { name: 'Export tickets (CSV)' }))
    await waitFor(() => expect(click).toHaveBeenCalled())
    expect(created).toHaveBeenCalledTimes(1)
    expect(revoked).toHaveBeenCalledWith('blob:x')
    click.mockRestore()
  })

  it('is for admins only', async () => {
    mockFetch({
      'GET /me': user,
      'GET /ai/status': { enabled: false, model: 'm' },
      'GET /categories': [],
      'GET /tickets?mine=true&page=1': { items: [], total: 0, page: 1, page_size: 20 },
    })
    renderApp(<App />, '/admin/analytics')
    expect(await screen.findByRole('heading', { name: 'My Tickets' })).toBeInTheDocument()
  })
})

// -------------------------------------------------------------- integrations
const status = {
  slack_enabled: false,
  webhook_events: ['ticket.created', 'ticket.assigned'],
  allow_private_webhooks: false,
}
const hook = (extra: Record<string, unknown> = {}) => ({
  id: 1,
  name: 'CI',
  url: 'https://example.com/hook',
  events: ['*'],
  active: true,
  created_at: '2026-10-01T10:00:00',
  last_status: 'success',
  last_delivery_at: '2026-10-02T10:00:00',
  ...extra,
})
const base = {
  'GET /me': admin,
  'GET /ai/status': { enabled: false, model: 'm' },
  'GET /integrations': status,
}

describe('integrations page', () => {
  it('explains how to turn on Slack and shows the empty state', async () => {
    mockFetch({ ...base, 'GET /webhooks': [] })
    renderApp(<App />, '/admin/integrations')
    expect(await screen.findByText(/Slack notifications are off/)).toHaveTextContent(
      'SLACK_WEBHOOK_URL',
    )
    expect(await screen.findByText('No webhooks yet.')).toBeInTheDocument()
    expect(screen.getByText(/internal networks are blocked/)).toBeInTheDocument()
  })

  it('reports Slack as on', async () => {
    mockFetch({
      ...base,
      'GET /integrations': { ...status, slack_enabled: true },
      'GET /webhooks': [],
    })
    renderApp(<App />, '/admin/integrations')
    expect(await screen.findByText(/Slack notifications are on/)).toBeInTheDocument()
  })

  it('lists webhooks with their last result', async () => {
    mockFetch({
      ...base,
      'GET /webhooks': [
        hook(),
        hook({
          id: 2,
          name: 'Audit',
          events: ['ticket.created', 'ticket.assigned'],
          active: false,
          last_status: null,
        }),
      ],
    })
    renderApp(<App />, '/admin/integrations')
    expect(await screen.findByText('ticket.created, ticket.assigned')).toBeInTheDocument()
    expect(screen.getAllByText('All events').length).toBeGreaterThan(0)
    expect(screen.getByText('ticket.created, ticket.assigned')).toBeInTheDocument()
    expect(screen.getByText('Disabled')).toBeInTheDocument()
    expect(screen.getByText('success')).toBeInTheDocument()
  })

  it('adds a webhook for all events and shows the secret once', async () => {
    const calls = mockFetch({
      ...base,
      'GET /webhooks': [],
      'POST /webhooks': { ...hook(), secret: 'whsec_abc123' },
    })
    const user = userEvent.setup()
    renderApp(<App />, '/admin/integrations')
    await user.type(await screen.findByLabelText('Name'), 'CI')
    await user.type(screen.getByLabelText('URL'), 'https://example.com/hook')
    await user.click(screen.getByRole('button', { name: 'Add webhook' }))
    expect(await screen.findByLabelText('Signing secret')).toHaveValue('whsec_abc123')
    expect(lastBody(calls, (u, m) => m === 'POST' && u.endsWith('/webhooks'))).toEqual({
      name: 'CI',
      url: 'https://example.com/hook',
      events: ['*'],
    })
    await user.click(screen.getByRole('button', { name: 'I have copied it' }))
    expect(screen.queryByLabelText('Signing secret')).not.toBeInTheDocument()
  })

  it('subscribes to chosen events only', async () => {
    const calls = mockFetch({
      ...base,
      'GET /webhooks': [],
      'POST /webhooks': { ...hook(), secret: 's' },
    })
    const user = userEvent.setup()
    renderApp(<App />, '/admin/integrations')
    await user.type(await screen.findByLabelText('Name'), 'Only some')
    await user.type(screen.getByLabelText('URL'), 'https://example.com/x')
    await user.click(screen.getByLabelText('All events'))
    await user.click(await screen.findByLabelText('ticket.assigned'))
    await user.click(screen.getByRole('button', { name: 'Add webhook' }))
    await waitFor(() =>
      expect(lastBody(calls, (u, m) => m === 'POST' && u.endsWith('/webhooks')).events).toEqual([
        'ticket.assigned',
      ]),
    )
  })

  it('shows the server reason when a URL is refused', async () => {
    mockFetch({
      ...base,
      'GET /webhooks': [],
      'POST /webhooks': { __status: 422, detail: 'URL points to a private or internal address' },
    })
    const user = userEvent.setup()
    renderApp(<App />, '/admin/integrations')
    await user.type(await screen.findByLabelText('Name'), 'Local')
    await user.type(screen.getByLabelText('URL'), 'http://10.0.0.5/hook')
    await user.click(screen.getByRole('button', { name: 'Add webhook' }))
    expect(
      await screen.findByText('URL points to a private or internal address'),
    ).toBeInTheDocument()
  })

  it('sends a test and shows the delivery log', async () => {
    mockFetch({
      ...base,
      'GET /webhooks': [hook()],
      'POST /webhooks/1/test': {
        id: 9,
        event: 'ping',
        status: 'pending',
        attempts: 0,
        created_at: '2026-10-02T10:00:00',
      },
      'GET /webhooks/1/deliveries': [
        {
          id: 9,
          event: 'ping',
          ticket_id: null,
          status: 'success',
          response_code: 200,
          attempts: 1,
          error: null,
          created_at: '2026-10-02T10:00:00',
        },
        {
          id: 8,
          event: 'ticket.created',
          ticket_id: 4,
          status: 'failed',
          response_code: 500,
          attempts: 3,
          error: 'Receiver answered HTTP 500',
          created_at: '2026-10-01T10:00:00',
        },
      ],
    })
    renderApp(<App />, '/admin/integrations')
    await userEvent.click(await screen.findByRole('button', { name: 'Send test to CI' }))
    expect(await screen.findByRole('heading', { name: 'Deliveries for CI' })).toBeInTheDocument()
    expect(await screen.findByText('success (HTTP 200)')).toBeInTheDocument()
    expect(screen.getByText(/failed \(HTTP 500\)/)).toHaveTextContent('Receiver answered HTTP 500')
    await userEvent.click(screen.getByRole('button', { name: 'Show deliveries for CI' }))
    expect(screen.queryByRole('heading', { name: 'Deliveries for CI' })).not.toBeInTheDocument()
  })

  it('disables a webhook and rotates its secret', async () => {
    const calls = mockFetch({
      ...base,
      'GET /webhooks': [hook()],
      'PATCH /webhooks/1': hook({ active: false }),
      'POST /webhooks/1/rotate-secret': { ...hook(), secret: 'whsec_new' },
    })
    const user = userEvent.setup()
    renderApp(<App />, '/admin/integrations')
    await user.click(await screen.findByRole('button', { name: 'Disable CI' }))
    await waitFor(() => expect(lastBody(calls, (_, m) => m === 'PATCH')).toEqual({ active: false }))
    await user.click(screen.getByRole('button', { name: 'New secret for CI' }))
    expect(await screen.findByLabelText('Signing secret')).toHaveValue('whsec_new')
  })

  it('deletes only after confirmation', async () => {
    const calls = mockFetch({ ...base, 'GET /webhooks': [hook()], 'DELETE /webhooks/1': undefined })
    const user = userEvent.setup()
    renderApp(<App />, '/admin/integrations')
    await user.click(await screen.findByRole('button', { name: 'Delete CI' }))
    expect(calls.some((c) => c.init?.method === 'DELETE')).toBe(false)
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await user.click(screen.getByRole('button', { name: 'Delete CI' }))
    await user.click(screen.getByRole('button', { name: 'Confirm delete CI' }))
    await waitFor(() => expect(calls.some((c) => c.init?.method === 'DELETE')).toBe(true))
  })
})

// ------------------------------------------------------------ request forms
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
    active: true,
    extra_fields_template: {
      fields: [{ name: 'asset_tag', label: 'Asset tag', type: 'text', required: true }],
    },
  },
  {
    id: 6,
    category_id: 1,
    name: 'Password reset',
    requires_approval: false,
    active: true,
    extra_fields_template: { fields: [] },
  },
]
const forms = {
  ...base,
  'GET /categories': cats,
  'GET /categories/1/subcategories?include_inactive=true': subs,
}

describe('request forms page', () => {
  it('lists request types with their settings', async () => {
    mockFetch(forms)
    renderApp(<App />, '/admin/forms')
    expect(await screen.findByRole('heading', { name: 'Request forms' })).toBeInTheDocument()
    expect(await screen.findByLabelText('Needs approval: Access request')).toBeChecked()
    expect(screen.getByLabelText('Needs approval: Password reset')).not.toBeChecked()
    expect(screen.getByLabelText('Available: Password reset')).toBeChecked()
  })

  it('changes approval and availability', async () => {
    const calls = mockFetch({ ...forms, 'PATCH /subcategories/6': subs[1] })
    const user = userEvent.setup()
    renderApp(<App />, '/admin/forms')
    await user.click(await screen.findByLabelText('Needs approval: Password reset'))
    await waitFor(() =>
      expect(lastBody(calls, (_, m) => m === 'PATCH')).toEqual({ requires_approval: true }),
    )
    await user.click(screen.getByLabelText('Available: Password reset'))
    await waitFor(() => expect(lastBody(calls, (_, m) => m === 'PATCH')).toEqual({ active: false }))
  })

  it('adds a request type', async () => {
    const calls = mockFetch({
      ...forms,
      'POST /categories/1/subcategories': { ...subs[1], id: 9, name: 'Docking station' },
    })
    const user = userEvent.setup()
    renderApp(<App />, '/admin/forms')
    const add = await screen.findByRole('button', { name: 'Add request type' })
    expect(add).toBeDisabled()
    await user.type(screen.getByLabelText('New request type'), 'Docking station')
    await user.click(screen.getAllByText('Needs manager approval').at(-1)!)
    await user.click(add)
    await waitFor(() =>
      expect(lastBody(calls, (u, m) => m === 'POST' && u.endsWith('/subcategories'))).toEqual({
        name: 'Docking station',
        requires_approval: true,
      }),
    )
  })

  it('shows a server refusal', async () => {
    mockFetch({
      ...forms,
      'POST /categories/1/subcategories': {
        __status: 409,
        detail: 'A request type with this name exists',
      },
    })
    const user = userEvent.setup()
    renderApp(<App />, '/admin/forms')
    await user.type(await screen.findByLabelText('New request type'), 'Password reset')
    await user.click(screen.getByRole('button', { name: 'Add request type' }))
    expect(await screen.findByText('A request type with this name exists')).toBeInTheDocument()
  })

  it('edits fields: keeps saved names, generates unique new ones, orders and saves', async () => {
    const calls = mockFetch({ ...forms, 'PUT /subcategories/5/fields': subs[0] })
    const user = userEvent.setup()
    renderApp(<App />, '/admin/forms')
    await user.click(await screen.findByRole('button', { name: 'Edit fields for Access request' }))
    expect(
      await screen.findByRole('heading', { name: 'Fields for Access request' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Label 1')).toHaveValue('Asset tag')
    expect(screen.getByLabelText('Required 1')).toBeChecked()

    await user.click(screen.getByRole('button', { name: 'Add field' }))
    await user.type(screen.getByLabelText('Label 2'), 'Asset tag')
    await user.click(screen.getByRole('button', { name: 'Add field' }))
    await user.type(screen.getByLabelText('Label 3'), 'Kind')
    await user.selectOptions(screen.getByLabelText('Type 3'), 'select')
    await user.type(screen.getByLabelText('Options 3'), 'laptop, phone, ')
    await user.click(screen.getByLabelText('Required 3'))
    await user.click(screen.getByRole('button', { name: 'Move field 3 up' }))
    await user.click(screen.getByRole('button', { name: 'Save form' }))

    await waitFor(() => {
      expect(lastBody(calls, (_, m) => m === 'PUT')).toEqual({
        fields: [
          { name: 'asset_tag', label: 'Asset tag', type: 'text', required: true },
          {
            name: 'kind',
            label: 'Kind',
            type: 'select',
            required: true,
            options: ['laptop', 'phone'],
          },
          { name: 'asset_tag_2', label: 'Asset tag', type: 'text', required: false },
        ],
      })
    })
  })

  it('explains what is missing before saving', async () => {
    const calls = mockFetch({ ...forms, 'PUT /subcategories/6/fields': subs[1] })
    const user = userEvent.setup()
    renderApp(<App />, '/admin/forms')
    await user.click(await screen.findByRole('button', { name: 'Edit fields for Password reset' }))
    expect(screen.getByText(/No fields yet/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Add field' }))
    await user.click(screen.getByRole('button', { name: 'Save form' }))
    expect(screen.getByText('Field 1 needs a label')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Label 1'), 'Pick one')
    await user.selectOptions(screen.getByLabelText('Type 1'), 'select')
    await user.click(screen.getByRole('button', { name: 'Save form' }))
    expect(screen.getByText('"Pick one" needs at least one option')).toBeInTheDocument()
    expect(calls.some((c) => c.init?.method === 'PUT')).toBe(false)
    await user.click(screen.getByRole('button', { name: 'Remove field 1' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(
      screen.queryByRole('heading', { name: 'Fields for Password reset' }),
    ).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------- assistant
describe('assistant page', () => {
  it('is unavailable when AI is off', async () => {
    mockFetch({ 'GET /me': user, 'GET /ai/status': { enabled: false, model: 'm' } })
    renderApp(<App />, '/assistant')
    expect(await screen.findByText(/assistant is not available/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Assistant' })).not.toBeInTheDocument()
  })

  const enabled = { 'GET /me': user, 'GET /ai/status': { enabled: true, model: 'm' } }
  const article = {
    id: 3,
    title: 'Reset your password',
    body: 'b',
    tags: null,
    published: true,
    created_by_id: 'a',
    created_at: 'x',
    updated_at: 'x',
  }

  it('answers with articles and keeps the conversation', async () => {
    let n = 0
    const calls = mockFetch({
      ...enabled,
      'POST /ai/chat': () =>
        ++n === 1
          ? { answer: 'Use the portal.', articles: [article], ticket_draft: null }
          : { answer: 'Anytime.', articles: [], ticket_draft: null },
    })
    const u = userEvent.setup()
    renderApp(<App />, '/assistant')
    expect(await screen.findByRole('link', { name: 'Assistant' })).toBeInTheDocument()
    await u.type(screen.getByLabelText('Your question'), 'How do I reset my password?')
    await u.click(screen.getByRole('button', { name: 'Send' }))
    expect(await screen.findByText('Use the portal.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Reset your password' })).toHaveAttribute(
      'href',
      '/kb/3',
    )
    expect(lastBody(calls, (url) => url.endsWith('/ai/chat'))).toEqual({
      messages: [{ role: 'user', content: 'How do I reset my password?' }],
    })

    await u.type(screen.getByLabelText('Your question'), 'thanks')
    await u.click(screen.getByRole('button', { name: 'Send' }))
    expect(await screen.findByText('Anytime.')).toBeInTheDocument()
    expect(
      lastBody(calls, (url) => url.endsWith('/ai/chat')).messages.map(
        (m: { role: string }) => m.role,
      ),
    ).toEqual(['user', 'assistant', 'user'])
    await u.click(screen.getByRole('button', { name: 'New conversation' }))
    expect(screen.queryByText('Use the portal.')).not.toBeInTheDocument()
  })

  it('turns a drafted ticket into a prefilled form', async () => {
    mockFetch({
      ...enabled,
      'GET /categories': cats,
      'GET /categories/2/subcategories': [
        { id: 12, category_id: 2, name: 'Printer issue', extra_fields_template: { fields: [] } },
      ],
      'POST /ai/chat': {
        answer: 'No guide covers this, so I drafted a ticket.',
        articles: [],
        ticket_draft: {
          title: 'Printer offline',
          description: 'The 3rd floor printer is offline',
          category_id: 2,
          subcategory_id: 12,
          urgency: 'high',
        },
      },
    })
    const u = userEvent.setup()
    renderApp(<App />, '/assistant')
    await u.type(await screen.findByLabelText('Your question'), 'printer is offline')
    await u.click(screen.getByRole('button', { name: 'Send' }))
    expect(await screen.findByText('Suggested ticket: Printer offline')).toBeInTheDocument()
    await u.click(screen.getByRole('button', { name: 'Create this ticket' }))
    expect(await screen.findByRole('heading', { name: 'Submit a ticket' })).toBeInTheDocument()
    expect(screen.getByLabelText('Title')).toHaveValue('Printer offline')
    expect(screen.getByLabelText('Description')).toHaveValue('The 3rd floor printer is offline')
    expect(screen.getByLabelText('Urgency')).toHaveValue('high')
    await waitFor(() => expect(screen.getByLabelText('Category')).toHaveValue('2'))
    await waitFor(() => expect(screen.getByLabelText('Request type')).toHaveValue('12'))
  })

  it('shows why a reply failed', async () => {
    mockFetch({
      ...enabled,
      'POST /ai/chat': { __status: 429, detail: 'AI request limit reached; try later' },
    })
    const u = userEvent.setup()
    renderApp(<App />, '/assistant')
    await u.type(await screen.findByLabelText('Your question'), 'hello')
    await u.click(screen.getByRole('button', { name: 'Send' }))
    expect(await screen.findByText('AI request limit reached; try later')).toBeInTheDocument()
  })
})

// ------------------------------------------------- nav and required fields
describe('navigation and forms', () => {
  it('shows admins the new pages', async () => {
    mockFetch({
      ...base,
      'GET /dashboard': {
        total: 0,
        by_status: {},
        by_category: {},
        by_priority: {},
        avg_resolution_hours: null,
      },
    })
    renderApp(<App />, '/admin/dashboard')
    for (const name of ['Analytics', 'Request forms', 'Integrations']) {
      expect(await screen.findByRole('link', { name })).toBeInTheDocument()
    }
  })

  it('marks required fields and prefills from a draft', async () => {
    mockFetch({
      'GET /me': user,
      'GET /ai/status': { enabled: false, model: 'm' },
      'GET /categories': cats,
      'GET /categories/1/subcategories': [
        {
          id: 5,
          category_id: 1,
          name: 'Access request',
          extra_fields_template: {
            fields: [
              { name: 'asset_tag', label: 'Asset tag', type: 'text', required: true },
              { name: 'note', label: 'Note', type: 'text' },
            ],
          },
        },
      ],
    })
    renderApp(<TicketForm onCreated={() => {}} />, {
      pathname: '/tickets/new',
      state: {
        draft: {
          title: 'Need access',
          description: 'Finance share',
          category_id: 1,
          subcategory_id: 5,
          urgency: 'low',
        },
      },
    })
    const tag = await screen.findByLabelText(/Asset tag/)
    expect(tag).toBeRequired()
    expect(screen.getByText('Asset tag *')).toBeInTheDocument()
    expect(screen.getByLabelText('Note')).not.toBeRequired()
    expect(screen.getByLabelText('Title')).toHaveValue('Need access')
    expect(screen.getByLabelText('Urgency')).toHaveValue('low')
  })
})
