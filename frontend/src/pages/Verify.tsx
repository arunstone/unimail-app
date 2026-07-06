import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
import AuthShell from '../components/common/AuthShell'

type State = 'verifying' | 'ok' | 'error'

export default function Verify() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const [state, setState] = useState<State>('verifying')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!token) {
      setState('error')
      setMessage('Missing verification token')
      return
    }
    api
      .get<{ email: string }>(`/api/auth/verify?token=${encodeURIComponent(token)}`)
      .then((res) => {
        setState('ok')
        setMessage(res.email)
      })
      .catch((e) => {
        setState('error')
        setMessage(e instanceof Error ? e.message : 'Verification failed')
      })
  }, [token])

  return (
    <AuthShell>
      <div className="text-center">
        {state === 'verifying' && (
          <p className="text-body text-muted">Verifying your email…</p>
        )}
        {state === 'ok' && (
          <>
            <div className="mb-3 text-3xl">✅</div>
            <h1 className="mb-2 text-head font-bold text-primary">Email verified</h1>
            <p className="text-body text-muted">
              <span className="text-primary">{message}</span> is now active.
            </p>
            <Link to="/login" className="btn-primary mt-6 inline-block w-full px-4 py-2.5 text-center">
              Sign in
            </Link>
          </>
        )}
        {state === 'error' && (
          <>
            <div className="mb-3 text-3xl">⚠️</div>
            <h1 className="mb-2 text-head font-bold text-primary">Verification failed</h1>
            <p className="text-body text-red-300">{message}</p>
            <Link to="/login" className="mt-6 inline-block text-body text-accent hover:underline">
              Back to sign in
            </Link>
          </>
        )}
      </div>
    </AuthShell>
  )
}
