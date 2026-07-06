import { useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import ComposePanel from '../components/common/ComposePanel'
import LeftPanel from '../components/layout/LeftPanel'
import MiddlePanel from '../components/layout/MiddlePanel'
import RightPanel from '../components/layout/RightPanel'
import WorkspacePanel from '../components/layout/WorkspacePanel'
import { useNewMailNotifications, useTitleBadge } from '../lib/notifications'
import { useAccountsStore } from '../stores/accountsStore'
import { useContactsStore } from '../stores/contactsStore'
import { useLabelsStore } from '../stores/labelsStore'
import { useSearchesStore } from '../stores/searchesStore'
import { useTabsStore } from '../stores/tabsStore'
import { useUiStore } from '../stores/uiStore'
import { toast } from '../stores/toastStore'

const SUMMARY_POLL_MS = 30_000

export default function Dashboard() {
  const { refreshAll, fetchSummary, fetchAccounts } = useAccountsStore()
  const fetchContacts = useContactsStore((s) => s.fetchContacts)
  const fetchLabels = useLabelsStore((s) => s.fetchLabels)
  const fetchSearches = useSearchesStore((s) => s.fetchSearches)
  const workspaceOpen = useLabelsStore((s) => s.workspaceOpen)
  const [params, setParams] = useSearchParams()
  const { leftDrawerOpen, rightDrawerOpen, closeDrawers, composeSeed, closeCompose } =
    useUiStore()
  const tabs = useTabsStore((s) => s.tabs)
  const activeTabId = useTabsStore((s) => s.activeTabId)

  useNewMailNotifications()
  useTitleBadge()

  // On mobile, navigating anywhere (new tab, new location) should dismiss
  // whichever drawer the tap came from.
  const firstRender = useRef(true)
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    closeDrawers()
  }, [tabs, activeTabId, closeDrawers])

  // OAuth redirects land back here with ?connected= or ?oauth_error=
  useEffect(() => {
    const connected = params.get('connected')
    const oauthError = params.get('oauth_error')
    if (connected) {
      toast.success(`${connected} connected — first sync running`)
      setParams({}, { replace: true })
    } else if (oauthError) {
      toast.error(`Account connection failed: ${oauthError}`)
      setParams({}, { replace: true })
    }
  }, [params, setParams])

  useEffect(() => {
    void refreshAll()
    void fetchContacts()
    void fetchLabels()
    void fetchSearches()
    const interval = setInterval(() => {
      void fetchSummary()
      void fetchAccounts()
    }, SUMMARY_POLL_MS)
    return () => clearInterval(interval)
  }, [refreshAll, fetchSummary, fetchAccounts, fetchContacts, fetchLabels, fetchSearches])

  return (
    <div
      className={`relative h-dvh w-screen overflow-hidden bg-app lg:grid ${
        workspaceOpen ? 'lg:grid-cols-[20%_40%_20%_20%]' : 'lg:grid-cols-[20%_60%_20%]'
      }`}
    >
      {/* Left panel: slide-in drawer on mobile, first grid column on lg+.
          No transform while open/on desktop — it would trap fixed-position
          modals rendered inside the panel. */}
      <div
        className={`fixed inset-y-0 left-0 z-40 w-72 max-w-[85vw] shadow-xl transition-transform duration-200 lg:static lg:z-auto lg:h-full lg:w-auto lg:max-w-none lg:shadow-none lg:transition-none ${
          leftDrawerOpen ? '' : '-translate-x-full'
        } lg:transform-none`}
      >
        <LeftPanel />
      </div>

      <div className="h-full w-full lg:w-auto">
        <MiddlePanel />
      </div>

      {/* Workspace: full-screen overlay on mobile, grid column on lg+ */}
      {workspaceOpen && (
        <div className="fixed inset-0 z-40 lg:static lg:z-auto lg:h-full">
          <WorkspacePanel />
        </div>
      )}

      {/* Contacts: slide-in drawer on mobile, last grid column on lg+ */}
      <div
        className={`fixed inset-y-0 right-0 z-40 w-72 max-w-[85vw] shadow-xl transition-transform duration-200 lg:static lg:z-auto lg:h-full lg:w-auto lg:max-w-none lg:shadow-none lg:transition-none ${
          rightDrawerOpen ? '' : 'translate-x-full'
        } lg:transform-none`}
      >
        <RightPanel />
      </div>

      {(leftDrawerOpen || rightDrawerOpen) && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={closeDrawers}
        />
      )}

      {composeSeed && (
        <ComposePanel
          key={composeSeed.draftId ?? 'new'}
          seed={composeSeed}
          onClose={closeCompose}
          onSent={() => void refreshAll()}
        />
      )}
    </div>
  )
}
