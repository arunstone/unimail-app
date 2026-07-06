import { useState } from 'react'
import { PROVIDER_COLORS } from '../../lib/utils'
import { useAccountsStore } from '../../stores/accountsStore'
import { useAuthStore } from '../../stores/authStore'
import { useLabelsStore } from '../../stores/labelsStore'
import { useSearchesStore } from '../../stores/searchesStore'
import { useTabsStore } from '../../stores/tabsStore'
import { useUiStore } from '../../stores/uiStore'
import { toast } from '../../stores/toastStore'
import ProviderIcon from '../common/ProviderIcon'
import { Wordmark } from '../common/ui'
import AddAccountModal from './AddAccountModal'
import type { FileType } from '../../types'

export default function LeftPanel() {
  const { accounts } = useAccountsStore()
  const { labels, openWorkspace } = useLabelsStore()
  const { searches, deleteSearch } = useSearchesStore()
  const { openTab, activeTab, navigate } = useTabsStore()
  const logout = useAuthStore((s) => s.logout)
  const openCompose = useUiStore((s) => s.openCompose)
  const [showAdd, setShowAdd] = useState(false)
  const active = activeTab()

  const compose = () => {
    if (accounts.length === 0) {
      toast.error('Connect an email account first')
      return
    }
    openCompose({})
  }

  return (
    <aside className="flex h-full w-full flex-col bg-panel">
      <div className="border-b border-divider px-4 py-3">
        <div className="flex items-start justify-between">
          <h1 className="flex items-center gap-2 text-head">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-accent-gradient text-caption">
              ✉
            </span>
            <Wordmark className="text-head" />
          </h1>
          <div className="flex items-center">
            <button
              onClick={() =>
                openTab({
                  kind: 'calendar',
                  key: 'calendar',
                  title: 'Calendar',
                  location: { view: 'calendar' },
                })
              }
              title="Calendar"
              className="rounded p-1 text-subhead text-muted transition-colors hover:bg-surface hover:text-primary"
            >
              📅
            </button>
            <button
              onClick={() =>
                openTab({
                  kind: 'settings',
                  key: 'settings',
                  title: 'Settings',
                  location: { view: 'settings' },
                })
              }
              title="Settings"
              className="rounded p-1 text-subhead text-muted transition-colors hover:bg-surface hover:text-primary"
            >
              ⚙
            </button>
          </div>
        </div>
        <div className="text-caption text-muted">All your email in one place</div>
        <button onClick={compose} className="btn-primary mt-3 w-full py-2 text-body">
          ✏️ Compose
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        {accounts.length > 0 && (
          <div className="px-4 pb-1 pt-2 text-caption font-bold uppercase tracking-widest text-muted">
            Accounts
          </div>
        )}
        {accounts.length === 0 && (
          <div className="px-4 py-6 text-body text-muted">
            No accounts connected yet. Add one below to get started.
          </div>
        )}
        {accounts.map((account) => {
          const isActive = active.key === `account:${account.id}`
          return (
            <button
              key={account.id}
              onClick={() =>
                openTab({
                  kind: 'account',
                  key: `account:${account.id}`,
                  title: account.display_name || account.email_address.split('@')[0],
                  provider: account.provider,
                  location: { view: 'folders', accountId: account.id },
                })
              }
              className={`group relative mx-2 flex w-[calc(100%-1rem)] items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors hover:bg-surface ${
                isActive ? 'bg-surface shadow-card' : ''
              }`}
              style={
                isActive
                  ? { boxShadow: `inset 3px 0 0 ${PROVIDER_COLORS[account.provider]}` }
                  : undefined
              }
            >
              <ProviderIcon provider={account.provider} size={24} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-body font-medium text-primary">
                  {account.email_address}
                </div>
                <div className="text-caption text-muted">
                  {account.sync_status === 'syncing'
                    ? 'Syncing…'
                    : account.sync_status === 'error'
                      ? 'Sync error'
                      : account.provider}
                </div>
              </div>
              {account.unread_count > 0 && (
                <span
                  className="flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-caption font-bold text-white"
                  style={{ backgroundColor: PROVIDER_COLORS[account.provider] }}
                >
                  {account.unread_count > 99 ? '99+' : account.unread_count}
                </span>
              )}
            </button>
          )
        })}

        {searches.length > 0 && (
          <div className="mt-3 border-t border-divider pt-2">
            <div className="px-4 py-1 text-caption font-bold uppercase tracking-widest text-muted">
              Saved searches
            </div>
            {searches.map((saved) => (
              <div key={saved.id} className="group relative">
                <button
                  onClick={() =>
                    navigate({
                      view: 'search',
                      query: saved.query,
                      fileType: (saved.file_type as FileType | null) ?? undefined,
                    })
                  }
                  className="mx-2 flex w-[calc(100%-1rem)] items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors hover:bg-surface"
                >
                  🔍
                  <span className="min-w-0 flex-1 truncate text-body text-primary">
                    {saved.name}
                  </span>
                  <span className="font-mono text-caption text-muted group-hover:opacity-0">
                    {saved.count > 99 ? '99+' : saved.count}
                  </span>
                </button>
                <button
                  onClick={() => {
                    void deleteSearch(saved.id).then(
                      () => toast.success('Saved search removed'),
                      () => toast.error('Could not remove saved search'),
                    )
                  }}
                  title="Delete saved search"
                  className="absolute right-4 top-1/2 -translate-y-1/2 rounded px-1 text-caption text-muted opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {labels.length > 0 && (
          <div className="mt-3 border-t border-divider pt-2">
            <div className="flex items-center justify-between px-4 py-1">
              <span className="text-caption font-bold uppercase tracking-widest text-muted">Labels</span>
              <button
                onClick={openWorkspace}
                title="Open workspace panel"
                className="rounded px-1 text-caption text-muted transition-colors hover:bg-surface hover:text-primary"
              >
                🧱
              </button>
            </div>
            {labels.map((label) => {
              const isActive = active.key === `label:${label.id}`
              return (
                <button
                  key={label.id}
                  onClick={() =>
                    openTab({
                      kind: 'label',
                      key: `label:${label.id}`,
                      title: label.name,
                      location: { view: 'label', labelId: label.id, name: label.name },
                    })
                  }
                  className={`mx-2 flex w-[calc(100%-1rem)] items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors hover:bg-surface ${
                    isActive ? 'bg-surface shadow-card' : ''
                  }`}
                >
                  🏷
                  <span className="min-w-0 flex-1 truncate text-body text-primary">
                    {label.name}
                  </span>
                  <span className="font-mono text-caption text-muted">{label.email_count}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2 border-t border-divider p-3">
        <button
          onClick={() => setShowAdd(true)}
          className="w-full rounded-lg border border-dashed border-divider py-2.5 text-body font-medium text-muted transition-colors hover:border-accent hover:text-accent"
        >
          + Add Account
        </button>
        <button
          onClick={logout}
          className="w-full rounded-lg py-2 text-body font-medium text-muted transition-colors hover:bg-surface hover:text-red-400"
        >
          ⎋ Log out
        </button>
      </div>

      {showAdd && <AddAccountModal onClose={() => setShowAdd(false)} />}
    </aside>
  )
}
