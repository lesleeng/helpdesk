import { useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../services/api'
import type { Urgency } from '../../types'
import DynamicFields from './DynamicFields'

export default function TicketForm({ onCreated }: { onCreated: (id: number) => void }) {
  const qc = useQueryClient()
  const [categoryId, setCategoryId] = useState<number | ''>('')
  const [subcategoryId, setSubcategoryId] = useState<number | ''>('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [urgency, setUrgency] = useState<Urgency>('medium')
  const [extra, setExtra] = useState<Record<string, string>>({})
  const [files, setFiles] = useState<File[]>([])
  const [warning, setWarning] = useState<string | null>(null)

  const categories = useQuery({ queryKey: ['categories'], queryFn: api.categories })
  const subcategories = useQuery({
    queryKey: ['subcategories', categoryId],
    queryFn: () => api.subcategories(categoryId as number),
    enabled: categoryId !== '',
  })

  const selectedSub = subcategories.data?.find((s) => s.id === subcategoryId)
  const fields = selectedSub?.extra_fields_template?.fields ?? []

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
