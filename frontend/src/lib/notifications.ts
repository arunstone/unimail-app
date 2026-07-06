import { useEffect } from 'react'
import { api } from '../api/client'
import { useAccountsStore } from '../stores/accountsStore'

interface NewMailItem {
  id: string
  from_name: string
  from_email: string
  subject: string
  account_email: string
}

interface NewMailOut {
  count: number
  latest: NewMailItem[]
  now: string
}

const POLL_MS = 60_000

/** Polls for freshly synced inbox mail and fires a desktop notification
 *  (when the user granted permission in Settings). */
export function useNewMailNotifications() {
  const refreshAll = useAccountsStore((s) => s.refreshAll)

  useEffect(() => {
    let since = new Date().toISOString()
    let stopped = false

    const poll = async () => {
      try {
        const res = await api.get<NewMailOut>(
          `/api/emails/new?since=${encodeURIComponent(since)}`,
        )
        if (stopped) return
        since = res.now
        if (res.count === 0) return
        void refreshAll()
        if ('Notification' in window && Notification.permission === 'granted') {
          const first = res.latest[0]
          const title =
            res.count === 1
              ? `📩 ${first.from_name || first.from_email}`
              : `📩 ${res.count} new emails`
          const body =
            res.count === 1
              ? first.subject || '(no subject)'
              : res.latest
                  .map((m) => `${m.from_name || m.from_email}: ${m.subject}`)
                  .join('\n')
          new Notification(title, { body, tag: 'unimail-new-mail' })
        }
      } catch {
        /* offline or logged out; retry next tick */
      }
    }

    const id = setInterval(() => void poll(), POLL_MS)
    return () => {
      stopped = true
      clearInterval(id)
    }
  }, [refreshAll])
}

/** Mirrors the unread inbox count into the browser tab title. */
export function useTitleBadge() {
  const summary = useAccountsStore((s) => s.summary)
  useEffect(() => {
    const unread = summary?.consolidated.find((f) => f.folder === 'inbox')?.unread ?? 0
    document.title = unread > 0 ? `(${unread}) Unimail` : 'Unimail'
  }, [summary])
}
