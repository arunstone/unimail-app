import { useCallback, useEffect, useState } from 'react'
import { api } from '../../api/client'
import { truncate } from '../../lib/utils'
import { useLabelsStore } from '../../stores/labelsStore'
import { useTabsStore } from '../../stores/tabsStore'
import { toast } from '../../stores/toastStore'
import EmptyState from '../common/EmptyState'
import { SkeletonList } from '../common/Skeleton'
import type { LabelDetail, TimelineMessage } from '../../types'

function dayKey(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short', year: 'numeric', month: 'long', day: 'numeric',
  })
}

function partyLabel(m: TimelineMessage): string {
  const from = m.is_mine ? 'Me' : m.from_name || m.from_email
  const to = m.to_recipients[0]
  const toLabel = to ? to.name || to.email : '—'
  return `${truncate(from, 24)} ▶ ${truncate(toLabel, 24)}`
}

/** A saved label shown as a chat-style timeline of its collected emails. */
export default function LabelTimelineView({ labelId }: { labelId: string }) {
  const [label, setLabel] = useState<LabelDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { openTab, closeTab, activeTabId } = useTabsStore()
  const { deleteLabel, removeEmailFromLabel, fetchLabels } = useLabelsStore()

  const load = useCallback(() => {
    api.get<LabelDetail>(`/api/labels/${labelId}`).then(setLabel).catch((e) => setError(e.message))
  }, [labelId])

  useEffect(() => {
    load()
  }, [load])

  if (error) return <div className="p-6 text-body text-red-400">Could not load label: {error}</div>
  if (!label) return <SkeletonList rows={4} />

  const openEmail = (m: TimelineMessage) =>
    openTab({
      kind: 'email',
      key: `email:${m.id}`,
      title: truncate(m.subject || '(no subject)', 30),
      location: { view: 'email', emailId: m.id, subject: m.subject },
      crumbPrefix: [
        { label: label.name, loc: { view: 'label', labelId: label.id, name: label.name } },
      ],
    })

  const removeEmail = async (m: TimelineMessage) => {
    try {
      await removeEmailFromLabel(label.id, m.id)
      load()
    } catch {
      toast.error('Could not remove email from label')
    }
  }

  const destroy = async () => {
    if (!window.confirm(`Delete the label “${label.name}”? The emails themselves stay.`)) return
    try {
      await deleteLabel(label.id)
      await fetchLabels()
      toast.success('Label deleted')
      closeTab(activeTabId)
    } catch {
      toast.error('Could not delete label')
    }
  }

  let lastDay = ''

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-divider px-6 py-4">
        <div>
          <h2 className="text-head font-semibold text-primary">🏷 {label.name}</h2>
          <div className="text-caption text-muted">
            {label.email_count} email{label.email_count === 1 ? '' : 's'} · timeline of who
            wrote to whom
          </div>
        </div>
        <button
          onClick={() => void destroy()}
          className="rounded-lg border border-divider px-3 py-1.5 text-body text-muted transition-colors hover:border-red-400 hover:text-red-300"
        >
          🗑 Delete label
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {label.emails.length === 0 ? (
          <EmptyState
            icon="🧱"
            title="This label is empty"
            hint="Search for mail and drag results into the workspace panel to fill it."
          />
        ) : (
          label.emails.map((m) => {
            const day = dayKey(m.received_at)
            const separator = day !== lastDay
            lastDay = day
            return (
              <div key={m.id}>
                {separator && (
                  <div className="my-4 flex items-center justify-center">
                    <span className="rounded-full border border-divider bg-surface px-3 py-1 font-mono text-caption text-muted shadow-card">
                      {day}
                    </span>
                  </div>
                )}
                <div className={`mb-3 flex ${m.is_mine ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`group relative w-[78%] cursor-pointer rounded-2xl border px-4 py-3 transition-colors hover:border-accent ${
                      m.is_mine
                        ? 'rounded-br-sm border-accent/30 bg-gradient-to-br from-accent/25 to-accent2/15'
                        : 'rounded-bl-sm border-divider bg-surface'
                    }`}
                    onClick={() => openEmail(m)}
                  >
                    <div className="mb-1 flex items-baseline justify-between gap-3">
                      <span className="truncate text-caption font-semibold text-accent">
                        {partyLabel(m)}
                      </span>
                      <span className="shrink-0 font-mono text-caption text-muted">
                        {new Date(m.received_at).toLocaleTimeString(undefined, {
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <div className="text-body font-medium text-primary">
                      {m.has_attachments && <span className="mr-1">📎</span>}
                      {m.subject || '(no subject)'}
                    </div>
                    <div className="mt-0.5 line-clamp-2 text-caption text-muted">{m.preview}</div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        void removeEmail(m)
                      }}
                      title="Remove from label"
                      className="absolute -right-2 -top-2 hidden h-5 w-5 items-center justify-center rounded-full border border-divider bg-panel text-caption text-muted hover:border-red-400 hover:text-red-300 group-hover:flex"
                    >
                      ×
                    </button>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
