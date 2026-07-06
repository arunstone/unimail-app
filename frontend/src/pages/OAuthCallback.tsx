import { useEffect } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'

/**
 * Safety net route. The backend handles the real OAuth code exchange and
 * normally redirects straight to "/" — but if a provider is configured with
 * the frontend as redirect URI, forward the query string to the backend.
 */
export default function OAuthCallback() {
  const { provider } = useParams()
  const [params] = useSearchParams()
  const nav = useNavigate()

  useEffect(() => {
    const code = params.get('code')
    if (code && provider) {
      window.location.href = `/api/accounts/oauth/${provider}/callback?${params.toString()}`
    } else {
      nav('/')
    }
  }, [provider, params, nav])

  return (
    <div className="flex h-screen items-center justify-center bg-app text-body text-muted">
      Finishing account connection…
    </div>
  )
}
