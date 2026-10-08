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
import Approvals from './pages/Approvals'
import KnowledgeArticle from './pages/KnowledgeArticle'
import KnowledgeArticleForm from './pages/KnowledgeArticleForm'
import KnowledgeBase from './pages/KnowledgeBase'
import SlaRules from './pages/SlaRules'
import { homePath } from './services/home'

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

function Home() {
  const { user } = useAuth()
  return <Navigate to={homePath(user?.role)} replace />
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
        <Route path="/kb" element={<KnowledgeBase />} />
        <Route
          path="/kb/new"
          element={
            <RequireAdmin>
              <KnowledgeArticleForm />
            </RequireAdmin>
          }
        />
        <Route path="/kb/:id" element={<KnowledgeArticle />} />
        <Route
          path="/kb/:id/edit"
          element={
            <RequireAdmin>
              <KnowledgeArticleForm />
            </RequireAdmin>
          }
        />
        <Route path="/approvals" element={<Approvals />} />
        <Route
          path="/admin/sla"
          element={
            <RequireAdmin>
              <SlaRules />
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
      <Route
        path="*"
        element={
          <RequireAuth>
            <Home />
          </RequireAuth>
        }
      />
    </Routes>
  )
}
