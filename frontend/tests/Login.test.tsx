import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../src/App'
import { tokenStore } from '../src/services/api'
import { mockFetch, renderApp } from './helpers'

describe('auth flow', () => {
  beforeEach(() => tokenStore.clear())

  it('redirects unauthenticated users to login, then signs in', async () => {
    const calls = mockFetch({
      'GET /me': { id: 'user-1', name: 'John Smith', email: 'j@x', role: 'user' },
      'GET /tickets?mine=true&page=1': { items: [], total: 0, page: 1, page_size: 20 },
    })
    renderApp(<App />, '/tickets')
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText('John Smith (user)')).toBeInTheDocument()
    expect(tokenStore.get()).toBe('demo-token-user-1')
    const me = calls.find((c) => c.url.endsWith('/me'))!
    expect((me.init!.headers as Headers).get('Authorization')).toBe('Bearer demo-token-user-1')
    await waitFor(() => expect(screen.getByText('No tickets found.')).toBeInTheDocument())
  })

  it('shows an error for a rejected token', async () => {
    mockFetch({})
    renderApp(<App />, '/login')
    await userEvent.click(await screen.findByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText(/no mock GET \/me/)).toBeInTheDocument()
    expect(tokenStore.get()).toBeNull()
  })
})
