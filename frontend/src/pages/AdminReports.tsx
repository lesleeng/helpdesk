import { useQuery } from '@tanstack/react-query'
import { api } from '../services/api'

export default function AdminReports() {
  const report = useQuery({ queryKey: ['report'], queryFn: api.report })
  const staff = useQuery({ queryKey: ['staff'], queryFn: api.staff })

  if (report.isLoading) return <p className="muted">Loading…</p>
  if (report.error || !report.data) {
    return <p className="error">{(report.error as Error | null)?.message ?? 'No data'}</p>
  }

  const r = report.data
  const pct = (value?: number | null) => (value == null ? '—' : `${value}%`)
  const stats: [string, string | number][] = [
    ['Open tickets', r.open_count],
    ['Resolved tickets', r.resolved_count],
    ['Unassigned open tickets', r.unassigned_open],
    ['Average resolution (hours)', r.avg_resolution_hours ?? '—'],
    ['Average first response (hours)', r.avg_first_response_hours ?? '—'],
    ['Response SLA met', pct(r.response_sla_met_pct)],
    ['Resolution SLA met', pct(r.resolution_sla_met_pct)],
  ]

  return (
    <>
      <section className="card">
        <h2>Reports</h2>
        <dl className="extra">
          {stats.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section className="card">
        <h3>By assignee</h3>
        {r.by_assignee.length === 0 && <p className="muted">No tickets found.</p>}
        {r.by_assignee.length > 0 && (
          <table className="table">
            <thead>
              <tr>
                <th>Assignee</th>
                <th>Open</th>
                <th>Resolved</th>
              </tr>
            </thead>
            <tbody>
              {r.by_assignee.map((a) => (
                <tr key={a.assignee_id}>
                  <td>{staff.data?.find((m) => m.id === a.assignee_id)?.name ?? a.assignee_id}</td>
                  <td>{a.open}</td>
                  <td>{a.resolved}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  )
}
