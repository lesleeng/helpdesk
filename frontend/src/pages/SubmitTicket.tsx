import { useNavigate } from 'react-router-dom'
import TicketForm from '../components/TicketForm/TicketForm'

export default function SubmitTicket() {
  const navigate = useNavigate()
  return <TicketForm onCreated={(id) => navigate(`/tickets/${id}`)} />
}
