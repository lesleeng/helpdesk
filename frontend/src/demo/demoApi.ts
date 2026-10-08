// In-browser stand-in for the backend, used only when the app is built with VITE_DEMO=true.
// It mirrors the real API's rules in simplified form so the whole UI can be clicked through
// without a server. Data lives in memory and resets on reload. AI replies are simulated.
import { ApiError } from '../services/errors'
import type {
  Attachment,
  Comment,
  ExtraFieldDef,
  Feedback,
  HistoryEntry,
  KbArticle,
  Priority,
  Ticket,
  TicketStatus,
  Urgency,
  User,
} from '../types'

const HOUR = 3_600_000
const DAY = 24 * HOUR
const now = () => Date.now()
const iso = (ms: number) => new Date(ms).toISOString().replace('Z', '')
const ms = (s: string) => new Date(s + 'Z').getTime()

const USERS: Record<string, User & { manager_id?: string }> = {
  'demo-token-user-1': {
    id: 'user-1',
    name: 'John Smith',
    email: 'john.smith@company.com',
    department: 'IT Support',
    role: 'user',
    manager_id: 'manager-1',
  },
  'demo-token-user-2': {
    id: 'user-2',
    name: 'Jane Doe',
    email: 'jane.doe@company.com',
    department: 'Finance',
    role: 'user',
    manager_id: 'manager-1',
  },
  'demo-token-manager-1': {
    id: 'manager-1',
    name: 'Maria Manager',
    email: 'maria.manager@company.com',
    department: 'Operations',
    role: 'user',
  },
  'demo-token-tech-1': {
    id: 'tech-1',
    name: 'Tina Tech',
    email: 'tina.tech@company.com',
    department: 'IT Support',
    role: 'tech',
  },
  'demo-token-tech-2': {
    id: 'tech-2',
    name: 'Tom Tech',
    email: 'tom.tech@company.com',
    department: 'IT Support',
    role: 'tech',
  },
  'demo-token-admin-1': {
    id: 'admin-1',
    name: 'Admin User',
    email: 'admin@company.com',
    department: 'IT Support',
    role: 'admin',
  },
}
const userById = (id: string) => Object.values(USERS).find((u) => u.id === id)

// ---- catalog ----
const f = (
  name: string,
  label: string,
  type: ExtraFieldDef['type'] = 'text',
  options?: string[],
): ExtraFieldDef => (options ? { name, label, type, options } : { name, label, type })
const FIELDS: Record<number, ExtraFieldDef[]> = {
  1: [
    f('affected_user', 'Affected user / system'),
    f('department', 'Department'),
    f('start_date', 'Start date (new accounts)', 'date'),
    f('software_name', 'Software / app name'),
    f('justification', 'Business justification', 'textarea'),
  ],
  2: [
    f('affected_system', 'Affected system / app'),
    f('error_message', 'Error code / message'),
    f('users_impacted', 'Number of users impacted', 'number'),
    f('severity', 'Severity', 'select', ['critical', 'high', 'medium', 'low']),
    f('department', 'Department'),
  ],
  3: [
    f('equipment_name', 'System / equipment name'),
    f('scheduled_date', 'Scheduled date', 'date'),
    f('estimated_downtime', 'Estimated downtime'),
    f('affected_departments', 'Affected departments'),
    f('maintenance_window', 'Maintenance window preference'),
  ],
  4: [
    f('employee_name', 'Employee name'),
    f('effective_date', 'Start / end date', 'date'),
    f('department', 'Department (current / new)'),
    f('equipment_needed', 'Equipment needed (laptop, phone, keys...)', 'textarea'),
    f('manager_name', 'Manager name'),
    f('role', 'Role'),
  ],
}
const CATEGORIES = [
  { id: 1, name: 'Service Request' },
  { id: 2, name: 'Incident' },
  { id: 3, name: 'Maintenance' },
  { id: 4, name: 'HR-Initiated' },
]
const SUB_NAMES: Record<number, string[]> = {
  1: [
    'New user',
    'Password reset',
    'Software install',
    'Email setup',
    'Access request',
    'License assignment',
    'App/System creation',
  ],
  2: ['Hardware failure', 'App error', 'Printer issue', 'Internet problem', 'System outage'],
  3: ['Preventive maintenance', 'System update', 'Hardware upgrade', 'Equipment replacement'],
  4: ['Employee onboarding', 'Offboarding', 'Department transfer'],
}
let nextSub = 1
const SUBS = CATEGORIES.flatMap((c) =>
  SUB_NAMES[c.id].map((name) => ({
    id: nextSub++,
    category_id: c.id,
    name,
    extra_fields_template: { fields: FIELDS[c.id] },
    requires_approval: name === 'Access request' || name === 'License assignment',
  })),
)
const sub = (name: string) => SUBS.find((s) => s.name === name)!

