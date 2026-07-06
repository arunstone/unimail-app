import { create } from 'zustand'
import { api } from '../api/client'
import type { EmailRow, Label } from '../types'

interface LabelsState {
  labels: Label[]
  /** the "lego" workspace panel shown right of the middle panel */
  workspaceOpen: boolean
  draft: EmailRow[]
  fetchLabels: () => Promise<void>
  openWorkspace: () => void
  closeWorkspace: () => void
  addToDraft: (email: EmailRow) => void
  removeFromDraft: (id: string) => void
  reorderDraft: (fromIndex: number, toIndex: number) => void
  clearDraft: () => void
  saveDraft: (name: string) => Promise<Label>
  deleteLabel: (id: string) => Promise<void>
  removeEmailFromLabel: (labelId: string, emailId: string) => Promise<void>
}

export const useLabelsStore = create<LabelsState>((set, get) => ({
  labels: [],
  workspaceOpen: false,
  draft: [],

  fetchLabels: async () => {
    const labels = await api.get<Label[]>('/api/labels')
    set({ labels })
  },

  openWorkspace: () => set({ workspaceOpen: true }),
  closeWorkspace: () => set({ workspaceOpen: false }),

  addToDraft: (email) => {
    const { draft } = get()
    if (draft.some((e) => e.id === email.id)) return
    set({ draft: [...draft, email] })
  },

  removeFromDraft: (id) => set({ draft: get().draft.filter((e) => e.id !== id) }),

  reorderDraft: (fromIndex, toIndex) => {
    const draft = [...get().draft]
    const [moved] = draft.splice(fromIndex, 1)
    draft.splice(toIndex, 0, moved)
    set({ draft })
  },

  clearDraft: () => set({ draft: [] }),

  saveDraft: async (name) => {
    const { draft } = get()
    const label = await api.post<Label>('/api/labels', {
      name,
      email_ids: draft.map((e) => e.id),
    })
    set({ draft: [] })
    await get().fetchLabels()
    return label
  },

  deleteLabel: async (id) => {
    await api.delete(`/api/labels/${id}`)
    set({ labels: get().labels.filter((l) => l.id !== id) })
  },

  removeEmailFromLabel: async (labelId, emailId) => {
    await api.delete(`/api/labels/${labelId}/emails/${emailId}`)
    await get().fetchLabels()
  },
}))
