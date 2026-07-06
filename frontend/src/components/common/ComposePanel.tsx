import { useCallback, useEffect, useRef, useState } from 'react'
import { api, getToken } from '../../api/client'
import { formatBytes, textToHtml, truncate } from '../../lib/utils'
import { useAccountsStore } from '../../stores/accountsStore'
import { toast } from '../../stores/toastStore'
import type { AttachmentMeta, ComposeSeed } from '../../types'

export type { ComposeSeed }

interface PendingFile {
  /** Upload id once staged on the server */
  id?: string
  filename: string
  size: number
  uploading: boolean
}

interface DraftSaveOut {
  id: string
  attachments: AttachmentMeta[]
}

const AUTOSAVE_MS = 3000

async function uploadFile(file: File): Promise<{ id: string }> {
  const form = new FormData()
  form.append('file', file)
  const headers: Record<string, string> = {}
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch('/api/emails/uploads', { method: 'POST', body: form, headers })
  if (!res.ok) {
    let detail = res.statusText
    try {
      detail = (await res.json()).detail || detail
    } catch {
      /* not json */
    }
    throw new Error(detail)
  }
  return res.json()
}

function ToolbarButton({
  label,
  title,
  onClick,
  className = '',
}: {
  label: string
  title: string
  onClick: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      title={title}
      // mousedown+preventDefault keeps the editor selection alive
      onMouseDown={(e) => {
        e.preventDefault()
        onClick()
      }}
      className={`flex h-7 min-w-7 items-center justify-center rounded px-1 text-body text-muted transition-colors hover:bg-surface hover:text-primary ${className}`}
    >
      {label}
    </button>
  )
}

