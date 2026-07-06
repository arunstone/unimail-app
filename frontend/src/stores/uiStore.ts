import { create } from 'zustand'
import type { ComposeSeed } from '../types'

/** Mobile-only drawer state (left panel / contacts) plus the global compose
 *  panel. Drawers are irrelevant on lg+ screens where both panels are
 *  always visible. */
interface UiState {
  leftDrawerOpen: boolean
  rightDrawerOpen: boolean
  composeSeed: ComposeSeed | null
  toggleLeftDrawer: () => void
  toggleRightDrawer: () => void
  closeDrawers: () => void
  openCompose: (seed: ComposeSeed) => void
  closeCompose: () => void
}

export const useUiStore = create<UiState>((set) => ({
  leftDrawerOpen: false,
  rightDrawerOpen: false,
  composeSeed: null,
  toggleLeftDrawer: () =>
    set((s) => ({ leftDrawerOpen: !s.leftDrawerOpen, rightDrawerOpen: false })),
  toggleRightDrawer: () =>
    set((s) => ({ rightDrawerOpen: !s.rightDrawerOpen, leftDrawerOpen: false })),
  closeDrawers: () => set({ leftDrawerOpen: false, rightDrawerOpen: false }),
  openCompose: (seed) => set({ composeSeed: seed, leftDrawerOpen: false }),
  closeCompose: () => set({ composeSeed: null }),
}))
