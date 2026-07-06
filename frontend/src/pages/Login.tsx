import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api, ApiError, setToken } from '../api/client'
import { useAuthStore } from '../stores/authStore'
import AuthShell, { AuthError } from '../components/common/AuthShell'
import OAuthButtons from '../components/common/OAuthButtons'
import { Button, Input } from '../components/common/ui'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [unverified, setUnverified] = useState(false)
  const [resent, setResent] = useState(false)
  const login = useAuthStore((s) => s.login)
  const loadMe = useAuthStore((s) => s.loadMe)
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()

  // "Sign in with Google/Microsoft" lands back here with a session token
  useEffect(() => {
    const oauthToken = params.get('oauth_token')
    const oauthError = params.get('oauth_error')
    if (oauthToken) {
      setToken(oauthToken)
      void loadMe()
      nav('/', { replace: true })
    } else if (oauthError) {
      setError(`Sign-in failed (${oauthError.split('_').join(' ')}) — try again`)
      setParams({}, { replace: true })
    }
  }, [params, setParams, loadMe, nav])

  const resend = async () => {
    try {
      await api.post('/api/auth/resend-verification', { email })
      setResent(true)
    } catch {
      setError('Could not resend the email — try again later')
    }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    setUnverified(false)
    setResent(false)
    try {
      await login(email, password)
      nav('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
      if (err instanceof ApiError && err.status === 403) setUnverified(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell tagline="All your email in one place">
      <OAuthButtons />
      <form onSubmit={submit}>
        {error && (
          <AuthError>
            {error}
            {unverified && !resent && (
              <button type="button" onClick={resend} className="mt-1 block text-accent hover:underline">
                Resend verification email
              </button>
            )}
            {resent && <div className="mt-1 text-body text-muted">Verification email sent.</div>}
          </AuthError>
        )}
        <div className="space-y-3">
          <Input type="email" placeholder="Email" value={email}
                 onChange={(e) => setEmail(e.target.value)} required />
          <Input type="password" placeholder="Password" value={password}
                 onChange={(e) => setPassword(e.target.value)} required />
          <Button disabled={busy} className="w-full">
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
        </div>
        <div className="mt-4 flex items-center justify-between text-body text-muted">
          <Link to="/forgot" className="text-muted transition-colors hover:text-accent">
            Forgot password?
          </Link>
          <span>
            No account?{' '}
            <Link to="/register" className="text-accent hover:underline">
              Register
            </Link>
          </span>
        </div>
      </form>
    </AuthShell>
  )
}