// ---- state ----
interface Rec {
  t: Ticket
  extra: Record<string, string>
  attachments: Attachment[]
  feedback: Feedback | null
  kb: number[]
  history: HistoryEntry[]
  comments: Comment[]
}
const DEFAULT_SLA = { response: 24, resolution: 72 }
const slaRules: Record<number, { response: number; resolution: number }> = {
  2: { response: 4, resolution: 16 },
}
const slaFor = (categoryId: number) => slaRules[categoryId] ?? DEFAULT_SLA

let seq = 100
const nid = () => ++seq
const tickets: Rec[] = []
const articles: KbArticle[] = []

function addHistory(
  r: Rec,
  by: string,
  field: string,
  from: unknown,
  to: unknown,
  kind: string,
  at = now(),
) {
  r.history.push({
    id: nid(),
    ticket_id: r.t.id,
    changed_by_id: by,
    field_name: field,
    old_value: from == null ? null : String(from),
    new_value: to == null ? null : String(to),
    change_type: kind,
    created_at: iso(at),
  })
}

function makeTicket(o: {
  id: number
  owner: string
  title: string
  description: string
  sub: string
  ageHours: number
  status?: TicketStatus
  priority?: Priority
  urgency?: Urgency
  assignee?: string | null
  firstResponseAfterHours?: number
  resolvedAfterHours?: number
  approver?: string
  extra?: Record<string, string>
}) {
  const s = sub(o.sub)
  const created = now() - o.ageHours * HOUR
  const sla = slaFor(s.category_id)
  const t: Ticket = {
    id: o.id,
    title: o.title,
    description: o.description,
    user_id: o.owner,
    category_id: s.category_id,
    subcategory_id: s.id,
    status: o.status ?? 'open',
    priority: o.priority ?? 'medium',
    urgency: o.urgency ?? 'medium',
    created_at: iso(created),
    updated_at: iso(created),
    reopen_count: 0,
    assigned_to_id: o.assignee ?? null,
    first_response_at:
      o.firstResponseAfterHours != null ? iso(created + o.firstResponseAfterHours * HOUR) : null,
    resolved_at: o.resolvedAfterHours != null ? iso(created + o.resolvedAfterHours * HOUR) : null,
    sla_response_due: iso(created + sla.response * HOUR),
    sla_resolution_due: iso(created + sla.resolution * HOUR),
    sla_status: 'ok',
    approval_status: o.approver ? 'pending' : null,
    approver_id: o.approver ?? null,
  }
  const r: Rec = {
    t,
    extra: o.extra ?? {},
    attachments: [],
    feedback: null,
    kb: [],
    history: [],
    comments: [],
  }
  addHistory(r, o.owner, 'status', null, 'open', 'created', created)
  if (o.assignee) addHistory(r, 'admin-1', 'assignee', null, o.assignee, 'assigned', created + HOUR)
  if (o.approver) addHistory(r, o.owner, 'approval', null, 'pending', 'approval_requested', created)
  if (t.status !== 'open' && !o.approver)
    addHistory(
      r,
      o.assignee ?? 'admin-1',
      'status',
      'open',
      t.status,
      'status_change',
      created + 2 * HOUR,
    )
  tickets.push(r)
  return r
}

