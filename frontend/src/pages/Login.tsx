import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { homePath } from '../services/home'

const DEMO_TOKENS = [
  { token: 'demo-token-user-1', label: 'John Smith (user)' },
  { token: 'demo-token-user-2', label: 'Jane Doe (user)' },
  { token: 'demo-token-manager-1', label: 'Maria Manager (user, approves requests)' },
  { token: 'demo-token-tech-1', label: 'Tina Tech (tech)' },
  { token: 'demo-token-admin-1', label: 'Admin User (admin)' },
]

export default function Login() {
  const { user, login } = useAuth()
  const [token, setToken] = useState(DEMO_TOKENS[0].token)
  const [error, setError] = useState<string | null>(null)

  if (user) return <Navigate to={homePath(user.role)} replace />

  return (
    <div className="card login">
      <h2>Sign in</h2>
      <p className="muted">
        Development sign-in using the mock auth service. In production the token comes from the main
        system.
      </p>
      <div className="field">
        <label htmlFor="demo-user">Demo user</label>
        <select id="demo-user" value={token} onChange={(e) => setToken(e.target.value)}>
          {DEMO_TOKENS.map((d) => (
            <option key={d.token} value={d.token}>
              {d.label}
            </option>
          ))}
        </select>
      </div>
      {error && <p className="error">{error}</p>}
      <button onClick={() => login(token).catch((e: Error) => setError(e.message))}>Sign in</button>
    </div>
  )
}
