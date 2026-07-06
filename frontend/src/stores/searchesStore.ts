import { create } from 'zustand'
import { api } from '../api/client'
import type { SavedSearch } from '../types'

interface SearchesState {
  searches: SavedSearch[]
  fetchSearches: () => Promise<void>
  saveSearch: (name: string, query: string, fileType?: string) => Promise<void>
  deleteSearch: (id: string) => Promise<void>
}

export const useSearchesStore = create<SearchesState>((set, get) => ({
  searches: [],

  fetchSearches: async () => {
    const searches = await api.get<SavedSearch[]>('/api/searches')
    set({ searches })
  },

  saveSearch: async (name, query, fileType) => {
    await api.post('/api/searches', { name, query, file_type: fileType ?? null })
    await get().fetchSearches()
  },

  deleteSearch: async (id) => {
    await api.delete(`/api/searches/${id}`)
    set({ searches: get().searches.filter((s) => s.id !== id) })
  },
}))