function seed() {
  const kbSeed: [string, string, string, boolean, number | null][] = [
    [
      'Reset your password',
      'Open the self-service portal and choose "Forgot password". You will receive a code on your registered phone. Passwords must be at least 12 characters and cannot reuse your last five.',
      'password,account,login',
      true,
      1,
    ],
    [
      'Connecting to the VPN',
      'Install the corporate VPN client, sign in with your network credentials and pick the nearest gateway. If the connection drops every hour, update the client to the latest version and disable power saving on your Wi-Fi adapter.',
      'vpn,network,remote',
      true,
      2,
    ],
    [
      'Requesting access to a shared drive',
      'Submit an Access request with the drive name and a business justification. Your manager approves it first, then IT grants the permission, usually within one working day.',
      'access,permissions,share',
      true,
      1,
    ],
    [
      'Printer troubleshooting',
      'Check the paper tray and clear any jam, then power-cycle the printer. If the queue is stuck, remove the printer and add it again from the print server list.',
      'printer,printing,hardware',
      true,
      2,
    ],
    [
      'Internal escalation policy',
      'Draft: how and when to escalate priority incidents to the on-call engineer.',
      'internal,policy',
      false,
      null,
    ],
  ]
  kbSeed.forEach(([title, body, tags, published, category_id], i) =>
    articles.push({
      id: i + 1,
      title,
      body,
      tags,
      published,
      category_id,
      created_by_id: 'admin-1',
      created_at: iso(now() - (10 - i) * DAY),
      updated_at: iso(now() - (5 - i) * DAY),
    }),
  )

  const a = makeTicket({
    id: 1,
    owner: 'user-1',
    title: 'VPN keeps dropping',
    description: 'My VPN disconnects roughly every hour and I have to sign in again.',
    sub: 'Internet problem',
    ageHours: 30,
    assignee: 'tech-1',
    urgency: 'high',
    priority: 'high',
    extra: { affected_system: 'Corporate VPN', severity: 'high' },
  })
  makeTicket({
    id: 2,
    owner: 'user-2',
    title: 'Install Zoom on my laptop',
    description: 'Please install Zoom for client calls.',
    sub: 'Software install',
    ageHours: 5,
    status: 'in_progress',
    assignee: 'tech-1',
    firstResponseAfterHours: 1,
    extra: { software_name: 'Zoom', department: 'Finance' },
  })
  makeTicket({
    id: 3,
    owner: 'user-1',
    title: 'Need access to the Finance share',
    description: 'I need read access to the Finance reports drive for quarter-end work.',
    sub: 'Access request',
    ageHours: 3,
    approver: 'manager-1',
    extra: { affected_user: 'John Smith', justification: 'Quarter-end reporting' },
  })
  const d = makeTicket({
    id: 4,
    owner: 'user-1',
    title: 'Printer on floor 2 jammed',
    description: 'Paper is stuck and the display shows error E-23.',
    sub: 'Printer issue',
    ageHours: 50,
    status: 'resolved',
    assignee: 'tech-2',
    firstResponseAfterHours: 1,
    resolvedAfterHours: 3,
    extra: { error_message: 'E-23' },
  })
  d.t.resolved_at = iso(now() - 46 * HOUR)
  const e = makeTicket({
    id: 5,
    owner: 'user-2',
    title: 'Password reset for payroll system',
    description: 'Locked out of the payroll system after three failed attempts.',
    sub: 'Password reset',
    ageHours: 120,
    status: 'closed',
    assignee: 'tech-2',
    firstResponseAfterHours: 1,
    resolvedAfterHours: 2,
  })
  e.t.closed_at = iso(now() - 100 * HOUR)
  e.feedback = {
    rating: 5,
    comment: 'Fixed within minutes, thank you!',
    created_at: iso(now() - 99 * HOUR),
  }
  makeTicket({
    id: 6,
    owner: 'user-2',
    title: 'Monitor flickering',
    description: 'The external monitor flickers every few minutes.',
    sub: 'Hardware failure',
    ageHours: 2,
    urgency: 'low',
  })
  a.comments.push(
    {
      id: nid(),
      ticket_id: 1,
      user_id: 'user-1',
      content: 'It happens even when I am on the office network.',
      is_internal: false,
      created_at: iso(now() - 28 * HOUR),
    },
    {
      id: nid(),
      ticket_id: 1,
      user_id: 'tech-1',
      content: 'Thanks, checking the gateway logs now.',
      is_internal: false,
      created_at: iso(now() - 26 * HOUR),
    },
    {
      id: nid(),
      ticket_id: 1,
      user_id: 'tech-1',
      content: 'Internal: gateway 2 is flapping, escalate to network team if it repeats.',
      is_internal: true,
      created_at: iso(now() - 25 * HOUR),
    },
  )
  a.kb.push(2)
  d.comments.push({
    id: nid(),
    ticket_id: 4,
    user_id: 'tech-2',
    content: 'Cleared the jam and replaced the roller. Please confirm it works.',
    is_internal: false,
    created_at: iso(now() - 47 * HOUR),
  })
}
seed()

// ---- helpers ----
const isAdmin = (u: User) => u.role === 'admin'
const canManage = (r: Rec, u: User) =>
  isAdmin(u) || (u.role === 'tech' && r.t.assigned_to_id === u.id)
const canView = (r: Rec, u: User) =>
  r.t.user_id === u.id || r.t.approver_id === u.id || canManage(r, u)

function slaState(t: Ticket): Ticket['sla_status'] {
  if (t.status === 'cancelled') return 'n/a'
  if (!t.sla_response_due || !t.sla_resolution_due) return 'n/a'
  const n = now()
  const respDue = ms(t.sla_response_due)
  const resDue = ms(t.sla_resolution_due)
  const done = t.resolved_at ?? t.closed_at
  if (done) {
    const ok = ms(done) <= resDue && (!t.first_response_at || ms(t.first_response_at) <= respDue)
    return ok ? 'met' : 'breached'
  }
  if (n > resDue || (!t.first_response_at && n > respDue)) return 'breached'
  const responded = t.first_response_at || t.status !== 'open'
  const due = responded ? resDue : respDue
  const window = due - ms(t.created_at) || 1
  return (due - n) / window < 0.25 ? 'at_risk' : 'ok'
}
const out = (r: Rec): Ticket => ({ ...r.t, sla_status: slaState(r.t) })
const detail = (r: Rec) => ({
  ...out(r),
  extra_fields: Object.entries(r.extra).map(([field_name, field_value]) => ({
    field_name,
    field_value,
  })),
  attachments: r.attachments,
  feedback: r.feedback,
})

