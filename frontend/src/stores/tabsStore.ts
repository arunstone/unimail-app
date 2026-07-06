import { create } from 'zustand'
import type { BreadcrumbSegment, Provider, Tab, TabKind, TabLocation } from '../types'

let nextId = 1
const tabId = () => `tab-${nextId++}`

const HOME_TAB: Tab = {
  id: 'tab-home',
  kind: 'home',
  key: 'home',
  title: 'Home',
  history: [{ view: 'home' }],
  historyIndex: 0,
}

interface OpenTabInput {
  kind: TabKind
  key: string
  title: string
  location: TabLocation
  provider?: Provider
  crumbPrefix?: BreadcrumbSegment[]
}

interface TabsState {
  tabs: Tab[]
  activeTabId: string
  activeTab: () => Tab
  currentLocation: () => TabLocation
  openTab: (input: OpenTabInput) => void
  closeTab: (id: string) => void
  focusTab: (id: string) => void
  reorderTabs: (fromIndex: number, toIndex: number) => void
  navigate: (loc: TabLocation) => void
  goBack: () => void
  goForward: () => void
  canGoBack: () => boolean
  canGoForward: () => boolean
  updateTitle: (id: string, title: string) => void
  reset: () => void
}

export const useTabsStore = create<TabsState>((set, get) => ({
  tabs: [HOME_TAB],
  activeTabId: HOME_TAB.id,

  activeTab: () => {
    const { tabs, activeTabId } = get()
    return tabs.find((t) => t.id === activeTabId) ?? tabs[0]
  },

  currentLocation: () => {
    const tab = get().activeTab()
    return tab.history[tab.historyIndex]
  },

  openTab: (input) => {
    const { tabs } = get()
    const existing = tabs.find((t) => t.key === input.key)
    if (existing) {
      set({ activeTabId: existing.id })
      return
    }
    const tab: Tab = {
      id: tabId(),
      kind: input.kind,
      key: input.key,
      title: input.title,
      provider: input.provider,
      history: [input.location],
      historyIndex: 0,
      crumbPrefix: input.crumbPrefix,
    }
    set({ tabs: [...tabs, tab], activeTabId: tab.id })
  },

  closeTab: (id) => {
    if (id === HOME_TAB.id) return // home tab cannot be closed
    const { tabs, activeTabId } = get()
    const idx = tabs.findIndex((t) => t.id === id)
    if (idx === -1) return
    const remaining = tabs.filter((t) => t.id !== id)
    let nextActive = activeTabId
    if (activeTabId === id) {
      nextActive = (remaining[idx - 1] ?? remaining[0]).id
    }
    set({ tabs: remaining, activeTabId: nextActive })
  },

  focusTab: (id) => set({ activeTabId: id }),

  reorderTabs: (fromIndex, toIndex) => {
    const tabs = [...get().tabs]
    const [moved] = tabs.splice(fromIndex, 1)
    tabs.splice(toIndex, 0, moved)
    set({ tabs })
  },

  navigate: (loc) => {
    const { tabs, activeTabId } = get()
    set({
      tabs: tabs.map((t) => {
        if (t.id !== activeTabId) return t
        const history = [...t.history.slice(0, t.historyIndex + 1), loc]
        return { ...t, history, historyIndex: history.length - 1 }
      }),
    })
  },

  goBack: () => {
    const { tabs, activeTabId } = get()
    set({
      tabs: tabs.map((t) =>
        t.id === activeTabId && t.historyIndex > 0
          ? { ...t, historyIndex: t.historyIndex - 1 }
          : t,
      ),
    })
  },

  goForward: () => {
    const { tabs, activeTabId } = get()
    set({
      tabs: tabs.map((t) =>
        t.id === activeTabId && t.historyIndex < t.history.length - 1
          ? { ...t, historyIndex: t.historyIndex + 1 }
          : t,
      ),
    })
  },

  canGoBack: () => get().activeTab().historyIndex > 0,
  canGoForward: () => {
    const tab = get().activeTab()
    return tab.historyIndex < tab.history.length - 1
  },

  updateTitle: (id, title) =>
    set({ tabs: get().tabs.map((t) => (t.id === id ? { ...t, title } : t)) }),

  reset: () => set({ tabs: [HOME_TAB], activeTabId: HOME_TAB.id }),
}))
