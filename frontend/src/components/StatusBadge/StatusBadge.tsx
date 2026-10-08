import type { TicketStatus } from '../../types'

const LABELS: Record<TicketStatus, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  on_hold: 'On Hold',
  resolved: 'Resolved',
  closed: 'Closed',
  cancelled: 'Cancelled',
}

const NEXT: Record<TicketStatus, TicketStatus[]> = {
  open: ['in_progress', 'cancelled'],
  in_progress: ['on_hold', 'resolved', 'cancelled'],
  on_hold: ['in_progress', 'cancelled'],
  resolved: ['closed', 'cancelled'],
  closed: [],
  cancelled: [],
}

export function nextStatuses(status: TicketStatus): TicketStatus[] {
  return NEXT[status]
}

export function statusLabel(status: TicketStatus): string {
  return LABELS[status]
}

export default function StatusBadge({ status }: { status: TicketStatus }) {
  return <span className={`badge badge-${status}`}>{LABELS[status]}</span>
}
