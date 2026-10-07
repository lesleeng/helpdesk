import type { TicketStatus } from '../../types'

const LABELS: Record<TicketStatus, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  on_hold: 'On Hold',
  resolved: 'Resolved',
  closed: 'Closed',
  cancelled: 'Cancelled',
}

export function statusLabel(status: TicketStatus): string {
  return LABELS[status]
}

export default function StatusBadge({ status }: { status: TicketStatus }) {
  return <span className={`badge badge-${status}`}>{LABELS[status]}</span>
}
