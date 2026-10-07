import { useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../services/api'
import { useAuth } from '../../hooks/useAuth'

export default function CommentThread({ ticketId }: { ticketId: number }) {
  const { user } = useAuth()
  const qc = useQueryClient()
  const [content, setContent] = useState('')
  const comments = useQuery({
    queryKey: ['comments', ticketId],
    queryFn: () => api.listComments(ticketId),
  })
  const add = useMutation({
    mutationFn: () => api.addComment(ticketId, content.trim()),
    onSuccess: () => {
      setContent('')
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
        {add.error && <p className="error">{(add.error as Error).message}</p>}
        <button type="submit" disabled={add.isPending || !content.trim()}>
          Post comment
        </button>
      </form>
    </section>
  )
}
