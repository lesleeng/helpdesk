import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../services/api'
import { useAuth } from '../hooks/useAuth'
import TicketList from '../components/TicketList/TicketList'
import type { Priority, TicketStatus } from '../types'

const STATUSES = ['', 'open', 'in_progress', 'on_hold', 'resolved', 'closed', 'cancelled']
const PRIORITIES: Priority[] = ['low', 'medium', 'high', 'urgent']
const UNASSIGNED = '__none__'

type Scope = 'mine' | 'all' | 'assigned'
const TITLES: Record<Scope, string> = {
  mine: 'My Tickets',
  all: 'All Tickets',
  assigned: 'Assigned to me',
}

export default function MyTickets({ scope = 'mine' }: { scope?: Scope }) {
  const { user } = useAuth()
  const qc = useQueryClient()
  const [status, setStatus] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [priority, setPriority] = useState('')
  const [assignee, setAssignee] = useState('')
  const [createdFrom, setCreatedFrom] = useState('')
  const [createdTo, setCreatedTo] = useState('')
  const [slaBreached, setSlaBreached] = useState(false)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<number[]>([])
  const [bulkStatus, setBulkStatus] = useState('')
  const [bulkPriority, setBulkPriority] = useState('')
  const [bulkAssignee, setBulkAssignee] = useState('')
  const [bulkFailures, setBulkFailures] = useState('')

  const isStaffScope = scope !== 'mine'
  const filter =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      set(value)
      setPage(1)
    }

  const categories = useQuery({ queryKey: ['categories'], queryFn: api.categories })
  const staff = useQuery({ queryKey: ['staff'], queryFn: api.staff, enabled: scope === 'all' })
  const params = {
    status: status || undefined,
    categoryId: categoryId ? Number(categoryId) : undefined,
    priority: priority || undefined,
    assigneeId:
      scope === 'assigned' ? user?.id : assignee && assignee !== UNASSIGNED ? assignee : undefined,
    unassigned: assignee === UNASSIGNED,
    createdFrom: createdFrom || undefined,
    createdTo: createdTo || undefined,
    slaBreached,
    search: search || undefined,
    mine: scope === 'mine',
    page,
  }
  const tickets = useQuery({
    queryKey: ['tickets', { scope, ...params }],
    queryFn: () => api.listTickets(params),
  })
  const bulk = useMutation({
    mutationFn: () =>
      api.bulkUpdate({
        ticket_ids: selected,
        status: (bulkStatus || undefined) as TicketStatus | undefined,
        priority: (bulkPriority || undefined) as Priority | undefined,
        assignee_id: bulkAssignee || undefined,
      }),
    onSuccess: (result) => {
      setBulkFailures(result.failed.map((f) => `#${f.id}: ${f.reason}`).join('; '))
      setSelected([])
      setBulkStatus('')
      setBulkPriority('')
      setBulkAssignee('')
      qc.invalidateQueries({ queryKey: ['tickets'] })
    },
  })

  const totalPages = tickets.data
    ? Math.max(1, Math.ceil(tickets.data.total / tickets.data.page_size))
    : 1

  return (
    <section className="card">
      <h2>{TITLES[scope]}</h2>
      <div className="filters">
        <input
          aria-label="Search tickets"
          placeholder="Search…"
          value={search}
          onChange={(e) => filter(setSearch)(e.target.value)}
        />
        <select
          aria-label="Filter by status"
          value={status}
          onChange={(e) => filter(setStatus)(e.target.value)}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s === '' ? 'All statuses' : s.replace('_', ' ')}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by category"
          value={categoryId}
          onChange={(e) => filter(setCategoryId)(e.target.value)}
        >
          <option value="">All categories</option>
          {categories.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {isStaffScope && (
          <>
            <select
              aria-label="Filter by priority"
              value={priority}
              onChange={(e) => filter(setPriority)(e.target.value)}
            >
              <option value="">All priorities</option>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <input
              type="date"
              aria-label="Created from"
              value={createdFrom}
              onChange={(e) => filter(setCreatedFrom)(e.target.value)}
            />
            <input
              type="date"
              aria-label="Created to"
              value={createdTo}
              onChange={(e) => filter(setCreatedTo)(e.target.value)}
            />
          </>
        )}
        {scope === 'all' && (
          <>
            <select
              aria-label="Filter by assignee"
              value={assignee}
              onChange={(e) => filter(setAssignee)(e.target.value)}
            >
              <option value="">All assignees</option>
              <option value={UNASSIGNED}>Unassigned</option>
              {staff.data?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <label>
              <input
                type="checkbox"
                checked={slaBreached}
                onChange={(e) => filter(setSlaBreached)(e.target.checked)}
              />{' '}
              SLA breached
            </label>
          </>
        )}
      </div>
      {scope === 'all' && selected.length > 0 && (
        <div className="filters">
          <select
            aria-label="Bulk status"
            value={bulkStatus}
            onChange={(e) => setBulkStatus(e.target.value)}
          >
            <option value="">Set status…</option>
            {STATUSES.filter(Boolean).map((s) => (
              <option key={s} value={s}>
                {s.replace('_', ' ')}
              </option>
            ))}
          </select>
          <select
            aria-label="Bulk priority"
            value={bulkPriority}
            onChange={(e) => setBulkPriority(e.target.value)}
          >
            <option value="">Set priority…</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <select
            aria-label="Bulk assignee"
            value={bulkAssignee}
            onChange={(e) => setBulkAssignee(e.target.value)}
          >
            <option value="">Assign to…</option>
            {staff.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button
            onClick={() => bulk.mutate()}
            disabled={bulk.isPending || (!bulkStatus && !bulkPriority && !bulkAssignee)}
          >
            Apply to {selected.length} {selected.length === 1 ? 'ticket' : 'tickets'}
          </button>
        </div>
      )}
      {bulk.error && <p className="error">{(bulk.error as Error).message}</p>}
      {bulkFailures && <p className="error">Some tickets were not updated. {bulkFailures}</p>}
      {tickets.isLoading && <p className="muted">Loading…</p>}
      {tickets.error && <p className="error">{(tickets.error as Error).message}</p>}
      {tickets.data && (
        <TicketList
          tickets={tickets.data.items}
          staff={isStaffScope}
          selection={scope === 'all' ? { selected, onChange: setSelected } : undefined}
        />
      )}
      <div className="pager">
        <button disabled={page <= 1} onClick={() => setPage(page - 1)}>
          Previous
        </button>
        <span>
          Page {page} of {totalPages}
        </span>
        <button disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
          Next
        </button>
      </div>
    </section>
  )
}
