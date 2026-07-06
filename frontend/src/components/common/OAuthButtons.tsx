import { useEffect, useState } from 'react'
import { api } from '../../api/client'

const PROVIDER_META: Record<string, { label: string; color: string; letter: string }> = {
  gmail: { label: 'Continue with Google', color: '#EA4335', letter: 'G' },
  outlook: { label: 'Continue with Microsoft', color: '#0078D4', letter: 'M' },
}

/** "Continue with Google / Microsoft" buttons for the auth pages. Only the
 *  providers whose OAuth credentials are configured server-side show up —
 *  with none configured this renders nothing. */
export default function OAuthButtons() {
  const [available, setAvailable] = useState<Record<string, boolean>>({})

  useEffect(() => {
    api
      .get<Record<string, boolean>>('/api/auth/oauth-providers')
      .then(setAvailable)
      .catch(() => setAvailable({}))
  }, [])

  const providers = Object.keys(PROVIDER_META).filter((p) => available[p])
  if (providers.length === 0) return null

  return (
    <div className="mb-4">
      <div className="space-y-2">
        {providers.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => {
              window.location.href = `/api/auth/oauth/${p}/start`
            }}
            className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-divider px-4 py-2.5 text-body font-medium text-primary transition-colors hover:bg-surface"
          >
            <span
              className="flex h-5 w-5 items-center justify-center rounded text-caption font-bold text-white"
              style={{ backgroundColor: PROVIDER_META[p].color }}
            >
              {PROVIDER_META[p].letter}
            </span>
            {PROVIDER_META[p].label}
          </button>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-3">
        <span className="h-px flex-1 bg-divider" />
        <span className="text-caption text-muted">or</span>
        <span className="h-px flex-1 bg-divider" />
      </div>
    </div>
  )
}
