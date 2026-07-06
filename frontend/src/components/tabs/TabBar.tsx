import { useRef } from 'react'
import { useTabsStore } from '../../stores/tabsStore'
import { truncate } from '../../lib/utils'
import ProviderIcon from '../common/ProviderIcon'
import type { Tab } from '../../types'

function TabIcon({ tab }: { tab: Tab }) {
  if (tab.kind === 'home') return <span className="text-[13px]">🏠</span>
  if (tab.kind === 'contact') return <span className="text-[13px]">👤</span>
  if (tab.kind === 'email') return <span className="text-[13px]">✉️</span>
  if (tab.kind === 'settings') return <span className="text-[13px]">⚙</span>
  if (tab.kind === 'calendar') return <span className="text-[13px]">📅</span>
  if (tab.provider) return <ProviderIcon provider={tab.provider} size={14} />
  return <span className="text-[13px]">📁</span>
}

export default function TabBar() {
  const { tabs, activeTabId, focusTab, closeTab, reorderTabs } = useTabsStore()
  const dragIndex = useRef<number | null>(null)

  return (
    <div className="flex h-10 items-end gap-1 overflow-x-auto bg-tabbar px-2 pt-1.5">
      {tabs.map((tab, i) => {
        const isActive = tab.id === activeTabId
        return (
          <div
            key={tab.id}
            draggable
            onDragStart={() => (dragIndex.current = i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragIndex.current !== null && dragIndex.current !== i) {
                reorderTabs(dragIndex.current, i)
              }
              dragIndex.current = null
            }}
            onClick={() => focusTab(tab.id)}
            className={`group flex h-[34px] min-w-0 max-w-[200px] shrink-0 cursor-pointer items-center gap-2 rounded-t-lg border-x border-t px-3 text-body transition-colors ${
              isActive
                ? 'border-divider bg-tabactive text-primary shadow-[inset_0_2px_0_0_#5b8cff]'
                : 'border-transparent bg-transparent text-muted hover:bg-surface/50 hover:text-primary'
            }`}
            title={tab.title}
          >
            <TabIcon tab={tab} />
            <span className="min-w-0 truncate">{truncate(tab.title, 30)}</span>
            {tab.id !== 'tab-home' && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  closeTab(tab.id)
                }}
                className="ml-auto rounded px-1 text-muted transition-colors hover:bg-divider hover:text-primary"
              >
                ×
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
