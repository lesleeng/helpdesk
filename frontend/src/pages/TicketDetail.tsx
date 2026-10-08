import { useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../services/api'
import { useAuth } from '../hooks/useAuth'
import StatusBadge, { nextStatuses, statusLabel } from '../components/StatusBadge/StatusBadge'
import CommentThread from '../components/CommentThread/CommentThread'
import type { Priority, TicketStatus } from '../types'

const PRIORITIES: Priority[] = ['low', 'medium', 'high', 'urgent']
const UNASSIGNED = '__none__'

export default function TicketDetail() {
  const id = Number(useParams().id)
  const { user } = useAuth()
  const qc = useQueryClient()
  const fileInput = useRef<HTMLInputElement>(null)
  const isAdmin = user?.role === 'admin'
  const [newStatus, setNewStatus] = useState<TicketStatus | ''>('')
  const [newPriority, setNewPriority] = useState<Priority | ''>('')
  const [newAssignee, setNewAssignee] = useState('')

  const ticket = useQuery({ queryKey: ['ticket', id], queryFn: () => api.getTicket(id) })
  const canManage = isAdmin || (user?.role === 'tech' && ticket.data?.assigned_to_id === user.id)
  const staff = useQuery({ queryKey: ['staff'], queryFn: api.staff, enabled: isAdmin })
  const history = useQuery({
    queryKey: ['history', id],
    queryFn: () => api.history(id),
    enabled: canManage,
  })
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['ticket', id] })
    qc.invalidateQueries({ queryKey: ['tickets'] })
    qc.invalidateQueries({ queryKey: ['history', id] })
  }
  const update = useMutation({
    mutationFn: async () => {
      if (newAssignee) await api.assignTicket(id, newAssignee === UNASSIGNED ? null : newAssignee)
      if (newStatus || newPriority) {
        await api.updateTicket(id, {
          status: newStatus || undefined,
          priority: newPriority || undefined,
        })
      }
    },
    onSuccess: () => {
      setNewStatus('')
      setNewPriority('')
      setNewAssignee('')
      refresh()
    },
  })
  const reopen = useMutation({ mutationFn: () => api.reopenTicket(id), onSuccess: refresh })
  const upload = useMutation({
    mutationFn: (file: File) => api.uploadAttachment(id, file),
    onSuccess: refresh,
  })

  if (ticket.isLoading) return <p className="muted">Loading…</p>
  if (ticket.error || !ticket.data) {
    return (
      <p className="error">
        {(ticket.error as Error | null)?.message ?? 'Ticket not found'}{' '}
        <Link to="/tickets">Back to tickets</Link>
      </p>
    )
  }

  const t = ticket.data
  const canReopen = t.status === 'resolved' && t.user_id === user?.id
  const assigneeName = (staffId?: string | null) =>
    staffId ? (staff.data?.find((m) => m.id === staffId)?.name ?? staffId) : 'Unassigned'

  return (
    <>
      <section className="card">
        <Link to="/tickets">← Back</Link>
        <h2>
          #{t.id} {t.title} <StatusBadge status={t.status} />
        </h2>
        <p className="muted">
          Urgency: {t.urgency} · Priority: {t.priority} · Created{' '}
          {new Date(t.created_at + 'Z').toLocaleString()}
        </p>
        {t.sla_resolution_due && canManage && (
          <p className="muted">
            Assigned to: {assigneeName(t.assigned_to_id)} · SLA: {t.sla_status.replace(/_/g, ' ')} ·
            Response due {new Date(t.sla_response_due + 'Z').toLocaleString()} · Resolution due{' '}
            {new Date(t.sla_resolution_due + 'Z').toLocaleString()}
          </p>
        )}
        <p className="pre">{t.description}</p>
        {t.extra_fields.length > 0 && (
          <dl className="extra">
            {t.extra_fields.map((f) => (
              <div key={f.field_name}>
                <dt>{f.field_name.replace(/_/g, ' ')}</dt>
                <dd>{f.field_value}</dd>
              </div>
            ))}
          </dl>
        )}
        {canManage && (
          <>
            <div className="field">
              <label htmlFor="status">Status</label>
              <select
                id="status"
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value as TicketStatus | '')}
              >
                <option value="">{statusLabel(t.status)} (current)</option>
                {nextStatuses(t.status).map((s) => (
                  <option key={s} value={s}>
                    {statusLabel(s)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="priority">Priority</label>
              <select
                id="priority"
                value={newPriority}
                onChange={(e) => setNewPriority(e.target.value as Priority | '')}
              >
                <option value="">{t.priority} (current)</option>
                {PRIORITIES.filter((p) => p !== t.priority).map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            {isAdmin && (
              <div className="field">
                <label htmlFor="assignee">Assignee</label>
                <select
                  id="assignee"
                  value={newAssignee}
                  onChange={(e) => setNewAssignee(e.target.value)}
                >
                  <option value="">{assigneeName(t.assigned_to_id)} (current)</option>
                  {t.assigned_to_id && <option value={UNASSIGNED}>Unassigned</option>}
                  {staff.data
                    ?.filter((m) => m.id !== t.assigned_to_id)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                </select>
              </div>
            )}
            <button
              onClick={() => update.mutate()}
              disabled={update.isPending || (!newStatus && !newPriority && !newAssignee)}
            >
              Update ticket
            </button>
            {update.error && <p className="error">{(update.error as Error).message}</p>}
          </>
        )}
        {canReopen && (
          <button onClick={() => reopen.mutate()} disabled={reopen.isPending}>
            Reopen ticket
          </button>
        )}
        {reopen.error && <p className="error">{(reopen.error as Error).message}</p>}
      </section>

      <section className="card">
        <h3>Attachments</h3>
        {t.attachments.length === 0 && <p className="muted">No attachments.</p>}
        <ul>
          {t.attachments.map((a) => (
            <li key={a.id}>{a.file_name}</li>
          ))}
        </ul>
        <input
          ref={fileInput}
          type="file"
          aria-label="Upload attachment"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) upload.mutate(file)
            if (fileInput.current) fileInput.current.value = ''
          }}
        />
        {upload.error && <p className="error">{(upload.error as Error).message}</p>}
      </section>

      {canManage && (
        <section className="card">
          <h3>History</h3>
          {history.isLoading && <p className="muted">Loading…</p>}
          {history.error && <p className="error">{(history.error as Error).message}</p>}
          {history.data?.length === 0 && <p className="muted">No history.</p>}
          <ul>
            {history.data?.map((h) => (
              <li key={h.id}>
                {h.changed_by_id} · {h.field_name}: {h.old_value ?? '—'} → {h.new_value ?? '—'} ·{' '}
                {new Date(h.created_at + 'Z').toLocaleString()}
              </li>
            ))}
          </ul>
        </section>
      )}

      <CommentThread ticketId={id} />
    </>
  )
}
