import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '../src/hooks/useAuth'

export function renderApp(
  ui: ReactElement,
  route: string | { pathname: string; state?: unknown } = '/',
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]}>
        <AuthProvider>{ui}</AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

export function mockFetch(routes: Record<string, unknown | ((init?: RequestInit) => unknown)>) {
  const calls: { url: string; init?: RequestInit }[] = []
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, init })
    const key = `${init?.method ?? 'GET'} ${url.replace('/api/helpdesk', '')}`
    const hit = routes[key]
    if (!(key in routes))
      return new Response(JSON.stringify({ detail: `no mock ${key}` }), { status: 404 })
    const body = typeof hit === 'function' ? hit(init) : hit
    if (body && typeof body === 'object' && '__status' in body) {
      const { __status, ...rest } = body as { __status: number }
      return new Response(JSON.stringify(rest), { status: __status })
    }
    if (body === undefined) return new Response(null, { status: 204 })
    return new Response(JSON.stringify(body), { status: 200 })
  }) as typeof fetch
  return calls
}
