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
        </nav>
        <span className="spacer" />
        <span>
          {user?.name} ({user?.role})
        </span>
        <button onClick={logout}>Sign out</button>
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  )
}
