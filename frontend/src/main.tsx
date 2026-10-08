import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, HashRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from './hooks/useAuth'
import App from './App'
import './styles/index.css'

const Router = import.meta.env.VITE_DEMO === 'true' ? HashRouter : BrowserRouter

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <Router>
        <AuthProvider>
          <App />
        </AuthProvider>
      </Router>
    </QueryClientProvider>
  </StrictMode>,
)
