import { useRef } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../services/api'
import { useAuth } from '../hooks/useAuth'
import StatusBadge from '../components/StatusBadge/StatusBadge'
import CommentThread from '../components/CommentThread/CommentThread'

export default function TicketDetail() {
  const id = Number(useParams().id)
  const { user } = useAuth()
  const qc = useQueryClient()
  const fileInput = useRef<HTMLInputElement>(null)

  const ticket = useQuery({ queryKey: ['ticket', id], queryFn: () => api.getTicket(id) })
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['ticket', id] })
    qc.invalidateQueries({ queryKey: ['tickets'] })
  }
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

      <CommentThread ticketId={id} />
    </>
  )
}
