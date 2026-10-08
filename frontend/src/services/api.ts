import { ApiError } from './errors'
import type {
  Attachment,
  BulkInput,
  BulkResult,
  AiCategorization,
  AiReply,
  AiStatus,
  Duplicate,
  Feedback,
  KbArticle,
  KbArticleInput,
  KbList,
  SlaRule,
  Category,
  Comment,
  Dashboard,
  HistoryEntry,
  Report,
  StaffMember,
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

let memoryToken: string | null = null

export const tokenStore = {
  get: (): string | null => {
    try {
      return localStorage.getItem(TOKEN_KEY) ?? memoryToken
    } catch {
      return memoryToken
    }
  },
  set: (token: string) => {
    memoryToken = token
    try {
      localStorage.setItem(TOKEN_KEY, token)
    } catch {
      /* storage unavailable */
    }
  },
  clear: () => {
    memoryToken = null
    try {
      localStorage.removeItem(TOKEN_KEY)
    } catch {
      /* storage unavailable */
    }
  },
}

export { ApiError }

async function request<T>(
  path: string,
  init: RequestInit = {},
  tokenOverride?: string,
): Promise<T> {
  const token = tokenOverride ?? tokenStore.get()
  if (import.meta.env.VITE_DEMO === 'true') {
    const { demoRequest } = await import('../demo/demoApi')
    return demoRequest<T>(init.method ?? 'GET', path, init.body, token)
  }
  const headers = new Headers(init.headers)
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
  if (res.status === 204) return undefined as T
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
    priority?: string
    assigneeId?: string
    unassigned?: boolean
    createdFrom?: string
    createdTo?: string
    slaBreached?: boolean
    search?: string
    mine?: boolean
    page?: number
  }) => {
    const q = new URLSearchParams()
    if (params.status) q.set('status', params.status)
    if (params.categoryId) q.set('category_id', String(params.categoryId))
    if (params.priority) q.set('priority', params.priority)
    if (params.assigneeId) q.set('assignee_id', params.assigneeId)
    if (params.unassigned) q.set('unassigned', 'true')
    if (params.createdFrom) q.set('created_from', params.createdFrom)
    if (params.createdTo) q.set('created_to', params.createdTo)
    if (params.slaBreached) q.set('sla_breached', 'true')
    if (params.search) q.set('search', params.search)
    if (params.mine) q.set('mine', 'true')
    q.set('page', String(params.page ?? 1))
    return request<TicketList>(`/tickets?${q}`)
  },
  getTicket: (id: number) => request<TicketDetail>(`/tickets/${id}`),
  createTicket: (data: TicketCreateInput) => request<TicketDetail>('/tickets', json(data)),
  updateTicket: (id: number, data: { status?: TicketStatus; priority?: Priority }) =>
    request<Ticket>(`/tickets/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  assignTicket: (id: number, assigneeId: string | null) =>
    request<Ticket>(`/tickets/${id}/assignee`, {
      method: 'PUT',
      body: JSON.stringify({ assignee_id: assigneeId }),
    }),
  bulkUpdate: (data: BulkInput) => request<BulkResult>('/tickets/bulk', json(data)),
  staff: () => request<StaffMember[]>('/staff'),
  report: () => request<Report>('/reports'),
  history: (id: number) => request<HistoryEntry[]>(`/tickets/${id}/history`),
  dashboard: () => request<Dashboard>('/dashboard'),
  kbList: (params: { q?: string; categoryId?: number; page?: number; pageSize?: number }) => {
    const q = new URLSearchParams()
    if (params.q) q.set('q', params.q)
    if (params.categoryId) q.set('category_id', String(params.categoryId))
    q.set('page', String(params.page ?? 1))
    if (params.pageSize) q.set('page_size', String(params.pageSize))
    return request<KbList>(`/kb/articles?${q}`)
  },
  kbSuggest: (q: string, categoryId?: number) =>
    request<KbArticle[]>(
      `/kb/suggest?${new URLSearchParams({ q, ...(categoryId ? { category_id: String(categoryId) } : {}) })}`,
    ),
  kbGet: (id: number) => request<KbArticle>(`/kb/articles/${id}`),
  kbCreate: (data: KbArticleInput) => request<KbArticle>('/kb/articles', json(data)),
  kbUpdate: (id: number, data: KbArticleInput) =>
    request<KbArticle>(`/kb/articles/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  kbDelete: (id: number) => request<void>(`/kb/articles/${id}`, { method: 'DELETE' }),
  ticketKb: (id: number) => request<KbArticle[]>(`/tickets/${id}/kb`),
  linkKb: (id: number, articleId: number) =>
    request<KbArticle[]>(`/tickets/${id}/kb`, json({ article_id: articleId })),
  unlinkKb: (id: number, articleId: number) =>
    request<KbArticle[]>(`/tickets/${id}/kb/${articleId}`, { method: 'DELETE' }),
  approvals: () => request<Ticket[]>('/approvals'),
  decideApproval: (id: number, decision: 'approve' | 'reject', comment?: string) =>
    request<Ticket>(`/tickets/${id}/approval`, json({ decision, comment: comment || null })),
  sendFeedback: (id: number, rating: number, comment?: string) =>
    request<Feedback>(`/tickets/${id}/feedback`, json({ rating, comment: comment || null })),
  slaRules: () => request<SlaRule[]>('/sla-rules'),
  setSlaRule: (categoryId: number, response_hours: number, resolution_hours: number) =>
    request<SlaRule[]>(`/sla-rules/${categoryId}`, {
      method: 'PUT',
      body: JSON.stringify({ response_hours, resolution_hours }),
    }),
  resetSlaRule: (categoryId: number) =>
    request<void>(`/sla-rules/${categoryId}`, { method: 'DELETE' }),
  aiStatus: () => request<AiStatus>('/ai/status'),
  aiCategorize: (title: string, description: string) =>
    request<AiCategorization>('/ai/categorize', json({ title, description })),
  aiReply: (id: number) =>
    request<AiReply>(`/tickets/${id}/ai/suggest-response`, { method: 'POST' }),
  duplicates: (id: number) => request<Duplicate[]>(`/tickets/${id}/duplicates`),
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
