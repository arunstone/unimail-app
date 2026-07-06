import type { FolderRole, Provider } from '../types'

export const PROVIDER_COLORS: Record<Provider, string> = {
  gmail: '#EA4335',
  yahoo: '#6001D2',
  outlook: '#0078D4',
  imap: '#64748b',
}

export const PROVIDER_LETTERS: Record<Provider, string> = {
  gmail: 'G',
  yahoo: 'Y',
  outlook: 'O',
  imap: '@',
}

export const FOLDER_LABELS: Record<FolderRole, string> = {
  inbox: 'Inbox',
  sent: 'Sent',
  drafts: 'Drafts',
  starred: 'Starred',
  spam: 'Spam',
  trash: 'Trash',
}

export const FOLDER_ICONS: Record<FolderRole, string> = {
  inbox: '📥',
  sent: '📤',
  drafts: '📝',
  starred: '⭐',
  spam: '🚫',
  trash: '🗑️',
}

const AVATAR_PALETTE = [
  '#4f7ef7', '#e0596b', '#3eb489', '#d98a3d', '#9d6ff0',
  '#37a6c4', '#c45fa0', '#7d9c3e', '#cf6679', '#5d8aa8',
]

export function hashColor(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) | 0
  }
  return AVATAR_PALETTE[Math.abs(h) % AVATAR_PALETTE.length]
}

export function initials(nameOrEmail: string): string {
  const name = nameOrEmail.split('@')[0].trim()
  const parts = name.split(/[\s._-]+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

export function relativeTime(iso: string): string {
  const date = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return date.toLocaleDateString(undefined, { weekday: 'short' })
  if (date.getFullYear() === now.getFullYear())
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function textToHtml(s: string): string {
  return escapeHtml(s).replace(/\n/g, '<br>')
}

/** Thunderbird-style quoted original for replies/forwards. */
export function quoteHtml(m: {
  from_name: string
  from_email: string
  received_at: string
  body_text: string | null
  body_html: string | null
  preview: string
}): string {
  const header = `On ${new Date(m.received_at).toLocaleString()}, ${
    m.from_name || m.from_email
  } <${m.from_email}> wrote:`
  const inner = m.body_html ?? textToHtml(m.body_text ?? m.preview ?? '')
  return `<br><br><div>${escapeHtml(header)}</div><blockquote style="border-left:2px solid #5b8cff;margin:4px 0 0;padding-left:10px;color:#8a90ad">${inner}</blockquote>`
}
