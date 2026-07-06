import { FOLDER_ICONS, FOLDER_LABELS } from '../../lib/utils'
import { useAccountsStore } from '../../stores/accountsStore'
import { useTabsStore } from '../../stores/tabsStore'
import ProviderIcon from '../common/ProviderIcon'
import type { FolderRole } from '../../types'

const FOLDERS: FolderRole[] = ['inbox', 'sent', 'drafts', 'starred', 'spam', 'trash']

export default function FolderView({ accountId }: { accountId: string }) {
  const { accounts, summary } = useAccountsStore()
  const navigate = useTabsStore((s) => s.navigate)
  const account = accounts.find((a) => a.id === accountId)
  const accSummary = summary?.accounts.find((a) => a.account_id === accountId)
  const counts = Object.fromEntries((accSummary?.folders ?? []).map((c) => [c.folder, c]))

  if (!account) {
    return <div className="p-6 text-body text-muted">This account is no longer connected.</div>
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center gap-3">
        <ProviderIcon provider={account.provider} size={32} />
        <div>
          <h2 className="text-head font-semibold text-primary">{account.email_address}</h2>
          <div className="font-mono text-caption text-muted">
            {account.last_synced_at
              ? `Last synced ${new Date(account.last_synced_at).toLocaleString()}`
              : 'Not synced yet'}
            {account.sync_status === 'error' && (
              <span className="ml-2 text-red-400">sync error</span>
            )}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {FOLDERS.map((folder) => {
          const c = counts[folder] ?? { unread: 0, total: 0 }
          return (
            <button
              key={folder}
              onClick={() => navigate({ view: 'list', accountId, folder })}
              className="flex items-center gap-3 rounded-xl border border-divider bg-surface px-4 py-4 text-left shadow-card transition-[border-color,transform] duration-150 hover:-translate-y-0.5 hover:border-accent"
            >
              <span className="text-head">{FOLDER_ICONS[folder]}</span>
              <span className="flex-1">
                <span className="block text-body font-medium text-primary">
                  {FOLDER_LABELS[folder]}
                </span>
                <span className="block text-caption text-muted">{c.total} messages</span>
              </span>
              {c.unread > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-caption font-bold text-white">
                  {c.unread > 99 ? '99+' : c.unread}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
