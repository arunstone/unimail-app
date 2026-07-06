import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Toasts from './components/common/Toasts'
import Dashboard from './pages/Dashboard'
import Forgot from './pages/Forgot'
import Login from './pages/Login'
import Reset from './pages/Reset'
import OAuthCallback from './pages/OAuthCallback'
import Register from './pages/Register'
import Verify from './pages/Verify'
import { useAuthStore } from './stores/authStore'

function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuthStore()
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-app text-body text-muted">
        Loading…
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  const loadMe = useAuthStore((s) => s.loadMe)

  useEffect(() => {
    void loadMe()
  }, [loadMe])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/verify" element={<Verify />} />
        <Route path="/forgot" element={<Forgot />} />
        <Route path="/reset" element={<Reset />} />
        <Route path="/oauth/callback/:provider" element={<OAuthCallback />} />
        <Route
          path="/"
          element={
            <Protected>
              <Dashboard />
            </Protected>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toasts />
    </BrowserRouter>
  )
}