const NEXT: Record<TicketStatus, TicketStatus[]> = {
  open: ['in_progress', 'cancelled'],
  in_progress: ['on_hold', 'resolved', 'cancelled'],
  on_hold: ['in_progress', 'cancelled'],
  resolved: ['closed', 'cancelled'],
  closed: [],
  cancelled: [],
}

const STOP = new Set([
  'the',
  'and',
  'for',
  'with',
  'that',
  'this',
  'from',
  'have',
  'not',
  'are',
  'was',
])
const terms = (s: string, n = 8) =>
  [...new Set((s.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []).filter((t) => !STOP.has(t)))].slice(
    0,
    n,
  )
const score = (a: KbArticle, ts: string[]) =>
  ts.reduce(
    (sum, t) =>
      sum +
      (a.title.toLowerCase().includes(t) ? 3 : 0) +
      ((a.tags ?? '').toLowerCase().includes(t) ? 2 : 0) +
      (a.body.toLowerCase().includes(t) ? 1 : 0),
    0,
  )
const visibleArticles = (u: User) =>
  articles.filter((a) => a.published || u.role === 'admin' || u.role === 'tech')

function fail(status: number, message: string): never {
  throw new ApiError(status, message)
}
function need(cond: unknown, status: number, message: string): asserts cond {
  if (!cond) fail(status, message)
}
function getTicket(id: number, u: User, staffOnly = false): Rec {
  const r = tickets.find((x) => x.t.id === id)
  if (!r || !(staffOnly ? canManage(r, u) : canView(r, u))) fail(404, 'Ticket not found')
  return r
}
const touch = (r: Rec) => (r.t.updated_at = iso(now()))
const mustBeAdmin = (u: User) => need(isAdmin(u), 403, 'Admin access required')
const mustBeStaff = (u: User) =>
  need(u.role === 'admin' || u.role === 'tech', 403, 'Staff access required')

function applyStatus(r: Rec, u: User, status: TicketStatus) {
  if (status === r.t.status) return
  need(NEXT[r.t.status].includes(status), 409, `Cannot move ticket from ${r.t.status} to ${status}`)
  need(
    !(r.t.approval_status === 'pending' && status !== 'cancelled'),
    409,
    'Waiting for manager approval',
  )
  addHistory(r, u.id, 'status', r.t.status, status, 'status_change')
  if (!r.t.first_response_at && r.t.user_id !== u.id) r.t.first_response_at = iso(now())
  if (status === 'resolved') r.t.resolved_at = iso(now())
  if (status === 'closed') r.t.closed_at = iso(now())
  r.t.status = status
}
function applyAssignee(r: Rec, u: User, id: string | null) {
  if (id !== null) need(['tech-1', 'tech-2', 'admin-1'].includes(id), 422, 'Unknown staff member')
  if (id === r.t.assigned_to_id) return
  addHistory(r, u.id, 'assignee', r.t.assigned_to_id, id, 'assigned')
  r.t.assigned_to_id = id
  r.t.assigned_at = id ? iso(now()) : null
}

// ---- AI (simulated) ----
function aiCategorize(title: string, description: string) {
  const text = `${title} ${description}`.toLowerCase()
  const rules: [RegExp, string, string][] = [
    [/vpn|internet|wifi|wi-fi|network/, 'Internet problem', 'a connectivity problem'],
    [/printer|print|toner|jam/, 'Printer issue', 'a printer problem'],
    [/password|locked out|login/, 'Password reset', 'an account access problem'],
    [/access|permission|share|folder/, 'Access request', 'a request for access'],
    [/install|software|license|licence/, 'Software install', 'a software request'],
    [/monitor|laptop|keyboard|screen|broken/, 'Hardware failure', 'a hardware fault'],
  ]
  const hit = rules.find(([re]) => re.test(text))
  const s = hit ? sub(hit[1]) : null
  const urgency: Urgency = /urgent|down|cannot|can't|blocked|outage|asap/.test(text)
    ? 'high'
    : /whenever|nice to have|no rush/.test(text)
      ? 'low'
      : 'medium'
  return {
    category_id: s?.category_id ?? 1,
    subcategory_id: s?.id ?? null,
    urgency,
    reasoning: hit
      ? `Reads like ${hit[2]}, so it fits "${hit[1]}".`
      : 'No clear match, so it was filed as a general service request.',
  }
}

// ---- router ----
function match(path: string, pattern: string): string[] | null {
  const m = new RegExp(`^${pattern}$`).exec(path)
  return m ? m.slice(1) : null
}
const num = (s: string) => Number(s)

// Loosely typed request body: the demo trusts its own UI, and bad input is rejected by `need`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Body = Record<string, any>

