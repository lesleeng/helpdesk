import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../services/api'
import { useAuth } from '../hooks/useAuth'

export default function KnowledgeBase() {
  const { user } = useAuth()
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [page, setPage] = useState(1)
  const isStaff = user?.role === 'admin' || user?.role === 'tech'

  const categories = useQuery({ queryKey: ['categories'], queryFn: api.categories })
  const articles = useQuery({
    queryKey: ['kb', { search, categoryId, page }],
    queryFn: () =>
      api.kbList({
        q: search || undefined,
        categoryId: categoryId ? Number(categoryId) : undefined,
        page,
      }),
  })

  const totalPages = articles.data
    ? Math.max(1, Math.ceil(articles.data.total / articles.data.page_size))
    : 1

  return (
    <section className="card">
      <h2>Knowledge Base</h2>
      <div className="filters">
        <input
          aria-label="Search articles"
          placeholder="Search…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(1)
          }}
        />
        <select
          aria-label="Filter by category"
          value={categoryId}
          onChange={(e) => {
            setCategoryId(e.target.value)
            setPage(1)
          }}
        >
          <option value="">All categories</option>
          {categories.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {user?.role === 'admin' && <Link to="/kb/new">New article</Link>}
      </div>
      {articles.isLoading && <p className="muted">Loading…</p>}
      {articles.error && <p className="error">{(articles.error as Error).message}</p>}
      {articles.data?.items.length === 0 && <p className="muted">No articles found.</p>}
      {articles.data && articles.data.items.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Tags</th>
              {isStaff && <th>Status</th>}
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {articles.data.items.map((a) => (
              <tr key={a.id}>
                <td>
                  <Link to={`/kb/${a.id}`}>{a.title}</Link>
                </td>
                <td>{a.tags ?? '—'}</td>
                {isStaff && <td>{a.published ? 'Published' : 'Draft'}</td>}
                <td>{new Date(a.updated_at + 'Z').toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="pager">
        <button disabled={page <= 1} onClick={() => setPage(page - 1)}>
          Previous
        </button>
        <span>
          Page {page} of {totalPages}
        </span>
        <button disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
          Next
        </button>
      </div>
    </section>
  )
}
