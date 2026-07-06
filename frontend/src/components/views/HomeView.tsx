import { FOLDER_ICONS, FOLDER_LABELS } from '../../lib/utils'
import { useAccountsStore } from '../../stores/accountsStore'
import { useTabsStore } from '../../stores/tabsStore'
import { SkeletonCard } from '../common/Skeleton'
import EmptyState from '../common/EmptyState'
import type { FolderRole } from '../../types'

const FOLDERS: FolderRole[] = ['inbox', 'sent', 'drafts', 'starred', 'spam', 'trash']

/** Thin circular progress ring showing the read ratio of a folder. */
function ProgressRing({ unread, total }: { unread: number; total: number }) {
  const size = 116
  const stroke = 3
  const r = (size - stroke) / 2
  const circumference = 2 * Math.PI * r
  const readRatio = total > 0 ? (total - unread) / total : 1
  return (
    <svg width={size} height={size} className="absolute inset-0 m-auto -rotate-90">
      <defs>
        <linearGradient id="ring-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#5b8cff" />
          <stop offset="100%" stopColor="#8b5cf6" />
        </linearGradient>
      </defs>
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke="#262b3f" strokeWidth={stroke}
      />
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke="url(#ring-gradient)" strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - readRatio)}
        className="transition-all duration-700"
      />
    </svg>
  )
}

export default function HomeView() {
  const { summary, accounts, loaded } = useAccountsStore()
  const navigate = useTabsStore((s) => s.navigate)

  if (!loaded || (!summary && accounts.length > 0)) {
    return (
      <div className="grid grid-cols-2 gap-4 p-6 lg:grid-cols-3">
        {FOLDERS.map((f) => (
          <SkeletonCard key={f} />
        ))}
      </div>
    )
  }

  if (accounts.length === 0) {
    return (
      <EmptyState
        icon="📬"
        title="Connect an account to get started"
        hint="Use the + Add Account button in the left panel to link Gmail, Outlook, Yahoo or any IMAP mailbox."
      />
    )
  }

  const counts = Object.fromEntries(
    (summary?.consolidated ?? []).map((c) => [c.folder, c]),
  )

  return (
    <div className="p-6">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-head font-semibold text-primary">All mail</h2>
        <button
          onClick={() => navigate({ view: 'graph' })}
          className="rounded-lg border border-divider px-3 py-1.5 text-body text-muted transition-colors hover:border-accent hover:text-primary"
        >
          🕸 Graph view
        </button>
      </div>
      <p className="mb-6 text-body text-muted">
        Consolidated view across {accounts.length} account{accounts.length === 1 ? '' : 's'}
      </p>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {FOLDERS.map((folder) => {
          const c = counts[folder] ?? { unread: 0, total: 0 }
          return (
            <button
              key={folder}
              onClick={() => navigate({ view: 'breakdown', folder })}
              className="group relative flex flex-col items-center gap-1 rounded-xl border border-divider bg-surface px-4 py-6 shadow-card transition-[border-color,transform,box-shadow] duration-150 hover:-translate-y-0.5 hover:border-accent hover:shadow-glow"
            >
              <div className="relative flex h-[116px] w-[116px] items-center justify-center">
                <ProgressRing unread={c.unread} total={c.total} />
                <div className="flex flex-col items-center">
                  <span className="text-[28px] font-bold leading-none text-primary">
                    {c.unread}
                  </span>
                  <span className="mt-1 text-caption text-muted">unread</span>
                </div>
              </div>
              <div className="mt-2 flex items-center gap-1.5 text-subhead font-medium text-primary">
                <span>{FOLDER_ICONS[folder]}</span>
                {FOLDER_LABELS[folder]}
              </div>
              <div className="text-caption text-muted">
                across {accounts.length} account{accounts.length === 1 ? '' : 's'}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
