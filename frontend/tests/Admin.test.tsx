import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import App from '../src/App'
import TicketDetail from '../src/pages/TicketDetail'
import { tokenStore } from '../src/services/api'
import { mockFetch, renderApp } from './helpers'

const admin = { id: 'admin-1', name: 'Admin User', email: 'a@x', role: 'admin' }
const user = { id: 'user-1', name: 'John', email: 'j@x', role: 'user' }
const base = {
  id: 7,
  title: 'Laptop dead',
  description: 'No power',
  user_id: 'user-1',
  category_id: 1,
  status: 'open',
  priority: 'medium',
  urgency: 'high',
  created_at: '2026-10-07T10:00:00',
  updated_at: '2026-10-07T10:00:00',
  reopen_count: 0,
  sla_status: 'ok',
}

describe('admin', () => {
  beforeEach(() => tokenStore.set('demo-token-admin-1'))
  afterEach(() => tokenStore.clear())

  it('All Tickets lists everyone with admin columns and category filter', async () => {
    const calls = mockFetch({
      'GET /me': admin,
      'GET /categories': [{ id: 1, name: 'Incident' }],
      'GET /tickets?page=1': { items: [base], total: 1, page: 1, page_size: 20 },
      'GET /tickets?category_id=1&page=1': { items: [], total: 0, page: 1, page_size: 20 },
    })
    renderApp(<App />, '/admin/tickets')
    expect(await screen.findByRole('heading', { name: 'All Tickets' })).toBeInTheDocument()
    expect(await screen.findByText('Submitted by')).toBeInTheDocument()
    expect(screen.getByText('user-1')).toBeInTheDocument()
    expect(calls.some((c) => c.url.includes('mine='))).toBe(false)

    await userEvent.selectOptions(screen.getByLabelText('Filter by category'), '1')
    expect(await screen.findByText('No tickets found.')).toBeInTheDocument()
  })

  it('redirects non-admins away from admin routes', async () => {
    tokenStore.set('demo-token-user-1')
    mockFetch({
      'GET /me': user,
      'GET /categories': [],
      'GET /tickets?mine=true&page=1': { items: [], total: 0, page: 1, page_size: 20 },
    })
    renderApp(<App />, '/admin/dashboard')
    expect(await screen.findByRole('heading', { name: 'My Tickets' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Dashboard' })).not.toBeInTheDocument()
  })

  it('shows admin nav links', async () => {
    mockFetch({
      'GET /me': admin,
      'GET /categories': [],
      'GET /tickets?mine=true&page=1': { items: [], total: 0, page: 1, page_size: 20 },
    })
    renderApp(<App />, '/tickets')
    expect(await screen.findByRole('link', { name: 'All Tickets' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument()
  })

  it('renders the dashboard', async () => {
    mockFetch({
      'GET /me': admin,
      'GET /dashboard': {
        total: 3,
        by_status: { open: 2, in_progress: 1 },
        by_category: { Incident: 3 },
        by_priority: { medium: 3 },
        avg_resolution_hours: null,
      },
    })
    renderApp(<App />, '/admin/dashboard')
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
    expect(screen.getByText('Total tickets')).toBeInTheDocument()
    expect(screen.getByText('in progress')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'By category' })).toBeInTheDocument()
  })

  function detail(extra: Record<string, unknown> = {}) {
    const calls = mockFetch({
      'GET /me': admin,
      'GET /tickets/7': { ...base, extra_fields: [], attachments: [] },
      'GET /tickets/7/comments': [],
      'GET /tickets/7/history': [
        {
          id: 1,
          ticket_id: 7,
          changed_by_id: 'user-1',
          field_name: 'status',
          old_value: null,
          new_value: 'open',
          change_type: 'created',
          created_at: '2026-10-07T10:00:00',
        },
      ],
      ...extra,
    })
    renderApp(
      <Routes>
        <Route path="/tickets/:id" element={<TicketDetail />} />
      </Routes>,
      '/tickets/7',
    )
    return calls
  }

  it('offers only allowed status transitions and sends the update', async () => {
    const calls = detail({ 'PATCH /tickets/7': { ...base, status: 'in_progress' } })
    const status = await screen.findByLabelText('Status')
    const options = Array.from((status as HTMLSelectElement).options).map((o) => o.text)
    expect(options).toEqual(['Open (current)', 'In Progress', 'Cancelled'])
    expect(screen.getByRole('button', { name: 'Update ticket' })).toBeDisabled()

    await userEvent.selectOptions(status, 'in_progress')
    await userEvent.selectOptions(screen.getByLabelText('Priority'), 'urgent')
    await userEvent.click(screen.getByRole('button', { name: 'Update ticket' }))
    await waitFor(() => {
      const patch = calls.find((c) => c.init?.method === 'PATCH')
      expect(JSON.parse(patch!.init!.body as string)).toEqual({
        status: 'in_progress',
        priority: 'urgent',
      })
    })
  })

  it('shows the audit history to admins', async () => {
    detail()
    expect(await screen.findByRole('heading', { name: 'History' })).toBeInTheDocument()
    expect(await screen.findByText(/status: — → open/)).toBeInTheDocument()
  })

  it('hides admin controls and history from regular users', async () => {
    tokenStore.set('demo-token-user-1')
    mockFetch({
      'GET /me': user,
      'GET /tickets/7': { ...base, extra_fields: [], attachments: [] },
      'GET /tickets/7/comments': [],
    })
    renderApp(
      <Routes>
        <Route path="/tickets/:id" element={<TicketDetail />} />
      </Routes>,
      '/tickets/7',
    )
    expect(await screen.findByText(/Laptop dead/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Status')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'History' })).not.toBeInTheDocument()
  })
})
