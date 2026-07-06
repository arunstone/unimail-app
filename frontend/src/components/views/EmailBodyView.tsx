import { useCallback, useEffect, useRef, useState } from 'react'
import { api, downloadFile } from '../../api/client'
import { formatBytes, quoteHtml, truncate } from '../../lib/utils'
import { useAccountsStore } from '../../stores/accountsStore'
import { useTabsStore } from '../../stores/tabsStore'
import { useUiStore } from '../../stores/uiStore'
import { toast } from '../../stores/toastStore'
import Avatar from '../common/Avatar'
import { SkeletonList } from '../common/Skeleton'
import type { ThreadMessage } from '../../types'

const IFRAME_BASE_STYLE = `<style>
  body { font-family: Inter, system-ui, sans-serif; font-size: 14px; line-height: 1.55; color: #e9ecf5;
         background: #0d1018; margin: 14px; word-break: break-word; }
  a { color: #5b8cff; }
  img { max-width: 100%; height: auto; border-radius: 6px; }
  blockquote { border-left: 3px solid #262b3f; margin-left: 0; padding-left: 12px; color: #8a90ad; }
</style>`

const COLLAPSE_AT = 500

function dayKey(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short', year: 'numeric', month: 'long', day: 'numeric',
  })
}

function Bubble({ message }: { message: ThreadMessage }) {
  const [expanded, setExpanded] = useState(false)
  const [downloading, setDownloading] = useState<string | null>(null)

  const text = message.body_text ?? ''
  const longText = text.length > COLLAPSE_AT
  const htmlOnly = !text.trim() && !!message.body_html

  return (
    <div className={`mb-3 flex ${message.is_mine ? 'justify-end' : 'justify-start'}`}>
      {!message.is_mine && (
        <div className="mr-2 self-end">
          <Avatar name={message.from_name} email={message.from_email} size={26} />
        </div>
      )}
      <div
        className={`max-w-[78%] rounded-2xl border px-4 py-3 shadow-card ${
          message.is_mine
            ? 'rounded-br-sm border-accent/30 bg-gradient-to-br from-accent/25 to-accent2/15'
            : 'rounded-bl-sm border-divider bg-surface'
        }`}
      >
        <div className="mb-1 flex items-baseline justify-between gap-3">
          <span className="truncate text-caption font-semibold text-accent">
            {message.is_mine ? 'Me' : message.from_name || message.from_email}
          </span>
          <span className="shrink-0 font-mono text-caption text-muted">
            {new Date(message.received_at).toLocaleTimeString(undefined, {
              hour: '2-digit', minute: '2-digit',
            })}
          </span>
        </div>

        {htmlOnly ? (
          expanded ? (
            <iframe
              title={`msg-${message.id}`}
              sandbox=""
              srcDoc={IFRAME_BASE_STYLE + (message.body_html ?? '')}
              className="h-[380px] w-full min-w-[260px] rounded-lg bg-app md:min-w-[420px]"
            />
          ) : (
            <div className="text-body text-primary">{message.preview || '(no text)'}</div>
          )
        ) : (
          <div className="whitespace-pre-wrap break-words text-body text-primary">
            {expanded || !longText ? text || message.preview : truncate(text, COLLAPSE_AT)}
          </div>
        )}

        {(longText || htmlOnly) && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="mt-1 text-caption text-accent hover:underline"
          >
            {expanded ? 'Show less ▲' : htmlOnly ? 'Tap to expand full email ▼' : 'Show more ▼'}
          </button>
        )}

        {message.attachments.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {message.attachments.map((att) => (
              <button
                key={att.id}
                disabled={downloading === att.id}
                onClick={async () => {
                  setDownloading(att.id)
                  try {
                    await downloadFile(
                      `/api/emails/${message.id}/attachments/${att.id}/download`,
                      att.filename,
                    )
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : 'Download failed')
                  } finally {
                    setDownloading(null)
                  }
                }}
                className="flex items-center gap-1.5 rounded-lg border border-divider bg-app px-2 py-1 text-caption text-primary transition-colors hover:border-accent disabled:opacity-50"
                title={`${att.content_type} — click to download`}
              >
                {downloading === att.id ? '⏳' : '📎'} {truncate(att.filename, 24)}
                <span className="font-mono text-muted">{formatBytes(att.size_bytes)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default function EmailBodyView({ emailId }: { emailId: string }) {
  const [thread, setThread] = useState<ThreadMessage[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)
  const openCompose = useUiStore((s) => s.openCompose)
  const refreshAll = useAccountsStore((s) => s.refreshAll)
  const { closeTab, activeTabId } = useTabsStore()
  const bottomRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    const messages = await api.get<ThreadMessage[]>(`/api/emails/${emailId}/thread`)
    setThread(messages)
    const opened = messages.find((m) => m.id === emailId)
    if (opened && !opened.is_read) {
      await api.patch(`/api/emails/${emailId}`, { is_read: true })
      void refreshAll()
    }
  }, [emailId, refreshAll])

  useEffect(() => {
    setThread(null)
    load().catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [load])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [thread?.length])

  if (error) return <div className="p-6 text-body text-red-400">Could not load email: {error}</div>
  if (!thread) return <SkeletonList rows={4} />

  const opened = thread.find((m) => m.id === emailId) ?? thread[thread.length - 1]
  const last = thread[thread.length - 1]
  const lastIncoming = [...thread].reverse().find((m) => !m.is_mine)

  // the address on the other side of this conversation
  const counterpart = lastIncoming
    ? lastIncoming.from_email
    : last.to_recipients[0]?.email ?? ''
  const counterpartName = lastIncoming
    ? lastIncoming.from_name || lastIncoming.from_email
    : counterpart

  const patch = async (data: Record<string, unknown>, message: string) => {
    try {
      await api.patch(`/api/emails/${opened.id}`, data)
      toast.success(message)
      void refreshAll()
    } catch {
      toast.error('Action failed')
    }
  }

  const sendReply = async () => {
    const body = reply.trim()
    if (!body || !counterpart) return
    setSending(true)
    try {
      await api.post('/api/emails/send', {
        account_id: (lastIncoming ?? opened).account_id,
        to: [counterpart],
        cc: [],
        bcc: [],
        subject: opened.subject.startsWith('Re:') ? opened.subject : `Re: ${opened.subject}`,
        body,
        reply_to_id: lastIncoming?.id ?? opened.id,
      })
      setReply('')
      await load()
      void refreshAll()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Send failed')
    } finally {
      setSending(false)
    }
  }

  const replyQuoted = () => {
    const original = lastIncoming ?? opened
    openCompose({
      accountId: original.account_id,
      to: counterpart,
      subject: opened.subject.startsWith('Re:') ? opened.subject : `Re: ${opened.subject}`,
      bodyHtml: quoteHtml(original),
      replyToId: original.id,
    })
  }

  const forward = () =>
    openCompose({
      accountId: opened.account_id,
      to: '',
      subject: opened.subject.startsWith('Fwd:') ? opened.subject : `Fwd: ${opened.subject}`,
      bodyHtml: `<br><br><div>---------- Forwarded message ----------</div>${quoteHtml(opened)}`,
    })

  const actionBtn =
    'rounded-lg border border-divider px-2.5 py-1 text-caption text-muted transition-colors hover:border-accent hover:text-primary'

  let lastDay = ''

  return (
    <div className="relative flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-divider px-6 py-3">
        <Avatar name={counterpartName} email={counterpart} size={36} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-body font-semibold text-primary">
            {opened.subject || '(no subject)'}
          </div>
          <div className="truncate font-mono text-caption text-muted">
            with {counterpartName} · {thread.length} message{thread.length === 1 ? '' : 's'}
          </div>
        </div>
        <div className="flex shrink-0 gap-1.5">
          <button className={actionBtn} onClick={replyQuoted}>↩ Reply</button>
          <button className={actionBtn} onClick={forward}>↪ Forward</button>
          {opened.folder_role === 'spam' ? (
            <button
              className={actionBtn}
              title="Not spam — train the junk filter and move back to Inbox"
              onClick={async () => {
                try {
                  await api.post(`/api/emails/${opened.id}/not-spam`)
                  toast.success('Marked not spam — moved to Inbox')
                  void refreshAll()
                  closeTab(activeTabId)
                } catch {
                  toast.error('Action failed')
                }
              }}
            >
              ✓ Not spam
            </button>
          ) : (
            <button
              className={actionBtn}
              title="Mark as spam — trains the junk filter"
              onClick={async () => {
                try {
                  await api.post(`/api/emails/${opened.id}/spam`)
                  toast.success('Marked as spam')
                  void refreshAll()
                  closeTab(activeTabId)
                } catch {
                  toast.error('Action failed')
                }
              }}
            >
              🚫 Spam
            </button>
          )}
          <button className={actionBtn} onClick={() => patch({ folder_role: 'archive' }, 'Archived')}>
            🗄
          </button>
          <button
            className={actionBtn}
            onClick={async () => {
              await patch({ folder_role: 'trash' }, 'Moved to trash')
              closeTab(activeTabId)
            }}
          >
            🗑
          </button>
          <button
            className={actionBtn}
            onClick={() => patch({ is_starred: !opened.is_starred }, opened.is_starred ? 'Unstarred' : 'Starred')}
          >
            {opened.is_starred ? '★' : '☆'}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {thread.map((m) => {
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
              <Bubble message={m} />
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {counterpart && (
        <div className="flex items-end gap-2 border-t border-divider px-4 py-3">
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void sendReply()
              }
            }}
            rows={Math.min(5, Math.max(1, reply.split('\n').length))}
            placeholder={`Reply to ${counterpartName}…  (Enter to send, Shift+Enter for newline)`}
            className="flex-1 resize-none rounded-xl border border-divider bg-app px-3.5 py-2.5 text-body text-primary outline-none placeholder:text-muted focus:border-accent"
          />
          <button
            onClick={() => void sendReply()}
            disabled={sending || !reply.trim()}
            className="btn-primary rounded-xl px-4 py-2.5"
          >
            {sending ? '…' : 'Send ▶'}
          </button>
        </div>
      )}
    </div>
  )
}