export default function ComposePanel({
  seed,
  onClose,
  onSent,
}: {
  seed: ComposeSeed
  onClose: () => void
  onSent?: () => void
}) {
  const accounts = useAccountsStore((s) => s.accounts)
  const [accountId, setAccountId] = useState(seed.accountId ?? accounts[0]?.id ?? '')
  const [to, setTo] = useState(seed.to ?? '')
  const [cc, setCc] = useState(seed.cc ?? '')
  const [bcc, setBcc] = useState(seed.bcc ?? '')
  const [showBcc, setShowBcc] = useState(!!seed.bcc)
  const [subject, setSubject] = useState(seed.subject ?? '')
  const [sending, setSending] = useState(false)
  const [draftId, setDraftId] = useState(seed.draftId)
  const [draftAtts, setDraftAtts] = useState<AttachmentMeta[]>(seed.attachments ?? [])
  const [removedAttIds, setRemovedAttIds] = useState<string[]>([])
  const [pending, setPending] = useState<PendingFile[]>([])
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [dirty, setDirty] = useState(0)

  const editorRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const closingRef = useRef(false)

  // seed the editor once: explicit html > plain text; a brand-new message
  // gets the sending account's signature appended
  useEffect(() => {
    const el = editorRef.current
    if (!el) return
    let html = seed.bodyHtml ?? (seed.body ? textToHtml(seed.body) : '')
    if (!seed.draftId) {
      const signature = accounts.find((a) => a.id === (seed.accountId ?? accounts[0]?.id))
        ?.signature
      if (signature?.trim()) {
        html += `<br><br><div>-- <br>${textToHtml(signature)}</div>`
      }
    }
    el.innerHTML = html
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const exec = (command: string, value?: string) => {
    editorRef.current?.focus()
    document.execCommand(command, false, value)
    setDirty((d) => d + 1)
  }

  const addLink = () => {
    const url = window.prompt('Link URL (https://…)')
    if (url) exec('createLink', url)
  }

  const parseAddrs = (s: string) =>
    s.split(/[,;]/).map((a) => a.trim()).filter(Boolean)

  const hasContent = () =>
    !!(
      to.trim() ||
      cc.trim() ||
      bcc.trim() ||
      subject.trim() ||
      (editorRef.current?.innerText ?? '').trim() ||
      pending.length ||
      draftAtts.length
    )

  const draftPayload = () => ({
    account_id: accountId,
    to: parseAddrs(to),
    cc: parseAddrs(cc),
    bcc: parseAddrs(bcc),
    subject,
    body: editorRef.current?.innerText ?? '',
    body_html: editorRef.current?.innerHTML ?? '',
    attachment_ids: pending.filter((p) => p.id && !p.uploading).map((p) => p.id!),
    removed_attachment_ids: removedAttIds,
  })

  const saveDraft = useCallback(async (): Promise<string | undefined> => {
    if (!accountId || !hasContent()) return draftId
    const payload = draftPayload()
    const res = draftId
      ? await api.put<DraftSaveOut>(`/api/drafts/${draftId}`, payload)
      : await api.post<DraftSaveOut>('/api/drafts', payload)
    setDraftId(res.id)
    setDraftAtts(res.attachments)
    setPending((p) => p.filter((f) => f.uploading)) // staged uploads are now draft attachments
    setRemovedAttIds([])
    setSavedAt(new Date())
    return res.id
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, draftId, to, cc, bcc, subject, dirty, pending, removedAttIds])

  // autosave while typing
  useEffect(() => {
    if (!hasContent()) return
    const t = setTimeout(() => {
      if (!closingRef.current && !sending) void saveDraft().catch(() => undefined)
    }, AUTOSAVE_MS)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to, cc, bcc, subject, dirty, pending, removedAttIds, accountId])

  const pickFiles = () => fileRef.current?.click()

  const onFiles = async (files: FileList | null) => {
    if (!files) return
    for (const file of Array.from(files)) {
      if (file.size > 25 * 1024 * 1024) {
        toast.error(`${truncate(file.name, 30)} is over the 25 MB limit`)
        continue
      }
      const entry: PendingFile = { filename: file.name, size: file.size, uploading: true }
      setPending((p) => [...p, entry])
      try {
        const res = await uploadFile(file)
        setPending((p) =>
          p.map((f) => (f === entry ? { ...f, id: res.id, uploading: false } : f)),
        )
      } catch (e) {
        setPending((p) => p.filter((f) => f !== entry))
        toast.error(e instanceof Error ? e.message : 'Upload failed')
      }
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  const removePending = async (f: PendingFile) => {
    setPending((p) => p.filter((x) => x !== f))
    if (f.id) {
      try {
        await api.delete(`/api/emails/uploads/${f.id}`)
      } catch {
        /* swept server-side later */
      }
    }
  }

  const removeDraftAtt = (att: AttachmentMeta) => {
    setDraftAtts((p) => p.filter((a) => a.id !== att.id))
    setRemovedAttIds((p) => [...p, att.id])
  }

  const send = async () => {
    if (!accountId) {
      toast.error('Pick an account to send from')
      return
    }
    if (pending.some((p) => p.uploading)) {
      toast.error('Wait for attachments to finish uploading')
      return
    }
    setSending(true)
    closingRef.current = true
    try {
      // persist attachment adds/removals on the draft first, then send it
      let effectiveDraft = draftId
      if (draftId) effectiveDraft = await saveDraft()
      await api.post('/api/emails/send', {
        account_id: accountId,
        to: parseAddrs(to),
        cc: parseAddrs(cc),
        bcc: parseAddrs(bcc),
        subject,
        body: editorRef.current?.innerText ?? '',
        body_html: editorRef.current?.innerHTML ?? '',
        attachment_ids: effectiveDraft
          ? []
          : pending.filter((p) => p.id).map((p) => p.id!),
        draft_id: effectiveDraft ?? null,
        reply_to_id: seed.replyToId ?? null,
      })
      toast.success('Email sent')
      onSent?.()
      onClose()
    } catch (e) {
      closingRef.current = false
      toast.error(e instanceof Error ? e.message : 'Failed to send')
    } finally {
      setSending(false)
    }
  }

  const discard = async () => {
    closingRef.current = true
    try {
      if (draftId) await api.delete(`/api/drafts/${draftId}`)
      await Promise.all(
        pending.filter((p) => p.id).map((p) => api.delete(`/api/emails/uploads/${p.id}`)),
      )
    } catch {
      /* stale uploads are swept server-side */
    }
    onClose()
  }

  const close = async () => {
    closingRef.current = true
    if (hasContent()) {
      try {
        await saveDraft()
        toast.success('Saved to Drafts')
      } catch {
        toast.error('Could not save draft')
      }
    }
    onClose()
  }

  const input =
    'w-full border-b border-divider bg-transparent px-3 py-2 text-body text-primary outline-none placeholder:text-muted focus:border-accent'

  return (
    <div className="animate-slide-up fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[85dvh] w-full max-w-2xl flex-col rounded-t-xl border border-divider bg-panel shadow-2xl">
      <div className="flex items-center justify-between border-b border-divider px-4 py-2">
        <span className="text-body font-medium text-primary">
          {draftId ? 'Draft' : 'New message'}
          {savedAt && (
            <span className="ml-2 font-mono text-caption text-muted">
              saved {savedAt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </span>
        <button onClick={() => void close()} className="rounded px-2 text-muted hover:text-primary">
          ×
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {accounts.length > 1 && (
          <div className="flex items-center gap-2 border-b border-divider px-3 py-1.5">
            <span className="text-caption text-muted">From</span>
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="flex-1 bg-transparent py-0.5 text-body text-primary outline-none"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.email_address}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="relative">
          <input className={input} placeholder="To" value={to} onChange={(e) => setTo(e.target.value)} />
          {!showBcc && (
            <button
              onClick={() => setShowBcc(true)}
              className="absolute right-3 top-2 text-caption text-muted hover:text-accent"
            >
              Bcc
            </button>
          )}
        </div>
        <input className={input} placeholder="Cc" value={cc} onChange={(e) => setCc(e.target.value)} />
        {showBcc && (
          <input className={input} placeholder="Bcc" value={bcc} onChange={(e) => setBcc(e.target.value)} />
        )}
        <input
          className={input}
          placeholder="Subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />

        <div className="flex items-center gap-0.5 border-b border-divider px-2 py-1">
          <ToolbarButton label="B" title="Bold" onClick={() => exec('bold')} className="font-bold" />
          <ToolbarButton label="I" title="Italic" onClick={() => exec('italic')} className="italic" />
          <ToolbarButton label="U" title="Underline" onClick={() => exec('underline')} className="underline" />
          <span className="mx-1 h-4 w-px bg-divider" />
          <ToolbarButton label="•≡" title="Bulleted list" onClick={() => exec('insertUnorderedList')} />
          <ToolbarButton label="1≡" title="Numbered list" onClick={() => exec('insertOrderedList')} />
          <ToolbarButton label="🔗" title="Insert link" onClick={addLink} />
          <ToolbarButton label="⌫A" title="Clear formatting" onClick={() => exec('removeFormat')} />
          <span className="flex-1" />
          <ToolbarButton label="📎" title="Attach files" onClick={pickFiles} />
        </div>

        <div
          ref={editorRef}
          contentEditable
          onInput={() => setDirty((d) => d + 1)}
          data-placeholder="Write your message…"
          className="min-h-40 w-full px-3 py-2 text-body text-primary outline-none [&_a]:text-accent [&_blockquote]:border-l-2 [&_blockquote]:border-accent [&_blockquote]:pl-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6 empty:before:text-muted empty:before:content-[attr(data-placeholder)]"
        />

        {(draftAtts.length > 0 || pending.length > 0) && (
          <div className="flex flex-wrap gap-1.5 border-t border-divider px-3 py-2">
            {draftAtts.map((att) => (
              <span
                key={att.id}
                className="flex items-center gap-1.5 rounded-lg border border-divider bg-app px-2 py-1 text-caption text-primary"
              >
                📎 {truncate(att.filename, 24)}
                <span className="font-mono text-muted">{formatBytes(att.size_bytes)}</span>
                <button onClick={() => removeDraftAtt(att)} className="text-muted hover:text-red-400">
                  ×
                </button>
              </span>
            ))}
            {pending.map((f, i) => (
              <span
                key={f.id ?? `pending-${i}`}
                className={`flex items-center gap-1.5 rounded-lg border border-divider bg-app px-2 py-1 text-caption text-primary ${
                  f.uploading ? 'opacity-60' : ''
                }`}
              >
                {f.uploading ? '⏳' : '📎'} {truncate(f.filename, 24)}
                <span className="font-mono text-muted">{formatBytes(f.size)}</span>
                {!f.uploading && (
                  <button onClick={() => void removePending(f)} className="text-muted hover:text-red-400">
                    ×
                  </button>
                )}
              </span>
            ))}
          </div>
        )}
      </div>

      <input ref={fileRef} type="file" multiple hidden onChange={(e) => void onFiles(e.target.files)} />

      <div className="flex items-center justify-between gap-2 border-t border-divider px-4 py-2">
        <button
          onClick={() => void discard()}
          className="rounded-lg px-3 py-1.5 text-body text-muted transition-colors hover:text-red-400"
        >
          🗑 Discard
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void saveDraft().then(() => toast.success('Draft saved')).catch(() => toast.error('Could not save draft'))}
            className="rounded-lg border border-divider px-3 py-1.5 text-body text-muted transition-colors hover:border-accent hover:text-primary"
          >
            Save draft
          </button>
          <button
            onClick={() => void send()}
            disabled={sending || !to.trim()}
            className="btn-primary px-4 py-1.5"
          >
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  )
}