export async function demoRequest<T>(
  method: string,
  rawPath: string,
  rawBody: unknown,
  token: string | null,
): Promise<T> {
  await new Promise((resolve) => setTimeout(resolve, 60))
  const [path, qs = ''] = rawPath.split('?')
  const q = new URLSearchParams(qs)
  const user = token ? USERS[token] : undefined
  need(user, 401, 'Invalid or expired token')
  const body: Body = typeof rawBody === 'string' && rawBody ? JSON.parse(rawBody) : {}
  const u: User = user
  let m: string[] | null

  if (method === 'GET' && path === '/me') return u as T
  if (method === 'GET' && path === '/categories') return CATEGORIES as T
  if (method === 'GET' && (m = match(path, '/categories/(\\d+)/subcategories')))
    return SUBS.filter((s) => s.category_id === num(m![0])) as T
  if (method === 'GET' && path === '/staff') {
    mustBeAdmin(u)
    return Object.values(USERS).filter((x) => x.role !== 'user') as T
  }

  // tickets
  if (path === '/tickets' && method === 'GET') {
    let list = tickets.filter((r) =>
      q.get('mine') === 'true' || u.role === 'user'
        ? r.t.user_id === u.id
        : isAdmin(u)
          ? true
          : r.t.user_id === u.id || r.t.assigned_to_id === u.id,
    )
    const status = q.get('status'),
      cat = q.get('category_id'),
      pr = q.get('priority'),
      as = q.get('assignee_id'),
      search = q.get('search')?.toLowerCase()
    if (status) list = list.filter((r) => r.t.status === status)
    if (cat) list = list.filter((r) => r.t.category_id === num(cat))
    if (pr) list = list.filter((r) => r.t.priority === pr)
    if (as) list = list.filter((r) => r.t.assigned_to_id === as)
    if (q.get('unassigned') === 'true') list = list.filter((r) => !r.t.assigned_to_id)
    if (q.get('created_from'))
      list = list.filter(
        (r) => ms(r.t.created_at) >= new Date(q.get('created_from') + 'T00:00:00Z').getTime(),
      )
    if (q.get('created_to'))
      list = list.filter(
        (r) => ms(r.t.created_at) <= new Date(q.get('created_to') + 'T23:59:59Z').getTime(),
      )
    if (q.get('sla_breached') === 'true')
      list = list.filter(
        (r) =>
          ['open', 'in_progress', 'on_hold'].includes(r.t.status) && slaState(r.t) === 'breached',
      )
    if (search)
      list = list.filter((r) => `${r.t.title} ${r.t.description}`.toLowerCase().includes(search))
    list = [...list].sort((x, y) => y.t.id - x.t.id)
    const page = num(q.get('page') ?? '1'),
      size = num(q.get('page_size') ?? '20')
    return {
      items: list.slice((page - 1) * size, page * size).map(out),
      total: list.length,
      page,
      page_size: size,
    } as T
  }
  if (path === '/tickets' && method === 'POST') {
    const s = body.subcategory_id ? SUBS.find((x) => x.id === body.subcategory_id) : undefined
    need(
      CATEGORIES.some((c) => c.id === body.category_id),
      422,
      'Unknown category',
    )
    need(
      !body.subcategory_id || (s && s.category_id === body.category_id),
      422,
      'Subcategory does not belong to category',
    )
    need(
      String(body.title ?? '').trim() && String(body.description ?? '').trim(),
      422,
      'Title and description are required',
    )
    const manager = user.manager_id
    const r = makeTicket({
      id: nid(),
      owner: u.id,
      title: body.title,
      description: body.description,
      sub: s?.name ?? 'New user',
      ageHours: 0,
      urgency: body.urgency,
      approver: s?.requires_approval ? (manager ?? '') : undefined,
      extra: body.extra_fields ?? {},
    })
    if (!s) r.t.subcategory_id = null
    if (s?.requires_approval && !manager) r.t.approver_id = null
    r.t.category_id = body.category_id
    const sla = slaFor(body.category_id)
    r.t.sla_response_due = iso(now() + sla.response * HOUR)
    r.t.sla_resolution_due = iso(now() + sla.resolution * HOUR)
    return detail(r) as T
  }
  if (path === '/tickets/bulk' && method === 'POST') {
    mustBeAdmin(u)
    const updated: number[] = [],
      failed: { id: number; reason: string }[] = []
    for (const id of new Set<number>(body.ticket_ids ?? [])) {
      try {
        const r = getTicket(id, u, true)
        if (body.assignee_id) applyAssignee(r, u, body.assignee_id)
        if (body.status) applyStatus(r, u, body.status)
        if (body.priority && body.priority !== r.t.priority) {
          addHistory(r, u.id, 'priority', r.t.priority, body.priority, 'priority_change')
          r.t.priority = body.priority
        }
        touch(r)
        updated.push(id)
      } catch (err) {
        failed.push({ id, reason: (err as Error).message })
      }
    }
    return { updated, failed } as T
  }
  if ((m = match(path, '/tickets/(\\d+)'))) {
    const id = num(m[0])
    if (method === 'GET') return detail(getTicket(id, u)) as T
    if (method === 'PATCH') {
      mustBeStaff(u)
      const r = getTicket(id, u, true)
      if (body.status) applyStatus(r, u, body.status)
      if (body.priority && body.priority !== r.t.priority) {
        addHistory(r, u.id, 'priority', r.t.priority, body.priority, 'priority_change')
        r.t.priority = body.priority
      }
      touch(r)
      return out(r) as T
    }
  }
  if ((m = match(path, '/tickets/(\\d+)/assignee')) && method === 'PUT') {
    mustBeAdmin(u)
    const r = getTicket(num(m[0]), u, true)
    applyAssignee(r, u, body.assignee_id ?? null)
    touch(r)
    return out(r) as T
  }
  if ((m = match(path, '/tickets/(\\d+)/reopen')) && method === 'POST') {
    const r = getTicket(num(m[0]), u)
    need(r.t.status === 'resolved', 409, 'Only resolved tickets can be reopened')
    need(
      r.t.resolved_at && now() - ms(r.t.resolved_at) <= 7 * DAY,
      409,
      'Reopen window has expired',
    )
    addHistory(r, u.id, 'status', 'resolved', 'open', 'reopened')
    r.t.status = 'open'
    r.t.resolved_at = null
    r.t.reopen_count += 1
    return out(r) as T
  }
  if ((m = match(path, '/tickets/(\\d+)/comments'))) {
    const r = getTicket(num(m[0]), u)
    if (method === 'GET') return r.comments.filter((c) => !c.is_internal || canManage(r, u)) as T
    need(String(body.content ?? '').trim(), 422, 'Comment cannot be empty')
    need(!body.is_internal || canManage(r, u), 403, 'Only assigned staff can post internal notes')
    const c: Comment = {
      id: nid(),
      ticket_id: r.t.id,
      user_id: u.id,
      content: body.content,
      is_internal: !!body.is_internal,
      created_at: iso(now()),
    }
    r.comments.push(c)
    if (!c.is_internal && !r.t.first_response_at && canManage(r, u) && r.t.user_id !== u.id)
      r.t.first_response_at = iso(now())
    addHistory(r, u.id, 'comment', null, c.is_internal ? 'internal' : 'public', 'comment_added')
    return c as T
  }
  if ((m = match(path, '/tickets/(\\d+)/history'))) {
    mustBeStaff(u)
    return getTicket(num(m[0]), u, true).history as T
  }
  if ((m = match(path, '/tickets/(\\d+)/attachments')) && method === 'POST') {
    const r = getTicket(num(m[0]), u)
    const file = (rawBody as FormData).get('file') as File
    const att: Attachment = {
      id: nid(),
      ticket_id: r.t.id,
      file_name: file.name,
      file_size: file.size,
      uploaded_by_id: u.id,
      created_at: iso(now()),
    }
    r.attachments.push(att)
    addHistory(r, u.id, 'attachment', null, file.name, 'attachment_added')
    return att as T
  }
  if ((m = match(path, '/tickets/(\\d+)/approval')) && method === 'POST') {
    const r = getTicket(num(m[0]), u)
    need(r.t.approval_status === 'pending', 409, 'This ticket is not waiting for approval')
    need(r.t.user_id !== u.id, 403, 'You cannot approve your own request')
    need(isAdmin(u) || r.t.approver_id === u.id, 403, 'Only the approver can decide')
    const approve = body.decision === 'approve'
    r.t.approval_status = approve ? 'approved' : 'rejected'
    r.t.approval_decided_by_id = u.id
    r.t.approval_comment = body.comment ?? null
    addHistory(
      r,
      u.id,
      'approval',
      'pending',
      r.t.approval_status,
      `approval_${r.t.approval_status}`,
    )
    if (!approve) {
      addHistory(r, u.id, 'status', r.t.status, 'cancelled', 'status_change')
      r.t.status = 'cancelled'
    }
    return out(r) as T
  }
  if ((m = match(path, '/tickets/(\\d+)/feedback')) && method === 'POST') {
    const r = getTicket(num(m[0]), u)
    need(r.t.user_id === u.id, 403, 'Only the submitter can rate a ticket')
    need(['resolved', 'closed'].includes(r.t.status), 409, 'Only resolved tickets can be rated')
    need(!r.feedback, 409, 'This ticket was already rated')
    need(body.rating >= 1 && body.rating <= 5, 422, 'Rating must be between 1 and 5')
    r.feedback = { rating: body.rating, comment: body.comment ?? null, created_at: iso(now()) }
    addHistory(r, u.id, 'feedback', null, body.rating, 'feedback_submitted')
    return r.feedback as T
  }
  if ((m = match(path, '/tickets/(\\d+)/kb(?:/(\\d+))?'))) {
    const r = getTicket(num(m[0]), u, method !== 'GET')
    const linked = () =>
      r.kb
        .map((id) => articles.find((a) => a.id === id)!)
        .filter((a) => a.published || u.role === 'admin' || u.role === 'tech')
    if (method === 'GET') return linked() as T
    mustBeStaff(u)
    if (method === 'POST') {
      const a = articles.find((x) => x.id === body.article_id)
      need(a && a.published, 404, 'Article not found')
      if (!r.kb.includes(a.id)) {
        r.kb.push(a.id)
        addHistory(r, u.id, 'kb_article', null, a.title, 'kb_linked')
      }
    } else r.kb = r.kb.filter((id) => id !== num(m![1]))
    return linked() as T
  }
  if ((m = match(path, '/tickets/(\\d+)/duplicates'))) {
    mustBeStaff(u)
    const r = getTicket(num(m[0]), u, true)
    const mine = new Set(terms(`${r.t.title} ${r.t.description}`, 40))
    return tickets
      .filter((o) => o.t.id !== r.t.id && ['open', 'in_progress', 'on_hold'].includes(o.t.status))
      .map((o) => {
        const theirs = new Set(terms(`${o.t.title} ${o.t.description}`, 40))
        const inter = [...mine].filter((x) => theirs.has(x)).length
        return {
          id: o.t.id,
          title: o.t.title,
          status: o.t.status,
          score: Math.round((inter / new Set([...mine, ...theirs]).size) * 100) / 100,
        }
      })
      .filter((d) => d.score >= 0.35)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5) as T
  }
  if ((m = match(path, '/tickets/(\\d+)/ai/suggest-response')) && method === 'POST') {
    mustBeStaff(u)
    const r = getTicket(num(m[0]), u, true)
    const ts = terms(`${r.t.title} ${r.t.description}`)
    const picked = [
      ...new Set([
        ...r.kb,
        ...articles
          .filter((a) => a.published && score(a, ts) > 0)
          .sort((a, b) => score(b, ts) - score(a, ts))
          .map((a) => a.id),
      ]),
    ]
      .slice(0, 3)
      .map((id) => articles.find((a) => a.id === id)!)
    const first = (userById(r.t.user_id)?.name ?? 'there').split(' ')[0]
    const draft = picked.length
      ? `Hi ${first},\n\nThanks for reporting "${r.t.title}". Our guide "${picked[0].title}" covers this: ${picked[0].body}\n\nIf that does not solve it, reply here with what you see and I will take a closer look.`
      : `Hi ${first},\n\nThanks for reporting "${r.t.title}". To help me look into it, could you tell me when it started and any error message you see?`
    return { draft, used_article_ids: picked.slice(0, 1).map((a) => a.id), articles: picked } as T
  }

  // approvals, KB, SLA, reports, AI
  if (path === '/approvals')
    return tickets
      .filter((r) => r.t.approval_status === 'pending' && (isAdmin(u) || r.t.approver_id === u.id))
      .map(out) as T
  if (path === '/kb/articles' && method === 'GET') {
    const ts = terms(q.get('q') ?? ''),
      cat = q.get('category_id')
    let list = visibleArticles(u).filter((a) => !cat || a.category_id === num(cat))
    if (ts.length)
      list = list.filter((a) => score(a, ts) > 0).sort((a, b) => score(b, ts) - score(a, ts))
    else list = [...list].sort((a, b) => ms(b.updated_at) - ms(a.updated_at))
    const page = num(q.get('page') ?? '1'),
      size = num(q.get('page_size') ?? '20')
    return {
      items: list.slice((page - 1) * size, page * size),
      total: list.length,
      page,
      page_size: size,
    } as T
  }
  if (path === '/kb/articles' && method === 'POST') {
    mustBeAdmin(u)
    need(
      String(body.title ?? '').trim() && String(body.body ?? '').trim(),
      422,
      'Title and body are required',
    )
    const a: KbArticle = {
      id: nid(),
      title: body.title,
      body: body.body,
      tags: body.tags ?? null,
      category_id: body.category_id ?? null,
      published: !!body.published,
      created_by_id: u.id,
      created_at: iso(now()),
      updated_at: iso(now()),
    }
    articles.push(a)
    return a as T
  }
  if (path === '/kb/suggest') {
    const ts = terms(q.get('q') ?? ''),
      cat = q.get('category_id')
    return articles
      .filter((a) => a.published)
      .map((a) => ({ a, s: score(a, ts) + (cat && a.category_id === num(cat) ? 2 : 0) }))
      .filter((x) => x.s > 0)
      .sort((x, y) => y.s - x.s)
      .slice(0, 5)
      .map((x) => x.a) as T
  }
  if ((m = match(path, '/kb/articles/(\\d+)'))) {
    const a = visibleArticles(u).find((x) => x.id === num(m![0]))
    need(a, 404, 'Article not found')
    if (method === 'GET') return a as T
    mustBeAdmin(u)
    if (method === 'DELETE') {
      articles.splice(articles.indexOf(a), 1)
      tickets.forEach((r) => (r.kb = r.kb.filter((id) => id !== a.id)))
      return undefined as T
    }
    Object.assign(a, {
      title: body.title ?? a.title,
      body: body.body ?? a.body,
      tags: body.tags ?? null,
      category_id: body.category_id ?? null,
      published: body.published ?? a.published,
      updated_at: iso(now()),
    })
    return a as T
  }
  if (path === '/sla-rules' && method === 'GET') {
    mustBeAdmin(u)
    return CATEGORIES.map((c) => ({
      category_id: c.id,
      category_name: c.name,
      response_hours: slaFor(c.id).response,
      resolution_hours: slaFor(c.id).resolution,
      custom: !!slaRules[c.id],
    })) as T
  }
  if ((m = match(path, '/sla-rules/(\\d+)'))) {
    mustBeAdmin(u)
    const id = num(m[0])
    if (method === 'DELETE') {
      delete slaRules[id]
      return undefined as T
    }
    need(
      body.resolution_hours >= body.response_hours,
      422,
      'Resolution target cannot be shorter than the response target',
    )
    slaRules[id] = { response: body.response_hours, resolution: body.resolution_hours }
    return CATEGORIES.map((c) => ({
      category_id: c.id,
      category_name: c.name,
      response_hours: slaFor(c.id).response,
      resolution_hours: slaFor(c.id).resolution,
      custom: !!slaRules[c.id],
    })) as T
  }
  if (path === '/dashboard') {
    mustBeAdmin(u)
    const by = (key: (r: Rec) => string) =>
      tickets.reduce<Record<string, number>>(
        (acc, r) => ({ ...acc, [key(r)]: (acc[key(r)] ?? 0) + 1 }),
        {},
      )
    const hrs = tickets
      .filter((r) => r.t.resolved_at)
      .map((r) => (ms(r.t.resolved_at!) - ms(r.t.created_at)) / HOUR)
    return {
      total: tickets.length,
      by_status: by((r) => r.t.status),
      by_category: by((r) => CATEGORIES.find((c) => c.id === r.t.category_id)!.name),
      by_priority: by((r) => r.t.priority),
      avg_resolution_hours: hrs.length
        ? Math.round((hrs.reduce((a, b) => a + b, 0) / hrs.length) * 100) / 100
        : null,
    } as T
  }
  if (path === '/reports') {
    mustBeAdmin(u)
    const active = ['open', 'in_progress', 'on_hold']
    const open = tickets.filter((r) => active.includes(r.t.status))
    const done = tickets.filter((r) => ['resolved', 'closed'].includes(r.t.status))
    const avg = (xs: number[]) =>
      xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100 : null
    const pct = (a: number, b: number) => (b ? Math.round((1000 * a) / b) / 10 : null)
    const responded = tickets.filter((r) => r.t.first_response_at)
    const ratings = tickets.filter((r) => r.feedback).map((r) => r.feedback!.rating)
    const load: Record<string, { open: number; resolved: number }> = {}
    tickets.forEach((r) => {
      if (!r.t.assigned_to_id || r.t.status === 'cancelled') return
      const row = (load[r.t.assigned_to_id] ??= { open: 0, resolved: 0 })
      row[active.includes(r.t.status) ? 'open' : 'resolved'] += 1
    })
    return {
      open_count: open.length,
      resolved_count: done.length,
      avg_resolution_hours: avg(
        done.map((r) => (ms((r.t.resolved_at ?? r.t.closed_at)!) - ms(r.t.created_at)) / HOUR),
      ),
      avg_first_response_hours: avg(
        responded.map((r) => (ms(r.t.first_response_at!) - ms(r.t.created_at)) / HOUR),
      ),
      response_sla_met_pct: pct(
        responded.filter((r) => ms(r.t.first_response_at!) <= ms(r.t.sla_response_due!)).length,
        responded.length,
      ),
      resolution_sla_met_pct: pct(
        done.filter((r) => ms((r.t.resolved_at ?? r.t.closed_at)!) <= ms(r.t.sla_resolution_due!))
          .length,
        done.length,
      ),
      unassigned_open: open.filter((r) => !r.t.assigned_to_id).length,
      pending_approval: tickets.filter((r) => r.t.approval_status === 'pending').length,
      feedback_count: ratings.length,
      avg_satisfaction: avg(ratings),
      by_assignee: Object.entries(load)
        .map(([assignee_id, v]) => ({ assignee_id, ...v }))
        .sort((a, b) => a.assignee_id.localeCompare(b.assignee_id)),
    } as T
  }
  if (path === '/ai/status') return { enabled: true, model: 'demo (simulated)' } as T
  if (path === '/ai/categorize' && method === 'POST')
    return aiCategorize(body.title ?? '', body.description ?? '') as T

  fail(404, `Not found: ${method} ${path}`)
}
