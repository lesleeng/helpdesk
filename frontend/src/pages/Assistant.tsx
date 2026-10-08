import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from '../services/api'
import type { ChatMessage, ChatReply } from '../types'

type Turn = ChatMessage & { reply?: ChatReply }
const MAX_TURNS = 20

function forApi(turns: Turn[]): ChatMessage[] {
  const recent = turns.slice(-MAX_TURNS).map(({ role, content }) => ({ role, content }))
  while (recent.length > 0 && recent[0].role === 'assistant') recent.shift()
  return recent
}

export default function Assistant() {
  const navigate = useNavigate()
  const status = useQuery({ queryKey: ['ai-status'], queryFn: api.aiStatus })
  const [turns, setTurns] = useState<Turn[]>([])
  const [text, setText] = useState('')
  const send = useMutation({
    mutationFn: (history: ChatMessage[]) => api.chat(history),
    onSuccess: (reply) =>
      setTurns((current) => [...current, { role: 'assistant', content: reply.answer, reply }]),
  })

  if (status.isLoading) return <p className="muted">Loading…</p>
  if (!status.data?.enabled) {
    return (
      <section className="card">
        <h2>Assistant</h2>
        <p className="muted">The assistant is not available. You can still submit a ticket.</p>
        <Link to="/tickets/new">New Ticket</Link>
      </section>
    )
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const message = text.trim()
    if (!message || send.isPending) return
    const next: Turn[] = [...turns, { role: 'user', content: message }]
    setTurns(next)
    setText('')
    send.mutate(forApi(next))
  }

  return (
    <section className="card">
      <h2>Assistant</h2>
      <p className="muted">
        Ask an IT question. Answers come from the knowledge base, and I can draft a ticket if they
        do not help. Do not share passwords.
      </p>
      {turns.length === 0 && <p className="muted">For example: “How do I reset my password?”</p>}
      <ul className="comments" aria-live="polite">
        {turns.map((t, i) => (
          <li key={i} className={t.role === 'user' ? 'mine' : ''}>
            <div className="meta">{t.role === 'user' ? 'You' : 'Assistant'}</div>
            <div className="body pre">{t.content}</div>
            {t.reply && t.reply.articles.length > 0 && (
              <ul>
                {t.reply.articles.map((a) => (
                  <li key={a.id}>
                    <Link to={`/kb/${a.id}`}>{a.title}</Link>
                  </li>
                ))}
              </ul>
            )}
            {t.reply?.ticket_draft && (
              <div className="field">
                <p className="muted">Suggested ticket: {t.reply.ticket_draft.title}</p>
                <div>
                  <button
                    onClick={() =>
                      navigate('/tickets/new', { state: { draft: t.reply!.ticket_draft } })
                    }
                  >
                    Create this ticket
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
      {send.isPending && <p className="muted">Thinking…</p>}
      {send.error && <p className="error">{(send.error as Error).message}</p>}
      <form onSubmit={submit}>
        <label htmlFor="question" className="sr-only">
          Your question
        </label>
        <textarea
          id="question"
          placeholder="Ask a question"
          value={text}
          maxLength={2000}
          onChange={(e) => setText(e.target.value)}
        />
        <button type="submit" disabled={send.isPending || !text.trim()}>
          Send
        </button>
        {turns.length > 0 && (
          <>
            {' '}
            <button
              type="button"
              onClick={() => {
                setTurns([])
                send.reset()
              }}
            >
              New conversation
            </button>
          </>
        )}
      </form>
    </section>
  )
}
