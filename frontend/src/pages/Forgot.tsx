import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import AuthShell, { AuthError } from '../components/common/AuthShell'
import { Button, Input } from '../components/common/ui'

export default function Forgot() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api.post('/api/auth/forgot-password', { email })
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell tagline="Reset your password">
      <form onSubmit={submit}>
        {sent ? (
          <div className="rounded-lg border border-green-500/40 bg-green-500/10 px-3 py-3 text-body text-green-300">
            If an account exists for <span className="font-medium">{email}</span>, a reset
            link is on its way. Check your inbox.
          </div>
        ) : (
          <>
            {error && <AuthError>{error}</AuthError>}
            <Input
              type="email"
              required
              placeholder="Your account email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Button disabled={busy} className="mt-4 w-full">
              {busy ? 'Sending…' : 'Send reset link'}
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
