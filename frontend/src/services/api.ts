import type {
  Attachment,
  Category,
  Comment,
  Dashboard,
  HistoryEntry,
  Priority,
  Subcategory,
  TicketStatus,
  Ticket,
  TicketCreateInput,
  TicketDetail,
  TicketList,
  User,
} from '../types'

const BASE = `${import.meta.env.VITE_API_URL ?? ''}/api/helpdesk`
const TOKEN_KEY = 'helpdesk.token'

export const tokenStore = {
  get: (): string | null => {
    try {
      return localStorage.getItem(TOKEN_KEY)
    } catch {
      return null
    }
  },
  set: (token: string) => {
    try {
      localStorage.setItem(TOKEN_KEY, token)
    } catch {
      /* storage unavailable */
    }
  },
  clear: () => {
    try {
      localStorage.removeItem(TOKEN_KEY)
    } catch {
      /* storage unavailable */
    }
  },
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  tokenOverride?: string,
): Promise<T> {
  const headers = new Headers(init.headers)
  const token = tokenOverride ?? tokenStore.get()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (typeof init.body === 'string') headers.set('Content-Type', 'application/json')
  const res = await fetch(`${BASE}${path}`, { ...init, headers })
  if (!res.ok) {
    let message = res.statusText
    try {
      const body = await res.json()
      const detail = body.detail ?? body.error
      message = typeof detail === 'string' ? detail : JSON.stringify(detail ?? body)
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, message)
  }
  return res.json() as Promise<T>
}

const json = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) })

export const api = {
  me: (token?: string) => request<User>('/me', {}, token),
  categories: () => request<Category[]>('/categories'),
  subcategories: (categoryId: number) =>
    request<Subcategory[]>(`/categories/${categoryId}/subcategories`),
  listTickets: (params: {
    status?: string
    categoryId?: number
    search?: string
    mine?: boolean
    page?: number
  }) => {
    const q = new URLSearchParams()
    if (params.status) q.set('status', params.status)
    if (params.categoryId) q.set('category_id', String(params.categoryId))
    if (params.search) q.set('search', params.search)
    if (params.mine) q.set('mine', 'true')
    q.set('page', String(params.page ?? 1))
    return request<TicketList>(`/tickets?${q}`)
  },
  getTicket: (id: number) => request<TicketDetail>(`/tickets/${id}`),
  createTicket: (data: TicketCreateInput) => request<TicketDetail>('/tickets', json(data)),
  updateTicket: (id: number, data: { status?: TicketStatus; priority?: Priority }) =>
    request<Ticket>(`/tickets/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  history: (id: number) => request<HistoryEntry[]>(`/tickets/${id}/history`),
  dashboard: () => request<Dashboard>('/dashboard'),
  reopenTicket: (id: number) => request<Ticket>(`/tickets/${id}/reopen`, { method: 'POST' }),
  listComments: (id: number) => request<Comment[]>(`/tickets/${id}/comments`),
  addComment: (id: number, content: string) =>
    request<Comment>(`/tickets/${id}/comments`, json({ content })),
  uploadAttachment: (id: number, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return request<Attachment>(`/tickets/${id}/attachments`, { method: 'POST', body: form })
  },
}
