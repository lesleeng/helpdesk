import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'

export default function Layout() {
  const { user, logout } = useAuth()
  return (
    <div className="app">
      <header className="header">
        <strong>IT Help Desk</strong>
        <nav>
          <NavLink to="/tickets">My Tickets</NavLink>
          <NavLink to="/tickets/new">New Ticket</NavLink>
          <NavLink to="/kb">Knowledge Base</NavLink>
          <NavLink to="/approvals">Approvals</NavLink>
          {user?.role === 'tech' && <NavLink to="/tickets/assigned">Assigned to me</NavLink>}
          {user?.role === 'admin' && <NavLink to="/admin/tickets">All Tickets</NavLink>}
          {user?.role === 'admin' && <NavLink to="/admin/dashboard">Dashboard</NavLink>}
          {user?.role === 'admin' && <NavLink to="/admin/reports">Reports</NavLink>}
          {user?.role === 'admin' && <NavLink to="/admin/sla">SLA rules</NavLink>}
        </nav>
        <span className="spacer" />
        <span>
          {user?.name} ({user?.role})
        </span>
        <button onClick={logout}>Sign out</button>
      </header>
      <main className="content">
        {import.meta.env.VITE_DEMO === 'true' && (
          <div className="card">
            <p className="warning">
              Demo mode: sample data lives in this browser tab only and resets on reload. AI
              suggestions are simulated.
            </p>
          </div>
        )}
        <Outlet />
      </main>
    </div>
  )
}
