import { create } from 'zustand'
import { api } from '../api/client'
import type { Contact } from '../types'

interface ContactsState {
  contacts: Contact[]
  search: string
  accountFilter: string | null
  loading: boolean
  setSearch: (s: string) => void
  setAccountFilter: (id: string | null) => void
  fetchContacts: () => Promise<void>
}

export const useContactsStore = create<ContactsState>((set, get) => ({
  contacts: [],
  search: '',
  accountFilter: null,
  loading: false,

  setSearch: (search) => {
    set({ search })
    void get().fetchContacts()
  },

  setAccountFilter: (accountFilter) => {
    set({ accountFilter })
    void get().fetchContacts()
  },

  fetchContacts: async () => {
    const { search, accountFilter } = get()
    set({ loading: true })
    try {
      const params = new URLSearchParams({ limit: '200' })
      if (search) params.set('search', search)
      if (accountFilter) params.set('account_id', accountFilter)
      const contacts = await api.get<Contact[]>(`/api/contacts?${params}`)
      set({ contacts })
    } finally {
      set({ loading: false })
    }
  },
}))
