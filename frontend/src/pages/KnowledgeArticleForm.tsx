import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../services/api'
import type { KbArticle } from '../types'

export default function KnowledgeArticleForm() {
  const params = useParams()
  const id = params.id ? Number(params.id) : undefined
  const article = useQuery({
    queryKey: ['kb', id],
    queryFn: () => api.kbGet(id as number),
    enabled: id !== undefined,
  })

  if (id !== undefined && article.isLoading) return <p className="muted">Loading…</p>
  if (id !== undefined && (article.error || !article.data)) {
    return (
      <p className="error">{(article.error as Error | null)?.message ?? 'Article not found'}</p>
    )
  }
  return <ArticleFields key={id ?? 'new'} id={id} initial={article.data} />
}

function ArticleFields({ id, initial }: { id?: number; initial?: KbArticle }) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [title, setTitle] = useState(initial?.title ?? '')
  const [body, setBody] = useState(initial?.body ?? '')
  const [tags, setTags] = useState(initial?.tags ?? '')
  const [categoryId, setCategoryId] = useState(initial?.category_id?.toString() ?? '')
  const [published, setPublished] = useState(initial?.published ?? false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const categories = useQuery({ queryKey: ['categories'], queryFn: api.categories })

  const save = useMutation({
    mutationFn: () => {
      const data = {
        title: title.trim(),
        body: body.trim(),
        tags: tags.trim() || null,
        category_id: categoryId ? Number(categoryId) : null,
        published,
      }
      return id === undefined ? api.kbCreate(data) : api.kbUpdate(id, data)
    },
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: ['kb'] })
      navigate(`/kb/${saved.id}`)
    },
  })
  const remove = useMutation({
    mutationFn: () => api.kbDelete(id as number),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kb'] })
      navigate('/kb')
    },
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (title.trim() && body.trim()) save.mutate()
  }

  return (
    <form className="card form" onSubmit={submit}>
      <h2>{id === undefined ? 'New article' : 'Edit article'}</h2>
      <div className="field">
        <label htmlFor="title">Title</label>
        <input
          id="title"
          value={title}
          maxLength={200}
          required
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="body">Body</label>
        <textarea id="body" value={body} required onChange={(e) => setBody(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="tags">Tags</label>
        <input
          id="tags"
          value={tags}
          maxLength={300}
          placeholder="comma, separated"
          onChange={(e) => setTags(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="category">Category</label>
        <select id="category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">All categories</option>
          {categories.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>
          <input
            type="checkbox"
            checked={published}
            onChange={(e) => setPublished(e.target.checked)}
          />{' '}
          Published
        </label>
      </div>
      {save.error && <p className="error">{(save.error as Error).message}</p>}
      {remove.error && <p className="error">{(remove.error as Error).message}</p>}
      <button type="submit" disabled={save.isPending}>
        {save.isPending ? 'Saving…' : 'Save article'}
      </button>
      {id !== undefined && !confirmingDelete && (
        <>
          {' '}
          <button type="button" onClick={() => setConfirmingDelete(true)}>
            Delete article
          </button>
        </>
      )}
      {id !== undefined && confirmingDelete && (
        <>
          <p className="warning">Delete this article for everyone? This cannot be undone.</p>
          <button type="button" disabled={remove.isPending} onClick={() => remove.mutate()}>
            Yes, delete
          </button>{' '}
          <button type="button" onClick={() => setConfirmingDelete(false)}>
            Cancel
          </button>
        </>
      )}
    </form>
  )
}
