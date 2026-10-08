import { Link } from 'react-router-dom'
import type { Ticket } from '../../types'
import StatusBadge from '../StatusBadge/StatusBadge'

interface Selection {
  selected: number[]
  onChange: (ids: number[]) => void
}

export default function TicketList({
  tickets,
  staff = false,
  selection,
}: {
  tickets: Ticket[]
  staff?: boolean
  selection?: Selection
}) {
  if (tickets.length === 0) return <p className="muted">No tickets found.</p>
  const allSelected =
    selection !== undefined && tickets.every((t) => selection.selected.includes(t.id))
  const toggle = (id: number) =>
    selection?.onChange(
      selection.selected.includes(id)
        ? selection.selected.filter((s) => s !== id)
        : [...selection.selected, id],
    )
  const toggleAll = () =>
    selection?.onChange(
      allSelected
        ? selection.selected.filter((s) => !tickets.some((t) => t.id === s))
        : [...new Set([...selection.selected, ...tickets.map((t) => t.id)])],
    )
  return (
    <table className="table">
      <thead>
        <tr>
          {selection && (
            <th>
              <input
                type="checkbox"
                aria-label="Select all tickets"
                checked={allSelected}
                onChange={toggleAll}
              />
            </th>
          )}
          <th>#</th>
          <th>Title</th>
          <th>Status</th>
          <th>Urgency</th>
          {staff && <th>Priority</th>}
          {staff && <th>Submitted by</th>}
          {staff && <th>Assignee</th>}
          {staff && <th>SLA</th>}
          <th>Created</th>
        </tr>
      </thead>
      <tbody>
        {tickets.map((t) => (
          <tr key={t.id}>
            {selection && (
              <td>
                <input
                  type="checkbox"
                  aria-label={`Select ticket #${t.id}`}
                  checked={selection.selected.includes(t.id)}
                  onChange={() => toggle(t.id)}
                />
              </td>
            )}
            <td>{t.id}</td>
            <td>
              <Link to={`/tickets/${t.id}`}>{t.title}</Link>
            </td>
            <td>
              <StatusBadge status={t.status} />
            </td>
            <td>{t.urgency}</td>
            {staff && <td>{t.priority}</td>}
            {staff && <td>{t.user_id}</td>}
            {staff && <td>{t.assigned_to_id ?? '—'}</td>}
            {staff && <td>{t.sla_status.replace(/_/g, ' ')}</td>}
            <td>{new Date(t.created_at + 'Z').toLocaleDateString()}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
