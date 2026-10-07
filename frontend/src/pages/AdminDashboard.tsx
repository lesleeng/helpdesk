import { useQuery } from '@tanstack/react-query'
import { api } from '../services/api'

export default function AdminDashboard() {
  const dashboard = useQuery({ queryKey: ['dashboard'], queryFn: api.dashboard })

  if (dashboard.isLoading) return <p className="muted">Loading…</p>
  if (dashboard.error || !dashboard.data) {
    return <p className="error">{(dashboard.error as Error | null)?.message ?? 'No data'}</p>
  }

  const d = dashboard.data
  const breakdowns: [string, string, Record<string, number>][] = [
    ['By status', 'Status', d.by_status],
    ['By category', 'Category', d.by_category],
    ['By priority', 'Priority', d.by_priority],
  ]

  return (
    <>
      <section className="card">
        <h2>Dashboard</h2>
        <dl className="extra">
          <div>
            <dt>Total tickets</dt>
            <dd>{d.total}</dd>
          </div>
          <div>
            <dt>Average resolution (hours)</dt>
            <dd>{d.avg_resolution_hours ?? '—'}</dd>
          </div>
        </dl>
      </section>
      {breakdowns.map(([title, column, counts]) => (
        <section className="card" key={title}>
          <h3>{title}</h3>
          {Object.keys(counts).length === 0 && <p className="muted">No tickets found.</p>}
          {Object.keys(counts).length > 0 && (
            <table className="table">
              <thead>
                <tr>
                  <th>{column}</th>
                  <th>Tickets</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(counts).map(([name, count]) => (
                  <tr key={name}>
                    <td>{name.replace(/_/g, ' ')}</td>
                    <td>{count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      ))}
    </>
  )
}
