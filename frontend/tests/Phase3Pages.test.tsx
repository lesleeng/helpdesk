import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../src/App'
import { tokenStore } from '../src/services/api'
import { mockFetch, renderApp } from './helpers'

const admin = { id: 'admin-1', name: 'Admin User', email: 'a@x', role: 'admin' }
const tech = { id: 'tech-1', name: 'Tina Tech', email: 't@x', role: 'tech' }
const user = { id: 'user-1', name: 'John', email: 'j@x', role: 'user' }

const article = (id: number, extra: Record<string, unknown> = {}) => ({
  id,
  title: `Article ${id}`,
  body: `Body of article ${id}`,
  tags: 'vpn,network',
  category_id: null,
  published: true,
  created_by_id: 'admin-1',
  created_at: '2026-10-01T10:00:00',
  updated_at: '2026-10-02T10:00:00',
  ...extra,
})
const kbPage = (items: unknown[]) => ({ items, total: items.length, page: 1, page_size: 20 })

describe('knowledge base', () => {
  afterEach(() => tokenStore.clear())

  it('lets admins see drafts and create articles, but not regular users', async () => {
    tokenStore.set('demo-token-admin-1')
    mockFetch({
      'GET /me': admin,
      'GET /categories': [],
      'GET /kb/articles?page=1': kbPage([article(1), article(2, { published: false })]),
    })
    renderApp(<App />, '/kb')
    expect(await screen.findByRole('heading', { name: 'Knowledge Base' })).toBeInTheDocument()
    expect(await screen.findByText('Article 1')).toBeInTheDocument()
    expect(screen.getByText('Draft')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'New article' })).toBeInTheDocument()
  })

  it('shows regular users published articles only, without staff columns or editing', async () => {
    tokenStore.set('demo-token-user-1')
    mockFetch({
      'GET /me': user,
      'GET /categories': [],
      'GET /kb/articles?page=1': kbPage([article(1)]),
    })
    renderApp(<App />, '/kb')
    expect(await screen.findByText('Article 1')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'New article' })).not.toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'Status' })).not.toBeInTheDocument()
  })

  it('searches and shows the empty state', async () => {
    tokenStore.set('demo-token-user-1')
    const calls = mockFetch({
      'GET /me': user,
      'GET /categories': [],
      'GET /kb/articles?page=1': kbPage([article(1)]),
      'GET /kb/articles?q=zzz&page=1': kbPage([]),
    })
    renderApp(<App />, '/kb')
    await userEvent.type(await screen.findByLabelText('Search articles'), 'zzz')
    expect(await screen.findByText('No articles found.')).toBeInTheDocument()
    expect(calls.some((c) => c.url.includes('q=zzz'))).toBe(true)
  })

  it('opens an article and offers editing to admins only', async () => {
    tokenStore.set('demo-token-admin-1')
    mockFetch({ 'GET /me': admin, 'GET /kb/articles/2': article(2, { published: false }) })
    renderApp(<App />, '/kb/2')
    expect(await screen.findByRole('heading', { name: /Article 2/ })).toBeInTheDocument()
    expect(screen.getByText('Draft')).toBeInTheDocument()
    expect(screen.getByText('Body of article 2')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Edit article' })).toBeInTheDocument()
  })

  it('creates an article', async () => {
    tokenStore.set('demo-token-admin-1')
    const calls = mockFetch({
      'GET /me': admin,
      'GET /categories': [{ id: 1, name: 'Incident' }],
      'POST /kb/articles': article(7),
      'GET /kb/articles/7': article(7),
    })
    const user = userEvent.setup()
    renderApp(<App />, '/kb/new')
    await user.type(await screen.findByLabelText('Title'), 'Fix VPN')
    await user.type(screen.getByLabelText('Body'), 'Restart the client')
    await user.type(screen.getByLabelText('Tags'), 'vpn')
    await user.click(screen.getByLabelText('Published'))
    await user.click(screen.getByRole('button', { name: 'Save article' }))
    await waitFor(() => {
      const post = calls.find((c) => c.init?.method === 'POST')!
      expect(JSON.parse(post.init!.body as string)).toEqual({
        title: 'Fix VPN',
        body: 'Restart the client',
        tags: 'vpn',
        category_id: null,
        published: true,
      })
    })
    expect(await screen.findByRole('heading', { name: /Article 7/ })).toBeInTheDocument()
  })

  it('deletes only after an in-page confirmation', async () => {
    tokenStore.set('demo-token-admin-1')
    const calls = mockFetch({
      'GET /me': admin,
      'GET /categories': [],
      'GET /kb/articles/3': article(3),
      'DELETE /kb/articles/3': undefined,
      'GET /kb/articles?page=1': kbPage([]),
    })
    const user = userEvent.setup()
    renderApp(<App />, '/kb/3/edit')
    await user.click(await screen.findByRole('button', { name: 'Delete article' }))
    expect(calls.some((c) => c.init?.method === 'DELETE')).toBe(false)
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('button', { name: 'Delete article' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Delete article' }))
    await user.click(screen.getByRole('button', { name: 'Yes, delete' }))
    await waitFor(() => expect(calls.some((c) => c.init?.method === 'DELETE')).toBe(true))
    expect(await screen.findByRole('heading', { name: 'Knowledge Base' })).toBeInTheDocument()
  })

  it('keeps regular users out of the article editor', async () => {
    tokenStore.set('demo-token-user-1')
    mockFetch({
      'GET /me': user,
      'GET /categories': [],
      'GET /tickets?mine=true&page=1': { items: [], total: 0, page: 1, page_size: 20 },
    })
    renderApp(<App />, '/kb/new')
    expect(await screen.findByRole('heading', { name: 'My Tickets' })).toBeInTheDocument()
  })
})

describe('approvals, SLA rules and role landing pages', () => {
  afterEach(() => tokenStore.clear())

  it('lists the requests waiting for the signed-in approver', async () => {
    tokenStore.set('demo-token-manager-1')
    mockFetch({
      'GET /me': { id: 'manager-1', name: 'Maria', email: 'm@x', role: 'user' },
      'GET /approvals': [
        {
          id: 3,
          title: 'Need Finance share',
          description: 'x',
          user_id: 'user-1',
          category_id: 1,
          status: 'open',
          priority: 'medium',
          urgency: 'medium',
          created_at: '2026-10-07T10:00:00',
          updated_at: '2026-10-07T10:00:00',
          reopen_count: 0,
          sla_status: 'ok',
          approval_status: 'pending',
        },
      ],
    })
    renderApp(<App />, '/approvals')
    expect(await screen.findByRole('heading', { name: 'Approvals' })).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: 'Need Finance share' })).toHaveAttribute(
      'href',
      '/tickets/3',
    )
  })

  const rules = [
    {
      category_id: 1,
      category_name: 'Service Request',
      response_hours: 24,
      resolution_hours: 72,
      custom: false,
    },
    {
      category_id: 2,
      category_name: 'Incident',
      response_hours: 4,
      resolution_hours: 16,
      custom: true,
    },
  ]

  it('edits, saves and resets SLA targets', async () => {
    tokenStore.set('demo-token-admin-1')
    const calls = mockFetch({
      'GET /me': admin,
      'GET /sla-rules': rules,
      'PUT /sla-rules/1': rules,
      'DELETE /sla-rules/2': undefined,
    })
    const user = userEvent.setup()
    renderApp(<App />, '/admin/sla')
    expect(await screen.findByRole('heading', { name: 'SLA rules' })).toBeInTheDocument()
    const save = screen.getByRole('button', { name: 'Save Service Request' })
    expect(save).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Reset Service Request' })).toBeDisabled() // not custom
    expect(screen.getByRole('button', { name: 'Reset Incident' })).toBeEnabled()

    const response = screen.getByLabelText('Response hours for Service Request')
    await user.clear(response)
    await user.type(response, '0')
    expect(save).toBeDisabled() // a response target below 1 hour is not allowed
    await user.clear(response)
    await user.type(response, '8')
    await user.click(save)
    await waitFor(() => {
      const put = calls.find((c) => c.init?.method === 'PUT')!
      expect(JSON.parse(put.init!.body as string)).toEqual({
        response_hours: 8,
        resolution_hours: 72,
      })
    })
    await user.click(screen.getByRole('button', { name: 'Reset Incident' }))
    await waitFor(() => expect(calls.some((c) => c.init?.method === 'DELETE')).toBe(true))
  })

  it('sends each role to its own landing page', async () => {
    const empty = { items: [], total: 0, page: 1, page_size: 20 }
    tokenStore.set('demo-token-tech-1')
    mockFetch({
      'GET /me': tech,
      'GET /categories': [],
      'GET /tickets?assignee_id=tech-1&page=1': empty,
    })
    const first = renderApp(<App />, '/')
    expect(await screen.findByRole('heading', { name: 'Assigned to me' })).toBeInTheDocument()
    first.unmount()

    tokenStore.set('demo-token-admin-1')
    mockFetch({
      'GET /me': admin,
      'GET /dashboard': {
        total: 0,
        by_status: {},
        by_category: {},
        by_priority: {},
        avg_resolution_hours: null,
      },
    })
    renderApp(<App />, '/anything-unknown')
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'SLA rules' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Knowledge Base' })).toBeInTheDocument()
  })
})
