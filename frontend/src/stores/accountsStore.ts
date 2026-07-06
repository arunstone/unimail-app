import { create } from 'zustand'
import { api } from '../api/client'
import type { Account, Summary } from '../types'

interface AccountsState {
  accounts: Account[]
  summary: Summary | null
  loaded: boolean
  fetchAccounts: () => Promise<void>
  fetchSummary: () => Promise<void>
  refreshAll: () => Promise<void>
  syncAccount: (accountId: string) => Promise<void>
  disconnect: (accountId: string) => Promise<void>
}

export const useAccountsStore = create<AccountsState>((set, get) => ({
  accounts: [],
  summary: null,
  loaded: false,

  fetchAccounts: async () => {
    const accounts = await api.get<Account[]>('/api/accounts')
    set({ accounts, loaded: true })
  },

  fetchSummary: async () => {
    const summary = await api.get<Summary>('/api/emails/summary')
    set({ summary })
  },

  refreshAll: async () => {
    await Promise.all([get().fetchAccounts(), get().fetchSummary()])
  },

  syncAccount: async (accountId) => {
    await api.post(`/api/sync/${accountId}`)
    await get().refreshAll()
  },

  disconnect: async (accountId) => {
    await api.delete(`/api/accounts/${accountId}`)
    await get().refreshAll()
  },
}))
