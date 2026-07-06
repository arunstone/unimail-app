import { useState } from 'react'
import { FOLDER_LABELS, truncate } from '../../lib/utils'
import { useAccountsStore } from '../../stores/accountsStore'
import { useLabelsStore } from '../../stores/labelsStore'
import { useTabsStore } from '../../stores/tabsStore'
import { useUiStore } from '../../stores/uiStore'
import { toast } from '../../stores/toastStore'
import type { BreadcrumbSegment, FolderRole, TabLocation } from '../../types'

function useBreadcrumbs(): BreadcrumbSegment[] {
  const { activeTab, currentLocation } = useTabsStore()
  const accounts = useAccountsStore((s) => s.accounts)
  const tab = activeTab()
  const loc = currentLocation()

  const accountLabel = (id: string) =>
    accounts.find((a) => a.id === id)?.email_address.split('@')[0] ?? 'Account'

  switch (loc.view) {
    case 'home':
      return [{ label: 'Home' }]
    case 'folders':
      return [{ label: accountLabel(loc.accountId) }]
    case 'breakdown':
      return [
        { label: 'Home', loc: { view: 'home' } },
        { label: FOLDER_LABELS[loc.folder] },
      ]
    case 'list': {
      const folderLabel = FOLDER_LABELS[loc.folder as FolderRole] ?? loc.folder
      if (loc.accountId) {
        if (loc.viaHome) {
          return [
            { label: 'Home', loc: { view: 'home' } },
            { label: folderLabel, loc: { view: 'breakdown', folder: loc.folder } },
            { label: accountLabel(loc.accountId) },
          ]
        }
        return [
          { label: accountLabel(loc.accountId), loc: { view: 'folders', accountId: loc.accountId } },
          { label: folderLabel },
        ]
      }
      return [{ label: 'Home', loc: { view: 'home' } }, { label: folderLabel }]
    }
    case 'email':
      return [...(tab.crumbPrefix ?? []), { label: truncate(loc.subject || '(no subject)', 40) }]
    case 'contact':
      return [
        { label: tab.title, loc: { view: 'contact', contactId: loc.contactId, sub: 'all' } },
        { label: loc.sub === 'all' ? 'All' : FOLDER_LABELS[loc.sub as FolderRole] },
      ]
    case 'graph':
      return [{ label: 'Home', loc: { view: 'home' } }, { label: 'Graph' }]
    case 'search':
      return [{ label: 'Home', loc: { view: 'home' } }, { label: `Search “${truncate(loc.query, 30)}”` }]
    case 'label':
      return [{ label: 'Labels' }, { label: truncate(loc.name, 30) }]
    case 'settings':
      return [{ label: 'Settings' }]
    case 'calendar':
      return [{ label: 'Calendar' }]
  }
}

export default function NavBar() {
  const { goBack, goForward, canGoBack, canGoForward, navigate, currentLocation } = useTabsStore()
  const { syncAccount, refreshAll } = useAccountsStore()
  const openWorkspace = useLabelsStore((s) => s.openWorkspace)
  const { toggleLeftDrawer, toggleRightDrawer } = useUiStore()
  const crumbs = useBreadcrumbs()
  const loc = currentLocation()
  const [query, setQuery] = useState('')

  const refresh = async () => {
    const accountId =
      'accountId' in loc && loc.accountId ? loc.accountId : undefined
    try {
      if (accountId) {
        await syncAccount(accountId)
        toast.success('Sync complete')
      } else {
        await refreshAll()
        toast.info('Refreshed')
      }
      // re-trigger the current view by re-navigating to the same location
      navigate({ ...loc } as TabLocation)
    } catch {
      toast.error('Refresh failed')
    }
  }

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault()
    const q = query.trim()
    if (!q) return
    navigate({ view: 'search', query: q })
    openWorkspace()
  }

  const navBtn =
    'flex h-7 w-7 items-center justify-center rounded text-subhead text-muted transition-colors hover:bg-surface hover:text-primary disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted'

  return (
    <div className="flex h-10 items-center gap-1 border-b border-divider bg-middle px-2 lg:px-3">
      <button className={`${navBtn} lg:hidden`} onClick={toggleLeftDrawer} title="Accounts & labels">
        ☰
      </button>
      <button className={navBtn} disabled={!canGoBack()} onClick={goBack} title="Back">
        ←
      </button>
      <button className={navBtn} disabled={!canGoForward()} onClick={goForward} title="Forward">
        →
      </button>
      <button className={navBtn} onClick={refresh} title="Refresh">
        ↻
      </button>
      <div className="ml-2 flex min-w-0 flex-1 items-center gap-1.5 font-mono text-caption text-muted">
        {crumbs.map((c, i) => (
          <span key={i} className="flex min-w-0 items-center gap-1.5">
            {i > 0 && <span className="text-muted">›</span>}
            {c.loc ? (
              <button
                onClick={() => navigate(c.loc!)}
                className="truncate transition-colors hover:text-accent"
              >
                {c.label}
              </button>
            ) : (
              <span className="truncate text-primary">{c.label}</span>
            )}
          </span>
        ))}
      </div>
      <form onSubmit={submitSearch} className="ml-auto shrink-0">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="🔍 Search…"
          className="w-28 rounded-full border border-divider bg-app px-3 py-1 text-caption text-primary outline-none transition-all placeholder:text-muted focus:w-40 focus:border-accent focus:ring-2 focus:ring-accent/25 lg:w-44 lg:focus:w-56"
        />
      </form>
      <button className={`${navBtn} lg:hidden`} onClick={toggleRightDrawer} title="Contacts">
        👤
      </button>
    </div>
  )
}
