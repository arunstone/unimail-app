import { useTabsStore } from '../../stores/tabsStore'
import NavBar from '../tabs/NavBar'
import TabBar from '../tabs/TabBar'
import BreakdownView from '../views/BreakdownView'
import ContactView from '../views/ContactView'
import EmailBodyView from '../views/EmailBodyView'
import EmailListView from '../views/EmailListView'
import FolderView from '../views/FolderView'
import GraphView from '../views/GraphView'
import HomeView from '../views/HomeView'
import LabelTimelineView from '../views/LabelTimelineView'
import SearchView from '../views/SearchView'
import CalendarView from '../views/CalendarView'
import SettingsView from '../views/SettingsView'

function CurrentView() {
  const { tabs, activeTabId } = useTabsStore()
  const tab = tabs.find((t) => t.id === activeTabId) ?? tabs[0]
  const loc = tab.history[tab.historyIndex]

  switch (loc.view) {
    case 'home':
      return <HomeView />
    case 'folders':
      return <FolderView accountId={loc.accountId} />
    case 'breakdown':
      return <BreakdownView folder={loc.folder} />
    case 'list':
      return <EmailListView accountId={loc.accountId} folder={loc.folder} viaHome={loc.viaHome} />
    case 'email':
      return <EmailBodyView emailId={loc.emailId} />
    case 'contact':
      return <ContactView contactId={loc.contactId} sub={loc.sub} />
    case 'graph':
      return <GraphView />
    case 'search':
      return <SearchView query={loc.query} fileType={loc.fileType} />
    case 'label':
      return <LabelTimelineView labelId={loc.labelId} />
    case 'settings':
      return <SettingsView />
    case 'calendar':
      return <CalendarView />
  }
}

export default function MiddlePanel() {
  const activeTabId = useTabsStore((s) => s.activeTabId)
  const tabs = useTabsStore((s) => s.tabs)
  const tab = tabs.find((t) => t.id === activeTabId) ?? tabs[0]

  return (
    <main className="flex h-full min-w-0 flex-col bg-middle">
      <TabBar />
      <NavBar />
      <div key={`${tab.id}-${tab.historyIndex}`} className="relative flex-1 overflow-y-auto">
        <CurrentView />
      </div>
    </main>
  )
}
