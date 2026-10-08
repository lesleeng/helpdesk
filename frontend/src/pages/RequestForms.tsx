import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../services/api'
import type { ExtraFieldDef, Subcategory } from '../types'

type Row = ExtraFieldDef & { saved: boolean; optionsText: string }
const TYPES: ExtraFieldDef['type'][] = ['text', 'textarea', 'number', 'date', 'select']

const slug = (label: string) =>
  label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^[^a-z]+/, 'f_')
    .slice(0, 40)

export default function RequestForms() {
  const qc = useQueryClient()
  const categories = useQuery({ queryKey: ['categories'], queryFn: api.categories })
  const [chosen, setChosen] = useState('')
  const categoryId = chosen || String(categories.data?.[0]?.id ?? '')
  const subs = useQuery({
    queryKey: ['all-subcategories', categoryId],
    queryFn: () => api.allSubcategories(Number(categoryId)),
    enabled: categoryId !== '',
  })
  const [editing, setEditing] = useState<Subcategory | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [problem, setProblem] = useState('')
  const [newName, setNewName] = useState('')
  const [newApproval, setNewApproval] = useState(false)

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['all-subcategories', categoryId] })
    qc.invalidateQueries({ queryKey: ['subcategories'] })
  }
  const update = useMutation({
    mutationFn: (v: { id: number; data: { requires_approval?: boolean; active?: boolean } }) =>
      api.updateSubcategory(v.id, v.data),
    onSuccess: refresh,
  })
  const create = useMutation({
    mutationFn: () =>
      api.createSubcategory(Number(categoryId), {
        name: newName.trim(),
        requires_approval: newApproval,
      }),
    onSuccess: () => {
      setNewName('')
      setNewApproval(false)
      refresh()
    },
  })
  const save = useMutation({
    mutationFn: (fields: ExtraFieldDef[]) => api.setFields(editing!.id, fields),
    onSuccess: () => {
      setEditing(null)
      refresh()
    },
  })

  const edit = (sub: Subcategory) => {
    setProblem('')
    setEditing(sub)
    setRows(
      (sub.extra_fields_template?.fields ?? []).map((f) => ({
        ...f,
        saved: true,
        optionsText: (f.options ?? []).join(', '),
      })),
    )
  }
  const patch = (i: number, change: Partial<Row>) =>
    setRows(rows.map((r, j) => (j === i ? { ...r, ...change } : r)))
  const move = (i: number, by: number) => {
    const next = [...rows]
    ;[next[i], next[i + by]] = [next[i + by], next[i]]
    setRows(next)
  }

  const submitFields = () => {
    const used = new Set(rows.filter((r) => r.saved).map((r) => r.name))
    const fields: ExtraFieldDef[] = []
    for (const [i, r] of rows.entries()) {
      if (!r.label.trim()) return setProblem(`Field ${i + 1} needs a label`)
      const options = r.optionsText
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean)
      if (r.type === 'select' && options.length === 0) {
        return setProblem(`"${r.label}" needs at least one option`)
      }
      let name = r.name
      if (!r.saved) {
        const base = slug(r.label) || 'field'
        name = base
        for (let n = 2; used.has(name); n++) name = `${base}_${n}`
        used.add(name)
      }
      fields.push({
        name,
        label: r.label.trim(),
        type: r.type,
        required: r.required ?? false,
        ...(r.type === 'select' ? { options } : {}),
      })
    }
    setProblem('')
    save.mutate(fields)
  }

  const error = [update, create, save].find((m) => m.error)?.error as Error | undefined

  return (
    <>
      <section className="card">
        <h2>Request forms</h2>
        <p className="muted">
          Choose which request types people can pick, whether they need manager approval, and which
          questions each one asks. Changes apply to new tickets.
        </p>
        <div className="filters">
          <select
            aria-label="Category"
            value={categoryId}
            onChange={(e) => {
              setChosen(e.target.value)
              setEditing(null)
            }}
          >
            {categories.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        {error && <p className="error">{error.message}</p>}
        {subs.isLoading && <p className="muted">Loading…</p>}
        {subs.data && (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Request type</th>
                  <th>Needs manager approval</th>
                  <th>Available</th>
                  <th>Fields</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {subs.data.map((s) => (
                  <tr key={s.id}>
                    <td>{s.name}</td>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Needs approval: ${s.name}`}
                        checked={s.requires_approval ?? false}
                        onChange={(e) =>
                          update.mutate({ id: s.id, data: { requires_approval: e.target.checked } })
                        }
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Available: ${s.name}`}
                        checked={s.active ?? true}
                        onChange={(e) =>
                          update.mutate({ id: s.id, data: { active: e.target.checked } })
                        }
                      />
                    </td>
                    <td>{s.extra_fields_template?.fields?.length ?? 0}</td>
                    <td>
                      <button aria-label={`Edit fields for ${s.name}`} onClick={() => edit(s)}>
                        Edit fields
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="filters">
          <input
            aria-label="New request type"
            placeholder="New request type"
            value={newName}
            maxLength={100}
            onChange={(e) => setNewName(e.target.value)}
          />
          <label>
            <input
              type="checkbox"
              checked={newApproval}
              onChange={(e) => setNewApproval(e.target.checked)}
            />{' '}
            Needs manager approval
          </label>
          <button onClick={() => create.mutate()} disabled={!newName.trim() || create.isPending}>
            Add request type
          </button>
        </div>
      </section>

      {editing && (
        <section className="card">
          <h3>Fields for {editing.name}</h3>
          {rows.length === 0 && (
            <p className="muted">No fields yet. People only fill in the title and description.</p>
          )}
          {rows.length > 0 && (
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th>Label</th>
                    <th>Type</th>
                    <th>Options (comma separated)</th>
                    <th>Required</th>
                    <th>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i}>
                      <td>
                        <input
                          aria-label={`Label ${i + 1}`}
                          value={r.label}
                          maxLength={100}
                          onChange={(e) => patch(i, { label: e.target.value })}
                        />
                      </td>
                      <td>
                        <select
                          aria-label={`Type ${i + 1}`}
                          value={r.type}
                          onChange={(e) =>
                            patch(i, { type: e.target.value as ExtraFieldDef['type'] })
                          }
                        >
                          {TYPES.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          aria-label={`Options ${i + 1}`}
                          value={r.optionsText}
                          disabled={r.type !== 'select'}
                          onChange={(e) => patch(i, { optionsText: e.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Required ${i + 1}`}
                          checked={r.required ?? false}
                          onChange={(e) => patch(i, { required: e.target.checked })}
                        />
                      </td>
                      <td>
                        <button
                          aria-label={`Move field ${i + 1} up`}
                          disabled={i === 0}
                          onClick={() => move(i, -1)}
                        >
                          Up
                        </button>{' '}
                        <button
                          aria-label={`Move field ${i + 1} down`}
                          disabled={i === rows.length - 1}
                          onClick={() => move(i, 1)}
                        >
                          Down
                        </button>{' '}
                        <button
                          aria-label={`Remove field ${i + 1}`}
                          onClick={() => setRows(rows.filter((_, j) => j !== i))}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {problem && <p className="error">{problem}</p>}
          <button
            onClick={() =>
              setRows([
                ...rows,
                {
                  name: '',
                  label: '',
                  type: 'text',
                  required: false,
                  saved: false,
                  optionsText: '',
                },
              ])
            }
            disabled={rows.length >= 20}
          >
            Add field
          </button>{' '}
          <button onClick={submitFields} disabled={save.isPending}>
            Save form
          </button>{' '}
          <button onClick={() => setEditing(null)}>Cancel</button>
        </section>
      )}
    </>
  )
}
