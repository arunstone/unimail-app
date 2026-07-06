import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import AuthShell, { AuthError } from '../components/common/AuthShell'
import OAuthButtons from '../components/common/OAuthButtons'
import { Button, Input } from '../components/common/ui'

export default function Register() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [awaitingVerify, setAwaitingVerify] = useState(false)
  const { register, login } = useAuthStore()
  const nav = useNavigate()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    setBusy(true)
    setError('')
    try {
      const created = await register(name, email, password)
      if (!created.is_verified) {
        setAwaitingVerify(true)
        return
      }
      await login(email, password)
      nav('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed')
    } finally {
      setBusy(false)
    }
  }

  if (awaitingVerify) {
    return (
      <AuthShell>
        <div className="text-center">
          <div className="mb-3 text-3xl">📬</div>
          <h1 className="mb-2 text-head font-bold text-primary">Check your inbox</h1>
          <p className="text-body text-muted">
            We sent a verification link to <span className="text-primary">{email}</span>.
            Open it to activate your account, then sign in.
          </p>
          <Link to="/login" className="btn-primary mt-6 inline-block w-full px-4 py-2.5 text-center">
            Go to sign in
          </Link>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell tagline="Start unifying your inboxes">
      <OAuthButtons />
      <form onSubmit={submit}>
        {error && <AuthError>{error}</AuthError>}
        <div className="space-y-3">
          <Input placeholder="Your name" value={name}
                 onChange={(e) => setName(e.target.value)} required />
          <Input type="email" placeholder="Email" value={email}
                 onChange={(e) => setEmail(e.target.value)} required />
          <Input type="password" placeholder="Password (min 8 chars)"
                 value={password} onChange={(e) => setPassword(e.target.value)} required />
          <Button disabled={busy} className="w-full">
            {busy ? 'Creating…' : 'Create account'}
          </Button>
        </div>
        <p className="mt-4 text-center text-body text-muted">
          Already registered?{' '}
          <Link to="/login" className="text-accent hover:underline">
            Sign in
          </Link>
        </p>
      </form>
    </AuthShell>
  )
}
