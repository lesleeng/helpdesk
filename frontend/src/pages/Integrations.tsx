import { useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../services/api'
import type { WebhookCreated } from '../types'

export default function Integrations() {
  const qc = useQueryClient()
  const status = useQuery({ queryKey: ['integrations'], queryFn: api.integrations })
  const hooks = useQuery({ queryKey: ['webhooks'], queryFn: api.webhooks })
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [allEvents, setAllEvents] = useState(true)
  const [events, setEvents] = useState<string[]>([])
  const [secret, setSecret] = useState<WebhookCreated | null>(null)
  const [viewing, setViewing] = useState<number | null>(null)
  const [confirming, setConfirming] = useState<number | null>(null)

  const refresh = () => qc.invalidateQueries({ queryKey: ['webhooks'] })
  const deliveries = useQuery({
    queryKey: ['deliveries', viewing],
    queryFn: () => api.deliveries(viewing as number),
    enabled: viewing !== null,
  })
  const create = useMutation({
    mutationFn: () =>
      api.createWebhook({ name: name.trim(), url: url.trim(), events: allEvents ? ['*'] : events }),
    onSuccess: (hook) => {
      setSecret(hook)
      setName('')
      setUrl('')
      setEvents([])
      setAllEvents(true)
      refresh()
    },
  })
  const toggle = useMutation({
    mutationFn: (v: { id: number; active: boolean }) =>
      api.updateWebhook(v.id, { active: v.active }),
    onSuccess: refresh,
  })
  const rotate = useMutation({
    mutationFn: (id: number) => api.rotateWebhook(id),
    onSuccess: setSecret,
  })
  const test = useMutation({
    mutationFn: (id: number) => api.testWebhook(id),
    onSuccess: (_, id) => {
      setViewing(id)
      qc.invalidateQueries({ queryKey: ['deliveries', id] })
      refresh()
    },
  })
  const remove = useMutation({
    mutationFn: (id: number) => api.deleteWebhook(id),
    onSuccess: (_, id) => {
      setConfirming(null)
      if (viewing === id) setViewing(null)
      refresh()
    },
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (name.trim() && url.trim() && (allEvents || events.length > 0)) create.mutate()
  }
  const viewed = hooks.data?.find((h) => h.id === viewing)
  const when = (iso?: string | null) => (iso ? new Date(iso + 'Z').toLocaleString() : '—')
  const mutationError = [create, toggle, rotate, test, remove].find((m) => m.error)?.error as
    Error | undefined

  return (
    <>
      <section className="card">
        <h2>Integrations</h2>
        <h3>Slack</h3>
        {status.data && (
          <p className="muted">
            {status.data.slack_enabled
              ? 'Slack notifications are on. New tickets, assignments, status changes, approvals and feedback are posted to your channel.'
              : 'Slack notifications are off. Set ENABLE_SLACK_NOTIFICATIONS=true and SLACK_WEBHOOK_URL on the server to turn them on.'}
          </p>
        )}
        {status.error && <p className="error">{(status.error as Error).message}</p>}
      </section>

      <section className="card">
        <h3>Webhooks</h3>
        <p className="muted">
          Each event is sent as signed JSON (header X-Helpdesk-Signature, HMAC-SHA256 of the body).
          Internal notes are never sent.
        </p>
        {secret && (
          <div className="field">
            <p className="warning">
              Signing secret for {secret.name}. Copy it now; it is shown only once.
            </p>
            <input
              aria-label="Signing secret"
              readOnly
              value={secret.secret}
              onFocus={(e) => e.currentTarget.select()}
            />
            <div>
              <button onClick={() => setSecret(null)}>I have copied it</button>
            </div>
          </div>
        )}
        {mutationError && <p className="error">{mutationError.message}</p>}
        {hooks.isLoading && <p className="muted">Loading…</p>}
        {hooks.data?.length === 0 && <p className="muted">No webhooks yet.</p>}
        {hooks.data && hooks.data.length > 0 && (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>URL</th>
                  <th>Events</th>
                  <th>Last delivery</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {hooks.data.map((h) => (
                  <tr key={h.id}>
                    <td>
                      {h.name} {!h.active && <span className="badge">Disabled</span>}
                    </td>
                    <td>{h.url}</td>
                    <td>{h.events.includes('*') ? 'All events' : h.events.join(', ')}</td>
                    <td>{h.last_status ?? '—'}</td>
                    <td>
                      <button
                        aria-label={`Send test to ${h.name}`}
                        onClick={() => test.mutate(h.id)}
                      >
                        Test
                      </button>{' '}
                      <button
                        aria-label={`Show deliveries for ${h.name}`}
                        onClick={() => setViewing(viewing === h.id ? null : h.id)}
                      >
                        Deliveries
                      </button>{' '}
                      <button
                        aria-label={`${h.active ? 'Disable' : 'Enable'} ${h.name}`}
                        onClick={() => toggle.mutate({ id: h.id, active: !h.active })}
                      >
                        {h.active ? 'Disable' : 'Enable'}
                      </button>{' '}
                      <button
                        aria-label={`New secret for ${h.name}`}
                        onClick={() => rotate.mutate(h.id)}
                      >
                        New secret
                      </button>{' '}
                      {confirming === h.id ? (
                        <>
                          <button
                            aria-label={`Confirm delete ${h.name}`}
                            onClick={() => remove.mutate(h.id)}
                          >
                            Yes, delete
                          </button>{' '}
                          <button onClick={() => setConfirming(null)}>Cancel</button>
                        </>
                      ) : (
                        <button aria-label={`Delete ${h.name}`} onClick={() => setConfirming(h.id)}>
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {viewed && (
        <section className="card">
          <h3>Deliveries for {viewed.name}</h3>
          {deliveries.isLoading && <p className="muted">Loading…</p>}
          {deliveries.data?.length === 0 && <p className="muted">No deliveries yet.</p>}
          {deliveries.data && deliveries.data.length > 0 && (
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Event</th>
                    <th>Ticket</th>
                    <th>Result</th>
                    <th>Attempts</th>
                  </tr>
                </thead>
                <tbody>
                  {deliveries.data.map((d) => (
                    <tr key={d.id}>
                      <td>{when(d.created_at)}</td>
                      <td>{d.event}</td>
                      <td>{d.ticket_id ?? '—'}</td>
                      <td>
                        {d.status}
                        {d.response_code ? ` (HTTP ${d.response_code})` : ''}
                        {d.error && <span className="muted"> · {d.error}</span>}
                      </td>
                      <td>{d.attempts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <form className="card form" onSubmit={submit}>
        <h3>Add a webhook</h3>
        <div className="field">
          <label htmlFor="hook-name">Name</label>
          <input
            id="hook-name"
            value={name}
            maxLength={100}
            required
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="hook-url">URL</label>
          <input
            id="hook-url"
            type="url"
            value={url}
            placeholder="https://example.com/helpdesk-events"
            required
            onChange={(e) => setUrl(e.target.value)}
          />
        </div>
        <fieldset className="field">
          <legend>Events</legend>
          <label>
            <input
              type="checkbox"
              checked={allEvents}
              onChange={(e) => setAllEvents(e.target.checked)}
            />{' '}
            All events
          </label>
          {!allEvents &&
            status.data?.webhook_events.map((ev) => (
              <label key={ev}>
                <input
                  type="checkbox"
                  checked={events.includes(ev)}
                  onChange={(e) =>
                    setEvents(e.target.checked ? [...events, ev] : events.filter((x) => x !== ev))
                  }
                />{' '}
                {ev}
              </label>
            ))}
        </fieldset>
        {status.data && !status.data.allow_private_webhooks && (
          <p className="muted">Addresses on internal networks are blocked.</p>
        )}
        <button type="submit" disabled={create.isPending}>
          Add webhook
        </button>
      </form>
    </>
  )
}
