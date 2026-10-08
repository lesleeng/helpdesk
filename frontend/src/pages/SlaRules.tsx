import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../services/api'

export default function SlaRules() {
  const qc = useQueryClient()
  const rules = useQuery({ queryKey: ['sla-rules'], queryFn: api.slaRules })
  const [drafts, setDrafts] = useState<Record<number, { response: string; resolution: string }>>({})

  const refresh = () => qc.invalidateQueries({ queryKey: ['sla-rules'] })
  const dropDraft = (id: number) =>
    setDrafts((current) =>
      Object.fromEntries(Object.entries(current).filter(([k]) => Number(k) !== id)),
    )
  const save = useMutation({
    mutationFn: (v: { id: number; response: number; resolution: number }) =>
      api.setSlaRule(v.id, v.response, v.resolution),
    onSuccess: (_, v) => {
      dropDraft(v.id)
      refresh()
    },
  })
  const reset = useMutation({
    mutationFn: (id: number) => api.resetSlaRule(id),
    onSuccess: (_, id) => {
      dropDraft(id)
      refresh()
    },
  })

  if (rules.isLoading) return <p className="muted">Loading…</p>
  if (rules.error || !rules.data) {
    return <p className="error">{(rules.error as Error | null)?.message ?? 'No data'}</p>
  }

  return (
    <section className="card">
      <h2>SLA rules</h2>
      <p className="muted">
        Response and resolution targets per category, applied to tickets created from now on.
      </p>
      <table className="table">
        <thead>
          <tr>
            <th>Category</th>
            <th>Response (hours)</th>
            <th>Resolution (hours)</th>
            <th>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rules.data.map((r) => {
            const draft = drafts[r.category_id] ?? {
              response: String(r.response_hours),
              resolution: String(r.resolution_hours),
            }
            const set = (patch: Partial<typeof draft>) =>
              setDrafts({ ...drafts, [r.category_id]: { ...draft, ...patch } })
            const changed =
              draft.response !== String(r.response_hours) ||
              draft.resolution !== String(r.resolution_hours)
            const valid =
              Number.isInteger(Number(draft.response)) &&
              Number.isInteger(Number(draft.resolution)) &&
              Number(draft.response) >= 1 &&
              Number(draft.resolution) >= Number(draft.response)
            return (
              <tr key={r.category_id}>
                <td>
                  {r.category_name} {r.custom && <span className="badge">Custom</span>}
                </td>
                <td>
                  <input
                    type="number"
                    min={1}
                    aria-label={`Response hours for ${r.category_name}`}
                    value={draft.response}
                    onChange={(e) => set({ response: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min={1}
                    aria-label={`Resolution hours for ${r.category_name}`}
                    value={draft.resolution}
                    onChange={(e) => set({ resolution: e.target.value })}
                  />
                </td>
                <td>
                  <button
                    aria-label={`Save ${r.category_name}`}
                    disabled={!changed || !valid || save.isPending}
                    onClick={() =>
                      save.mutate({
                        id: r.category_id,
                        response: Number(draft.response),
                        resolution: Number(draft.resolution),
                      })
                    }
                  >
                    Save
                  </button>{' '}
                  <button
                    aria-label={`Reset ${r.category_name}`}
                    disabled={!r.custom || reset.isPending}
                    onClick={() => reset.mutate(r.category_id)}
                  >
                    Reset
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {save.error && <p className="error">{(save.error as Error).message}</p>}
      {reset.error && <p className="error">{(reset.error as Error).message}</p>}
    </section>
  )
}
