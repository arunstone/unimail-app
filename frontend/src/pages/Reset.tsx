import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
import AuthShell, { AuthError } from '../components/common/AuthShell'
import { Button, Input } from '../components/common/ui'

export default function Reset() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const nav = useNavigate()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }
    setBusy(true)
    setError('')
    try {
      await api.post('/api/auth/reset-password', { token, password })
      nav('/login', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell tagline="Choose a new password">
      <form onSubmit={submit}>
        {!token ? (
          <AuthError>
            This reset link is missing its token — open the link from your email again.
          </AuthError>
        ) : (
          <>
            {error && <AuthError>{error}</AuthError>}
            <Input
              type="password"
              required
              minLength={8}
              placeholder="New password (min 8 characters)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Input
              className="mt-3"
              type="password"
              required
              placeholder="Repeat new password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
            <Button disabled={busy} className="mt-4 w-full">
              {busy ? 'Saving…' : 'Set new password'}
            </Button>
          </>
        )}
        <p className="mt-6 text-center text-body text-muted">
          <Link to="/login" className="text-accent hover:underline">
            Back to sign in
          </Link>
        </p>
      </form>
    </AuthShell>
  )
}
