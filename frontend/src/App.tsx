import { Navigate, Route, Routes } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from './hooks/useAuth'
import Layout from './components/Layout/Layout'
import Login from './pages/Login'
import MyTickets from './pages/MyTickets'
import SubmitTicket from './pages/SubmitTicket'
import TicketDetail from './pages/TicketDetail'
import AdminDashboard from './pages/AdminDashboard'
import AdminReports from './pages/AdminReports'

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <p className="muted">Loading…</p>
  return user ? <>{children}</> : <Navigate to="/login" replace />
}

function RequireAdmin({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  return user?.role === 'admin' ? <>{children}</> : <Navigate to="/tickets" replace />
}

function RequireStaff({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  return user?.role === 'admin' || user?.role === 'tech' ? (
    <>{children}</>
  ) : (
    <Navigate to="/tickets" replace />
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route path="/tickets" element={<MyTickets />} />
        <Route path="/tickets/new" element={<SubmitTicket />} />
        <Route
          path="/tickets/assigned"
          element={
            <RequireStaff>
              <MyTickets scope="assigned" />
            </RequireStaff>
          }
        />
        <Route path="/tickets/:id" element={<TicketDetail />} />
        <Route
          path="/admin/tickets"
          element={
            <RequireAdmin>
              <MyTickets scope="all" />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/reports"
          element={
            <RequireAdmin>
              <AdminReports />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/dashboard"
          element={
            <RequireAdmin>
              <AdminDashboard />
            </RequireAdmin>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/tickets" replace />} />
    </Routes>
  )
}
