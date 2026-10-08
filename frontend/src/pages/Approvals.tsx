import { useQuery } from '@tanstack/react-query'
import { api } from '../services/api'
import TicketList from '../components/TicketList/TicketList'

export default function Approvals() {
  const approvals = useQuery({ queryKey: ['approvals'], queryFn: api.approvals })

  return (
    <section className="card">
      <h2>Approvals</h2>
      <p className="muted">Requests waiting for your approval.</p>
      {approvals.isLoading && <p className="muted">Loading…</p>}
      {approvals.error && <p className="error">{(approvals.error as Error).message}</p>}
      {approvals.data && <TicketList tickets={approvals.data} />}
    </section>
  )
}
