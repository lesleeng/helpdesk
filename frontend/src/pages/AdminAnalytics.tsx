import { useState } from 'react'
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query'
import { api } from '../services/api'
import BarChart from '../components/Chart/BarChart'
import ChartFrame from '../components/Chart/ChartFrame'
import LineChart from '../components/Chart/LineChart'

const RANGES = [7, 30, 90, 180]
const IS_DEMO = import.meta.env.VITE_DEMO === 'true'

const day = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })

function download(text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'tickets.csv'
  link.click()
  URL.revokeObjectURL(url)
}

export default function AdminAnalytics() {
  const [days, setDays] = useState(30)
  const analytics = useQuery({
    queryKey: ['analytics', days],
    queryFn: () => api.analytics(days),
    placeholderData: keepPreviousData,
  })
  const exportCsv = useMutation({ mutationFn: api.ticketsCsv, onSuccess: download })

  if (analytics.isLoading) return <p className="muted">Loading…</p>
  if (analytics.error || !analytics.data) {
    return <p className="error">{(analytics.error as Error | null)?.message ?? 'No data'}</p>
  }

  const a = analytics.data
  const dim = analytics.isFetching
  const hours = (v?: number | null) => (v == null ? '—' : v)
  const stats: [string, string | number][] = [
    ['Tickets created', a.totals.created],
    ['Tickets resolved', a.totals.resolved],
    ['Average first response (hours)', hours(a.totals.avg_first_response_hours)],
    ['Average resolution (hours)', hours(a.totals.avg_resolution_hours)],
    ['Reopen rate', a.totals.reopen_rate_pct == null ? '—' : `${a.totals.reopen_rate_pct}%`],
  ]

  return (
    <>
      <section className="card">
        <h2>Analytics</h2>
        <div className="filters">
          <select
            aria-label="Time range"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            {RANGES.map((d) => (
              <option key={d} value={d}>
                Last {d} days
              </option>
            ))}
          </select>
          {!IS_DEMO && (
            <button onClick={() => exportCsv.mutate()} disabled={exportCsv.isPending}>
              Export tickets (CSV)
            </button>
          )}
        </div>
        {IS_DEMO && <p className="muted">CSV export is available in the full app.</p>}
        {exportCsv.error && <p className="error">{(exportCsv.error as Error).message}</p>}
        <dl className={`extra${dim ? ' dim' : ''}`}>
          {stats.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <ChartFrame
        title="Tickets created and resolved"
        dim={dim}
        legend={[
          { label: 'Created', tone: 'context' },
          { label: 'Resolved', tone: 'accent' },
        ]}
        table={{
          head: ['Date', 'Created', 'Resolved'],
          rows: a.volume.map((p) => [day(p.date), p.created, p.resolved]),
        }}
      >
        <LineChart
          ariaLabel={`Tickets created and resolved per day, last ${a.days} days`}
          labels={a.volume.map((p) => p.date)}
          tickLabel={day}
          series={[
            {
              key: 'created',
              label: 'Created',
              tone: 'context',
              values: a.volume.map((p) => p.created),
            },
            {
              key: 'resolved',
              label: 'Resolved',
              tone: 'accent',
              values: a.volume.map((p) => p.resolved),
            },
          ]}
        />
      </ChartFrame>

      <ChartFrame
        title="Open tickets by age"
        dim={dim}
        note="Tickets that are open, in progress or on hold, by time since they were created."
        table={{ head: ['Age', 'Tickets'], rows: a.backlog_age.map((b) => [b.bucket, b.count]) }}
      >
        <BarChart
          ariaLabel="Open tickets by age"
          items={a.backlog_age.map((b) => ({ label: b.bucket, value: b.count }))}
        />
      </ChartFrame>

      <ChartFrame
        title="Average resolution time by category"
        dim={dim}
        table={{
          head: ['Category', 'Average hours', 'Resolved'],
          rows: a.resolution_by_category.map((c) => [c.category, c.avg_hours ?? '—', c.resolved]),
        }}
      >
        {a.resolution_by_category.length === 0 ? (
          <p className="muted">No tickets were resolved in this period.</p>
        ) : (
          <BarChart
            ariaLabel="Average resolution time in hours by category"
            format={(v) => `${v} h`}
            items={a.resolution_by_category.map((c) => ({
              label: c.category,
              value: c.avg_hours ?? null,
              detail: `${c.resolved} resolved`,
            }))}
          />
        )}
      </ChartFrame>

      <ChartFrame
        title="Resolved within the SLA, by week"
        dim={dim}
        table={{
          head: ['Week of', 'Met', 'Resolved', 'Share'],
          rows: a.sla_by_week.map((w) => [day(w.week_start), w.met, w.total, `${w.pct}%`]),
        }}
      >
        {a.sla_by_week.length === 0 ? (
          <p className="muted">No tickets were resolved in this period.</p>
        ) : (
          <LineChart
            ariaLabel="Share of tickets resolved within their SLA, by week"
            labels={a.sla_by_week.map((w) => w.week_start)}
            tickLabel={day}
            domain={[0, 100]}
            format={(v) => `${v}%`}
            series={[
              {
                key: 'sla',
                label: 'Within SLA',
                tone: 'accent',
                values: a.sla_by_week.map((w) => w.pct),
              },
            ]}
          />
        )}
      </ChartFrame>

      <ChartFrame
        title="Satisfaction by week"
        dim={dim}
        note="Average rating from 1 (very unsatisfied) to 5 (very satisfied)."
        table={{
          head: ['Week of', 'Average rating', 'Ratings'],
          rows: a.satisfaction_by_week.map((w) => [
            day(w.week_start),
            w.avg_rating ?? '—',
            w.count,
          ]),
        }}
      >
        {a.satisfaction_by_week.length === 0 ? (
          <p className="muted">No feedback was received in this period.</p>
        ) : (
          <LineChart
            ariaLabel="Average satisfaction rating by week"
            labels={a.satisfaction_by_week.map((w) => w.week_start)}
            tickLabel={day}
            domain={[1, 5]}
            format={(v) => v.toFixed(1)}
            series={[
              {
                key: 'rating',
                label: 'Average rating',
                tone: 'accent',
                values: a.satisfaction_by_week.map((w) => w.avg_rating ?? null),
              },
            ]}
          />
        )}
      </ChartFrame>
    </>
  )
}
