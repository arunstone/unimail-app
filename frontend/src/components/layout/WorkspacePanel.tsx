import { useRef, useState } from 'react'
import { truncate } from '../../lib/utils'
import { useLabelsStore } from '../../stores/labelsStore'
import { useTabsStore } from '../../stores/tabsStore'
import { toast } from '../../stores/toastStore'
import Avatar from '../common/Avatar'
import { EMAIL_DRAG_TYPE } from '../views/EmailRowItem'
import type { EmailRow } from '../../types'

/** The "lego" panel: drop search results here, arrange them, save as a label. */
export default function WorkspacePanel() {
  const {
    draft, labels, closeWorkspace, addToDraft, removeFromDraft,
    reorderDraft, clearDraft, saveDraft,
  } = useLabelsStore()
  const openTab = useTabsStore((s) => s.openTab)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const dragIndex = useRef<number | null>(null)

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const raw = e.dataTransfer.getData(EMAIL_DRAG_TYPE)
    if (!raw) return
    try {
      addToDraft(JSON.parse(raw) as EmailRow)
    } catch {
      /* not an email row */
    }
  }

  const save = async () => {
    const n = name.trim()
    if (!n) {
      toast.error('Give the label a name first')
      return
    }
    if (draft.length === 0) {
      toast.error('Drag some emails in first')
      return
    }
    setBusy(true)
    try {
      const label = await saveDraft(n)
      setName('')
      toast.success(`Label “${label.name}” saved`)
      openTab({
        kind: 'label',
        key: `label:${label.id}`,
        title: label.name,
        location: { view: 'label', labelId: label.id, name: label.name },
      })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save label')
    } finally {
      setBusy(false)
    }
  }

  const openLabel = (id: string, labelName: string) =>
    openTab({
      kind: 'label',
      key: `label:${id}`,
      title: labelName,
      location: { view: 'label', labelId: id, name: labelName },
    })

  return (
    <aside className="flex h-full w-full flex-col border-l border-divider bg-panel">
      <div className="flex items-center justify-between border-b border-divider p-3">
        <h2 className="text-subhead font-semibold text-primary">🧱 Workspace</h2>
        <button
          onClick={closeWorkspace}
          className="rounded px-1.5 text-muted transition-colors hover:bg-divider hover:text-primary"
          title="Close workspace"
        >
          ×
        </button>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`m-3 flex-1 overflow-y-auto rounded-xl border-2 border-dashed p-2 transition-colors ${
          dragOver ? 'border-accent bg-accent/5' : 'border-divider'
        }`}
      >
        {draft.length === 0 ? (
          <div className="flex h-full items-center justify-center px-4 text-center text-caption text-muted">
            Drag emails from the search results here to build a thread
          </div>
        ) : (
          draft.map((email, i) => (
            <div
              key={email.id}
              draggable
              onDragStart={() => (dragIndex.current = i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.stopPropagation()
                setDragOver(false)
                if (dragIndex.current !== null && dragIndex.current !== i) {
                  reorderDraft(dragIndex.current, i)
                }
                dragIndex.current = null
              }}
              className="group mb-1.5 flex cursor-grab items-center gap-2 rounded-lg border border-divider bg-surface px-2 py-1.5 active:cursor-grabbing"
            >
              <Avatar name={email.from_name} email={email.from_email} size={22} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-caption font-medium text-primary">
                  {truncate(email.subject || '(no subject)', 34)}
                </span>
                <span className="block truncate text-caption text-muted">
                  {email.from_name || email.from_email}
                </span>
              </span>
              <button
                onClick={() => removeFromDraft(email.id)}
                className="rounded px-1 text-muted opacity-0 transition-opacity hover:bg-divider hover:text-primary group-hover:opacity-100"
                title="Remove"
              >
                ×
              </button>
            </div>
          ))
        )}
      </div>

      <div className="border-t border-divider p-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void save()}
          placeholder="Label name (e.g. VPS project)"
          className="mb-2 w-full rounded-md border border-divider bg-app px-3 py-1.5 text-body text-primary outline-none placeholder:text-muted focus:border-accent"
        />
        <div className="flex gap-2">
          <button
            onClick={() => void save()}
            disabled={busy}
            className="btn-primary flex-1 py-1.5"
          >
            {busy ? 'Saving…' : `💾 Save label (${draft.length})`}
          </button>
          {draft.length > 0 && (
            <button
              onClick={clearDraft}
              className="rounded-lg border border-divider px-3 py-1.5 text-body text-muted transition-colors hover:border-accent hover:text-primary"
              title="Clear"
            >
              🧹
            </button>
          )}
        </div>
      </div>

      {labels.length > 0 && (
        <div className="max-h-44 overflow-y-auto border-t border-divider p-3">
          <div className="mb-1.5 text-caption font-bold text-muted">SAVED LABELS</div>
          {labels.map((l) => (
            <button
              key={l.id}
              onClick={() => openLabel(l.id, l.name)}
              className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-caption text-primary transition-colors hover:bg-surface"
            >
              🏷 <span className="min-w-0 flex-1 truncate">{l.name}</span>
              <span className="font-mono text-muted">{l.email_count}</span>
            </button>
          ))}
        </div>
      )}
    </aside>
  )
}
