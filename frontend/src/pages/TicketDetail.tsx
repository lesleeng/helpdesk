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
  const [approvalComment, setApprovalComment] = useState('')
  const [rating, setRating] = useState('5')
  const [feedbackComment, setFeedbackComment] = useState('')
  const [articleToLink, setArticleToLink] = useState('')

  const ticket = useQuery({ queryKey: ['ticket', id], queryFn: () => api.getTicket(id) })
  const canManage = isAdmin || (user?.role === 'tech' && ticket.data?.assigned_to_id === user.id)
  const staff = useQuery({ queryKey: ['staff'], queryFn: api.staff, enabled: isAdmin })
  const history = useQuery({
    queryKey: ['history', id],
    queryFn: () => api.history(id),
    enabled: canManage,
  })
  const linked = useQuery({ queryKey: ['ticket-kb', id], queryFn: () => api.ticketKb(id) })
  const published = useQuery({
    queryKey: ['kb', 'published'],
    queryFn: () => api.kbList({ pageSize: 100 }),
    enabled: canManage,
  })
  const duplicates = useQuery({
    queryKey: ['duplicates', id],
    queryFn: () => api.duplicates(id),
    enabled: canManage,
  })
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['ticket', id] })
    qc.invalidateQueries({ queryKey: ['tickets'] })
    qc.invalidateQueries({ queryKey: ['history', id] })
    qc.invalidateQueries({ queryKey: ['approvals'] })
  }
  const decide = useMutation({
    mutationFn: (decision: 'approve' | 'reject') =>
      api.decideApproval(id, decision, approvalComment.trim()),
    onSuccess: () => {
      setApprovalComment('')
      refresh()
    },
  })
  const sendFeedback = useMutation({
    mutationFn: () => api.sendFeedback(id, Number(rating), feedbackComment.trim()),
    onSuccess: refresh,
  })
  const link = useMutation({
    mutationFn: () => api.linkKb(id, Number(articleToLink)),
    onSuccess: () => {
      setArticleToLink('')
      qc.invalidateQueries({ queryKey: ['ticket-kb', id] })
      qc.invalidateQueries({ queryKey: ['history', id] })
    },
  })
  const unlink = useMutation({
    mutationFn: (articleId: number) => api.unlinkKb(id, articleId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ticket-kb', id] }),
  })
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
  const canDecide =
    t.approval_status === 'pending' &&
    t.user_id !== user?.id &&
    (isAdmin || t.approver_id === user?.id)
  const canRate = t.user_id === user?.id && ['resolved', 'closed'].includes(t.status) && !t.feedback
  const linkable = published.data?.items.filter((a) => !linked.data?.some((l) => l.id === a.id))
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
        {t.approval_status && (
          <p className="muted">
            Approval: {t.approval_status}
            {t.approval_comment && ` · ${t.approval_comment}`}
          </p>
        )}
        {canDecide && (
          <>
            <div className="field">
              <label htmlFor="approval-comment">Approval comment</label>
              <textarea
                id="approval-comment"
                value={approvalComment}
                onChange={(e) => setApprovalComment(e.target.value)}
              />
            </div>
            <button onClick={() => decide.mutate('approve')} disabled={decide.isPending}>
              Approve
            </button>{' '}
            <button onClick={() => decide.mutate('reject')} disabled={decide.isPending}>
              Reject
            </button>
            {decide.error && <p className="error">{(decide.error as Error).message}</p>}
          </>
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
                {nextStatuses(t.status)
                  .filter((s) => t.approval_status !== 'pending' || s === 'cancelled')
                  .map((s) => (
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

      {t.feedback && (
        <section className="card">
          <h3>Feedback</h3>
          <p>
            Rating: {t.feedback.rating}/5{t.feedback.comment && ` · ${t.feedback.comment}`}
          </p>
        </section>
      )}
      {canRate && (
        <form
          className="card form"
          onSubmit={(e) => {
            e.preventDefault()
            sendFeedback.mutate()
          }}
        >
          <h3>How did we do?</h3>
          <div className="field">
            <label htmlFor="rating">Rating</label>
            <select id="rating" value={rating} onChange={(e) => setRating(e.target.value)}>
              <option value="5">5 - Very satisfied</option>
              <option value="4">4 - Satisfied</option>
              <option value="3">3 - Neutral</option>
              <option value="2">2 - Unsatisfied</option>
              <option value="1">1 - Very unsatisfied</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="feedback-comment">Comment</label>
            <textarea
              id="feedback-comment"
              value={feedbackComment}
              onChange={(e) => setFeedbackComment(e.target.value)}
            />
          </div>
          {sendFeedback.error && <p className="error">{(sendFeedback.error as Error).message}</p>}
          <button type="submit" disabled={sendFeedback.isPending}>
            Send feedback
          </button>
        </form>
      )}

      {(canManage || (linked.data?.length ?? 0) > 0) && (
        <section className="card">
          <h3>Knowledge base</h3>
          {linked.data?.length === 0 && <p className="muted">No linked articles.</p>}
          <ul>
            {linked.data?.map((a) => (
              <li key={a.id}>
                <Link to={`/kb/${a.id}`}>{a.title}</Link>
                {canManage && (
                  <>
                    {' '}
                    <button
                      aria-label={`Remove ${a.title}`}
                      onClick={() => unlink.mutate(a.id)}
                      disabled={unlink.isPending}
                    >
                      Remove
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
          {canManage && (
            <div className="filters">
              <select
                aria-label="Link an article"
                value={articleToLink}
                onChange={(e) => setArticleToLink(e.target.value)}
              >
                <option value="">Link an article…</option>
                {linkable
                  ?.filter((a) => a.published)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.title}
                    </option>
                  ))}
              </select>
              <button onClick={() => link.mutate()} disabled={!articleToLink || link.isPending}>
                Link
              </button>
            </div>
          )}
          {link.error && <p className="error">{(link.error as Error).message}</p>}
        </section>
      )}

      {canManage && (duplicates.data?.length ?? 0) > 0 && (
        <section className="card">
          <h3>Possible duplicates</h3>
          <ul>
            {duplicates.data?.map((d) => (
              <li key={d.id}>
                <Link to={`/tickets/${d.id}`}>
                  #{d.id} {d.title}
                </Link>{' '}
                · {d.status.replace(/_/g, ' ')} · {Math.round(d.score * 100)}% similar
              </li>
            ))}
          </ul>
        </section>
      )}

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

      <CommentThread ticketId={id} canSuggest={canManage} />
    </>
  )
}
