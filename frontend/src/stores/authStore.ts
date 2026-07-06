import { create } from 'zustand'
import { api, getToken, setToken } from '../api/client'
import type { User } from '../types'

interface AuthState {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (name: string, email: string, password: string) => Promise<{ is_verified: boolean }>
  logout: () => void
  loadMe: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: !!getToken(),

  login: async (email, password) => {
    const res = await api.post<{ access_token: string }>('/api/auth/login', {
      email,
      password,
    })
    setToken(res.access_token)
    const user = await api.get<User>('/api/auth/me')
    set({ user })
  },

  register: async (name, email, password) => {
    return api.post<{ is_verified: boolean }>('/api/auth/register', { name, email, password })
  },

  logout: () => {
    setToken(null)
    set({ user: null })
    window.location.href = '/login'
  },

  loadMe: async () => {
    if (!getToken()) {
      set({ loading: false })
      return
    }
    try {
      const user = await api.get<User>('/api/auth/me')
      set({ user, loading: false })
    } catch {
      set({ user: null, loading: false })
    }
  },
}))
