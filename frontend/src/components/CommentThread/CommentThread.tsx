import { useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../services/api'
import { useAuth } from '../../hooks/useAuth'

export default function CommentThread({
  ticketId,
  canSuggest = false,
}: {
  ticketId: number
  canSuggest?: boolean
}) {
  const { user } = useAuth()
  const qc = useQueryClient()
  const [content, setContent] = useState('')
  const comments = useQuery({
    queryKey: ['comments', ticketId],
    queryFn: () => api.listComments(ticketId),
  })
  const aiStatus = useQuery({ queryKey: ['ai-status'], queryFn: api.aiStatus, enabled: canSuggest })
  const [draftNote, setDraftNote] = useState('')
  const suggest = useMutation({
    mutationFn: () => api.aiReply(ticketId),
    onSuccess: (reply) => {
      setContent(reply.draft)
      setDraftNote(
        `Draft written by AI from ${reply.articles.length} article${reply.articles.length === 1 ? '' : 's'}. Review it before posting.`,
      )
    },
  })
  const add = useMutation({
    mutationFn: () => api.addComment(ticketId, content.trim()),
    onSuccess: () => {
      setContent('')
      setDraftNote('')
      qc.invalidateQueries({ queryKey: ['comments', ticketId] })
    },
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (content.trim()) add.mutate()
  }

  return (
    <section className="card">
      <h3>Comments</h3>
      {comments.isLoading && <p className="muted">Loading…</p>}
      {comments.data?.length === 0 && <p className="muted">No comments yet.</p>}
      <ul className="comments">
        {comments.data?.map((c) => (
          <li key={c.id} className={c.user_id === user?.id ? 'mine' : ''}>
            <div className="meta">
              {c.user_id === user?.id ? 'You' : c.user_id} ·{' '}
              {new Date(c.created_at + 'Z').toLocaleString()}
              {c.is_internal && ' · internal'}
            </div>
            <div className="body">{c.content}</div>
          </li>
        ))}
      </ul>
      <form onSubmit={submit}>
        <label htmlFor="new-comment" className="sr-only">
          Add a comment
        </label>
        <textarea
          id="new-comment"
          placeholder="Add a comment"
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
        {draftNote && <p className="muted">{draftNote}</p>}
        {suggest.error && <p className="error">{(suggest.error as Error).message}</p>}
        {add.error && <p className="error">{(add.error as Error).message}</p>}
        <button type="submit" disabled={add.isPending || !content.trim()}>
          Post comment
        </button>
        {canSuggest && aiStatus.data?.enabled && (
          <>
            {' '}
            <button type="button" onClick={() => suggest.mutate()} disabled={suggest.isPending}>
              {suggest.isPending ? 'Writing…' : 'Suggest reply'}
            </button>
          </>
        )}
      </form>
    </section>
  )
}
