import { Link } from 'react-router-dom'
import type { Ticket } from '../../types'
import StatusBadge from '../StatusBadge/StatusBadge'

export default function TicketList({
  tickets,
  admin = false,
}: {
  tickets: Ticket[]
  admin?: boolean
}) {
  if (tickets.length === 0) return <p className="muted">No tickets found.</p>
  return (
    <table className="table">
      <thead>
        <tr>
          <th>#</th>
          <th>Title</th>
          <th>Status</th>
          <th>Urgency</th>
          {admin && <th>Priority</th>}
          {admin && <th>Submitted by</th>}
          <th>Created</th>
        </tr>
      </thead>
      <tbody>
        {tickets.map((t) => (
          <tr key={t.id}>
            <td>{t.id}</td>
            <td>
              <Link to={`/tickets/${t.id}`}>{t.title}</Link>
            </td>
            <td>
              <StatusBadge status={t.status} />
            </td>
            <td>{t.urgency}</td>
            {admin && <td>{t.priority}</td>}
            {admin && <td>{t.user_id}</td>}
            <td>{new Date(t.created_at + 'Z').toLocaleDateString()}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
