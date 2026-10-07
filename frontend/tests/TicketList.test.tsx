import { screen } from '@testing-library/react'
import TicketList from '../src/components/TicketList/TicketList'
import { renderApp } from './helpers'
import type { Ticket } from '../src/types'

const base: Ticket = {
  id: 1,
  title: 'Printer jammed',
  description: 'x',
  user_id: 'user-1',
  category_id: 1,
  status: 'in_progress',
  priority: 'medium',
  urgency: 'high',
  created_at: '2026-10-07T10:00:00',
  updated_at: '2026-10-07T10:00:00',
  reopen_count: 0,
}

describe('TicketList', () => {
  it('renders tickets with status badge and link', () => {
    renderApp(<TicketList tickets={[base]} />)
    expect(screen.getByRole('link', { name: 'Printer jammed' })).toHaveAttribute(
      'href',
      '/tickets/1',
    )
    expect(screen.getByText('In Progress')).toBeInTheDocument()
  })

  it('shows empty state', () => {
    renderApp(<TicketList tickets={[]} />)
    expect(screen.getByText('No tickets found.')).toBeInTheDocument()
  })
})
