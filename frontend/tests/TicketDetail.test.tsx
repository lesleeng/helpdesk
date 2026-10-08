import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import TicketDetail from '../src/pages/TicketDetail'
import { tokenStore } from '../src/services/api'
import { mockFetch, renderApp } from './helpers'

const ticket = {
  id: 5,
  title: 'VPN down',
  description: 'Cannot connect',
  user_id: 'user-1',
  category_id: 1,
  status: 'resolved',
  priority: 'medium',
  urgency: 'high',
  created_at: '2026-10-07T10:00:00',
  updated_at: '2026-10-07T10:00:00',
  reopen_count: 0,
  sla_status: 'ok',
  extra_fields: [{ field_name: 'affected_system', field_value: 'VPN' }],
  attachments: [
    { id: 1, ticket_id: 5, file_name: 'log.txt', uploaded_by_id: 'user-1', created_at: '' },
  ],
}

function setup(extra: Record<string, unknown> = {}) {
  tokenStore.set('demo-token-user-1')
  const calls = mockFetch({
    'GET /me': { id: 'user-1', name: 'John', email: 'j@x', role: 'user' },
    'GET /tickets/5': ticket,
    'GET /tickets/5/comments': [
      {
        id: 1,
        ticket_id: 5,
        user_id: 'admin-1',
        content: 'Fixed it',
        is_internal: false,
        created_at: '2026-10-07T11:00:00',
      },
    ],
    ...extra,
  })
  renderApp(
    <Routes>
      <Route path="/tickets/:id" element={<TicketDetail />} />
    </Routes>,
    '/tickets/5',
  )
  return calls
}

describe('TicketDetail', () => {
  afterEach(() => tokenStore.clear())

  it('shows ticket info, attachments, extra fields and comments', async () => {
    setup()
    expect(await screen.findByText(/VPN down/)).toBeInTheDocument()
    expect(screen.getByText('Cannot connect')).toBeInTheDocument()
    expect(screen.getByText('log.txt')).toBeInTheDocument()
    expect(screen.getByText('VPN')).toBeInTheDocument()
    expect(await screen.findByText('Fixed it')).toBeInTheDocument()
  })

  it('lets the owner reopen a resolved ticket', async () => {
    const calls = setup({ 'POST /tickets/5/reopen': { ...ticket, status: 'open' } })
    await userEvent.click(await screen.findByRole('button', { name: 'Reopen ticket' }))
    await waitFor(() =>
      expect(
        calls.some((c) => c.url.endsWith('/tickets/5/reopen') && c.init?.method === 'POST'),
      ).toBe(true),
    )
  })

  it('posts a comment', async () => {
    const calls = setup({
      'POST /tickets/5/comments': {
        id: 2,
        ticket_id: 5,
        user_id: 'user-1',
        content: 'Thanks',
        is_internal: false,
        created_at: '2026-10-07T12:00:00',
      },
    })
    const user = userEvent.setup()
    await user.type(await screen.findByPlaceholderText('Add a comment'), 'Thanks')
    await user.click(screen.getByRole('button', { name: 'Post comment' }))
    await waitFor(() => {
      const post = calls.find((c) => c.url.endsWith('/comments') && c.init?.method === 'POST')
      expect(JSON.parse(post!.init!.body as string)).toEqual({ content: 'Thanks' })
    })
  })

  it('shows an error when the ticket is not found', async () => {
    tokenStore.set('demo-token-user-1')
    mockFetch({ 'GET /me': { id: 'user-1', name: 'John', email: 'j@x', role: 'user' } })
    renderApp(
      <Routes>
        <Route path="/tickets/:id" element={<TicketDetail />} />
      </Routes>,
      '/tickets/99',
    )
    expect(await screen.findByText(/no mock GET \/tickets\/99/)).toBeInTheDocument()
  })
})
