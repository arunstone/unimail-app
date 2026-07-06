import { FOLDER_ICONS, FOLDER_LABELS } from '../../lib/utils'
import { useAccountsStore } from '../../stores/accountsStore'
import { useTabsStore } from '../../stores/tabsStore'
import EmptyState from '../common/EmptyState'
import ProviderIcon from '../common/ProviderIcon'
import type { FolderRole } from '../../types'

/** Per-account breakdown for one folder: shown when a folder ring on Home is
 *  clicked, before drilling into a single account's list. */
export default function BreakdownView({ folder }: { folder: FolderRole }) {
  const { summary, accounts } = useAccountsStore()
  const navigate = useTabsStore((s) => s.navigate)

  if (accounts.length === 0) {
    return (
      <EmptyState
        icon="📬"
        title="Connect an account to get started"
        hint="Use the + Add Account button in the left panel to link Gmail, Outlook, Yahoo or any IMAP mailbox."
      />
    )
  }

  const consolidated = summary?.consolidated.find((c) => c.folder === folder)
  const rowClass =
    'flex w-full items-center gap-3 rounded-xl border border-divider bg-surface px-4 py-4 text-left shadow-card transition-[border-color,transform] duration-150 hover:-translate-y-0.5 hover:border-accent'

  return (
    <div className="p-6">
      <h2 className="mb-1 text-head font-semibold text-primary">
        {FOLDER_ICONS[folder]} {FOLDER_LABELS[folder]}
      </h2>
      <p className="mb-6 text-body text-muted">By account — tap one to open its list</p>

      <div className="flex flex-col gap-3">
        <button onClick={() => navigate({ view: 'list', folder })} className={rowClass}>
          <span className="text-head">🗂</span>
          <span className="flex-1">
            <span className="block text-body font-medium text-primary">All accounts</span>
            <span className="block text-caption text-muted">
              {consolidated?.total ?? 0} messages combined
            </span>
          </span>
          {(consolidated?.unread ?? 0) > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-caption font-bold text-white">
              {consolidated!.unread > 99 ? '99+' : consolidated!.unread}
            </span>
          )}
        </button>

        {accounts.map((account) => {
          const accSummary = summary?.accounts.find((a) => a.account_id === account.id)
          const c = accSummary?.folders.find((f) => f.folder === folder)
          return (
            <button
              key={account.id}
              onClick={() =>
                navigate({ view: 'list', accountId: account.id, folder, viaHome: true })
              }
              className={rowClass}
            >
              <ProviderIcon provider={account.provider} size={24} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body font-medium text-primary">
                  {account.display_name || account.email_address.split('@')[0]}
                </span>
                <span className="block truncate font-mono text-caption text-muted">
                  {account.email_address} · {c?.total ?? 0} messages
                </span>
              </span>
              {(c?.unread ?? 0) > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-caption font-bold text-white">
                  {c!.unread > 99 ? '99+' : c!.unread}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
