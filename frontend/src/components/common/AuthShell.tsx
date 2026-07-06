import type { ReactNode } from 'react'
import { Wordmark } from './ui'

/** Shared chrome for the logged-out pages: ambient glow background,
 *  glass card, logo mark. */
export default function AuthShell({
  tagline,
  children,
}: {
  tagline?: string
  children: ReactNode
}) {
  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-app px-4">
      <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-accent/20 blur-[130px]" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-accent2/15 blur-[130px]" />

      <div className="relative w-full max-w-sm animate-fade-up rounded-2xl border border-white/10 bg-panel/70 p-8 shadow-card backdrop-blur-xl">
        <div className="mb-1 flex items-center justify-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-gradient text-subhead shadow-glow">
            ✉
          </span>
          <Wordmark className="text-2xl" />
        </div>
        {tagline && <p className="mb-6 mt-1 text-center text-body text-muted">{tagline}</p>}
        {children}
      </div>
    </div>
  )
}

/** Inline error banner used by all auth forms. */
export function AuthError({ children }: { children: ReactNode }) {
  return (
    <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-body text-red-300">
      {children}
    </div>
  )
}
