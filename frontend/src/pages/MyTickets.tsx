import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../services/api'
import TicketList from '../components/TicketList/TicketList'

const STATUSES = ['', 'open', 'in_progress', 'on_hold', 'resolved', 'closed', 'cancelled']

export default function MyTickets({ scope = 'mine' }: { scope?: 'mine' | 'all' }) {
  const [status, setStatus] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const categories = useQuery({ queryKey: ['categories'], queryFn: api.categories })
  const tickets = useQuery({
    queryKey: ['tickets', { scope, status, categoryId, search, page }],
    queryFn: () =>
      api.listTickets({
        status: status || undefined,
        categoryId: categoryId ? Number(categoryId) : undefined,
        search: search || undefined,
        mine: scope === 'mine',
        page,
      }),
  })

  const totalPages = tickets.data
    ? Math.max(1, Math.ceil(tickets.data.total / tickets.data.page_size))
    : 1

  return (
    <section className="card">
      <h2>{scope === 'all' ? 'All Tickets' : 'My Tickets'}</h2>
      <div className="filters">
        <input
          aria-label="Search tickets"
          placeholder="Search…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(1)
          }}
        />
        <select
          aria-label="Filter by status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value)
            setPage(1)
          }}
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
          onChange={(e) => {
            setCategoryId(e.target.value)
            setPage(1)
          }}
        >
          <option value="">All categories</option>
          {categories.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      {tickets.isLoading && <p className="muted">Loading…</p>}
      {tickets.error && <p className="error">{(tickets.error as Error).message}</p>}
      {tickets.data && <TicketList tickets={tickets.data.items} admin={scope === 'all'} />}
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
