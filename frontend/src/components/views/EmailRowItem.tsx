import { api } from '../../api/client'
import { relativeTime } from '../../lib/utils'
import { useAccountsStore } from '../../stores/accountsStore'
import { useLabelsStore } from '../../stores/labelsStore'
import { toast } from '../../stores/toastStore'
import Avatar from '../common/Avatar'
import ProviderIcon from '../common/ProviderIcon'
import type { EmailRow } from '../../types'

/** MIME type used when dragging an email row into the labels workspace. */
export const EMAIL_DRAG_TYPE = 'application/x-unimail-email'

export default function EmailRowItem({
  email,
  onOpen,
  onStarChange,
  showAccount = false,
  draggable = false,
}: {
  email: EmailRow
  onOpen: (email: EmailRow) => void
  onStarChange: (id: string, starred: boolean) => void
  /** show which of the user's accounts this email belongs to (merged lists) */
  showAccount?: boolean
  /** allow dragging into the labels workspace panel */
  draggable?: boolean
}) {
  const accounts = useAccountsStore((s) => s.accounts)
  const account = showAccount ? accounts.find((a) => a.id === email.account_id) : undefined
  const workspaceOpen = useLabelsStore((s) => s.workspaceOpen)
  const addToDraft = useLabelsStore((s) => s.addToDraft)
  const inDraft = useLabelsStore((s) => s.draft.some((d) => d.id === email.id))

  const addToWorkspace = (e: React.MouseEvent) => {
    e.stopPropagation()
    addToDraft(email)
  }

  const toggleStar = async (e: React.MouseEvent) => {
    e.stopPropagation()
    const next = !email.is_starred
    onStarChange(email.id, next)
    try {
      await api.patch(`/api/emails/${email.id}`, { is_starred: next })
    } catch {
      onStarChange(email.id, !next)
      toast.error('Could not update star')
    }
  }

  return (
    <button
      onClick={() => onOpen(email)}
      draggable={draggable}
      onDragStart={
        draggable
          ? (e) => e.dataTransfer.setData(EMAIL_DRAG_TYPE, JSON.stringify(email))
          : undefined
      }
      className={`group relative flex w-full items-center gap-3 border-b border-divider px-4 py-3 text-left transition-colors hover:bg-surface ${
        email.is_read ? '' : 'bg-accent/[0.07]'
      } ${draggable ? 'cursor-grab active:cursor-grabbing' : ''}`}
    >
      {!email.is_read && (
        <>
          <span className="absolute inset-y-0 left-0 w-[3px] bg-accent-gradient" />
          <span className="absolute left-1.5 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-accent" />
        </>
      )}
      <Avatar name={email.from_name} email={email.from_email} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span
            className={`truncate text-body ${
              email.is_read ? 'text-muted' : 'font-semibold text-primary'
            }`}
          >
            {email.from_name || email.from_email}
          </span>
          <span className="flex shrink-0 items-center gap-1.5 font-mono text-caption text-muted">
            {account && (
              <span title={account.email_address} className="flex items-center">
                <ProviderIcon provider={account.provider} size={13} />
              </span>
            )}
            {relativeTime(email.received_at)}
          </span>
        </div>
        <div
          className={`truncate text-body ${
            email.is_read ? 'text-muted' : 'text-primary'
          }`}
        >
          {email.subject || '(no subject)'}
        </div>
        <div className="truncate text-caption text-muted">
          {email.has_attachments && <span className="mr-1">📎</span>}
          {email.preview}
        </div>
      </div>
      {draggable && workspaceOpen && (
        <span
          onClick={inDraft ? undefined : addToWorkspace}
          title={inDraft ? 'Already in workspace' : 'Add to workspace (or drag)'}
          className={`flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full border text-caption transition-colors ${
            inDraft
              ? 'border-accent bg-accent/20 text-accent'
              : 'border-divider text-muted hover:border-accent hover:text-accent'
          }`}
        >
          {inDraft ? '✓' : '＋'}
        </span>
      )}
      <span
        onClick={toggleStar}
        className={`shrink-0 cursor-pointer text-subhead transition-[transform,opacity] hover:scale-125 ${
          email.is_starred
            ? ''
            : 'opacity-25 grayscale lg:opacity-0 lg:group-hover:opacity-40'
        }`}
        title={email.is_starred ? 'Unstar' : 'Star'}
      >
        ⭐
      </span>
    </button>
  )
}
