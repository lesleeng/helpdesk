import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../services/api'
import { useAuth } from '../hooks/useAuth'

export default function KnowledgeArticle() {
  const id = Number(useParams().id)
  const { user } = useAuth()
  const article = useQuery({ queryKey: ['kb', id], queryFn: () => api.kbGet(id) })

  if (article.isLoading) return <p className="muted">Loading…</p>
  if (article.error || !article.data) {
    return (
      <p className="error">
        {(article.error as Error | null)?.message ?? 'Article not found'}{' '}
        <Link to="/kb">Back to knowledge base</Link>
      </p>
    )
  }

  const a = article.data
  return (
    <section className="card">
      <Link to="/kb">← Back</Link>
      <h2>
        {a.title} {!a.published && <span className="badge">Draft</span>}
      </h2>
      <p className="muted">
        Updated {new Date(a.updated_at + 'Z').toLocaleDateString()}
        {a.tags && ` · Tags: ${a.tags}`}
      </p>
      <p className="pre">{a.body}</p>
      {user?.role === 'admin' && <Link to={`/kb/${a.id}/edit`}>Edit article</Link>}
    </section>
  )
}
