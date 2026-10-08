import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useDebounced } from '../../hooks/useDebounced'
import { api } from '../../services/api'
import type { TicketDraft, Urgency } from '../../types'
import DynamicFields from './DynamicFields'

export default function TicketForm({ onCreated }: { onCreated: (id: number) => void }) {
  const qc = useQueryClient()
  const draft = (useLocation().state as { draft?: TicketDraft } | null)?.draft
  const [categoryId, setCategoryId] = useState<number | ''>(draft?.category_id ?? '')
  const [subcategoryId, setSubcategoryId] = useState<number | ''>(draft?.subcategory_id ?? '')
  const [title, setTitle] = useState(draft?.title ?? '')
  const [description, setDescription] = useState(draft?.description ?? '')
  const [urgency, setUrgency] = useState<Urgency>(draft?.urgency ?? 'medium')
  const [extra, setExtra] = useState<Record<string, string>>({})
  const [files, setFiles] = useState<File[]>([])
  const [warning, setWarning] = useState<string | null>(null)

  const categories = useQuery({ queryKey: ['categories'], queryFn: api.categories })
  const subcategories = useQuery({
    queryKey: ['subcategories', categoryId],
    queryFn: () => api.subcategories(categoryId as number),
    enabled: categoryId !== '',
  })

  const aiStatus = useQuery({ queryKey: ['ai-status'], queryFn: api.aiStatus })
  const typed = useDebounced(`${title} ${description}`.trim())
  const related = useQuery({
    queryKey: ['kb-suggest', typed, categoryId],
    queryFn: () => api.kbSuggest(typed, categoryId === '' ? undefined : categoryId),
    enabled: typed.length >= 3,
  })
  const suggest = useMutation({
    mutationFn: () => api.aiCategorize(title.trim(), description.trim()),
    onSuccess: (r) => {
      setCategoryId(r.category_id)
      setSubcategoryId(r.subcategory_id ?? '')
      setUrgency(r.urgency)
      setExtra({})
    },
  })
  const selectedSub = subcategories.data?.find((s) => s.id === subcategoryId)
  const fields = selectedSub?.extra_fields_template?.fields ?? []
  const needsApproval = selectedSub?.requires_approval === true

  const create = useMutation({
    mutationFn: async () => {
      const filled = Object.fromEntries(Object.entries(extra).filter(([, v]) => v.trim() !== ''))
      const ticket = await api.createTicket({
        title: title.trim(),
        description: description.trim(),
        category_id: categoryId as number,
        subcategory_id: subcategoryId === '' ? undefined : subcategoryId,
        urgency,
        extra_fields: filled,
      })
      const failed: string[] = []
      for (const file of files) {
        try {
          await api.uploadAttachment(ticket.id, file)
        } catch {
          failed.push(file.name)
        }
      }
      return { ticket, failed }
    },
    onSuccess: ({ ticket, failed }) => {
      qc.invalidateQueries({ queryKey: ['tickets'] })
      if (failed.length) {
        setWarning(`Ticket created, but these files failed to upload: ${failed.join(', ')}`)
      }
      onCreated(ticket.id)
    },
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (categoryId === '' || !title.trim() || !description.trim()) return
    create.mutate()
  }

  return (
    <form className="card form" onSubmit={submit}>
      <h2>Submit a ticket</h2>
      <div className="field">
        <label htmlFor="category">Category</label>
        <select
          id="category"
          value={categoryId}
          required
          onChange={(e) => {
            setCategoryId(e.target.value === '' ? '' : Number(e.target.value))
            setSubcategoryId('')
            setExtra({})
          }}
        >
          <option value="">Select a category</option>
          {categories.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      {categoryId !== '' && (
        <div className="field">
          <label htmlFor="subcategory">Request type</label>
          <select
            id="subcategory"
            value={subcategoryId}
            onChange={(e) => {
              setSubcategoryId(e.target.value === '' ? '' : Number(e.target.value))
              setExtra({})
            }}
          >
            <option value="">Select a type</option>
            {subcategories.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      )}
      {needsApproval && (
        <p className="muted">This request needs your manager&apos;s approval before work starts.</p>
      )}
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
        <label htmlFor="description">Description</label>
        <textarea
          id="description"
          value={description}
          required
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      {aiStatus.data?.enabled && (
        <div className="field">
          <div>
            <button
              type="button"
              onClick={() => suggest.mutate()}
              disabled={suggest.isPending || !title.trim() || !description.trim()}
            >
              {suggest.isPending ? 'Thinking…' : 'Suggest category'}
            </button>
          </div>
          {suggest.data && <p className="muted">Suggested: {suggest.data.reasoning}</p>}
          {suggest.error && <p className="error">{(suggest.error as Error).message}</p>}
        </div>
      )}
      {related.data && related.data.length > 0 && (
        <div className="field">
          <span>Related articles</span>
          <ul>
            {related.data.map((a) => (
              <li key={a.id}>
                <Link to={`/kb/${a.id}`} target="_blank" rel="noreferrer">
                  {a.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="field">
        <label htmlFor="urgency">Urgency</label>
        <select
          id="urgency"
          value={urgency}
          onChange={(e) => setUrgency(e.target.value as Urgency)}
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
      </div>
      <DynamicFields
        fields={fields}
        values={extra}
        onChange={(name, value) => setExtra((prev) => ({ ...prev, [name]: value }))}
      />
      <div className="field">
        <label htmlFor="files">Attachments</label>
        <input
          id="files"
          type="file"
          multiple
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
        />
      </div>
      {create.error && <p className="error">{(create.error as Error).message}</p>}
      {warning && <p className="warning">{warning}</p>}
      <button type="submit" disabled={create.isPending}>
        {create.isPending ? 'Submitting…' : 'Submit ticket'}
      </button>
    </form>
  )
}
