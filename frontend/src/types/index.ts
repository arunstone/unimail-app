export type Provider = 'gmail' | 'yahoo' | 'outlook' | 'imap'

export interface User {
  id: string
  name: string
  email: string
  is_verified: boolean
}

export interface Account {
  id: string
  provider: Provider
  email_address: string
  display_name: string
  signature: string
  is_active: boolean
  last_synced_at: string | null
  sync_status: 'pending' | 'syncing' | 'ok' | 'error'
  unread_count: number
}

export interface EmailRow {
  id: string
  account_id: string
  folder_role: string
  /** "__local_draft__" marks drafts editable in the app */
  folder_name: string
  from_name: string
  from_email: string
  subject: string
  preview: string
  is_read: boolean
  is_starred: boolean
  has_attachments: boolean
  received_at: string
}

export interface Recipient {
  name: string
  email: string
}

export interface AttachmentMeta {
  id: string
  filename: string
  content_type: string
  size_bytes: number
}

export interface EmailDetail extends EmailRow {
  to_recipients: Recipient[]
  cc_recipients: Recipient[]
  bcc_recipients: Recipient[]
  body_text: string | null
  body_html: string | null
  attachments: AttachmentMeta[]
}

export interface Contact {
  id: string
  name: string
  email: string
  account_ids: string[]
  email_count: number
  is_manual: boolean
  phone: string
  notes: string
}

/** Seed for the global compose panel. */
export interface ComposeSeed {
  accountId?: string
  to?: string
  cc?: string
  bcc?: string
  subject?: string
  body?: string
  bodyHtml?: string
  replyToId?: string
  /** editing an existing local draft */
  draftId?: string
  attachments?: AttachmentMeta[]
}

export interface FilterCondition {
  field: 'from' | 'to' | 'subject' | 'body'
  op: 'contains' | 'not_contains' | 'equals'
  value: string
}

export interface FilterActions {
  move_to: 'trash' | 'spam' | 'archive' | null
  label_id: string | null
  mark_read: boolean
  star: boolean
}

export interface FilterRule {
  id: string
  name: string
  account_id: string | null
  match_type: 'all' | 'any'
  conditions: FilterCondition[]
  actions: FilterActions
  enabled: boolean
  position: number
  created_at: string
}

export interface FolderCount {
  folder: string
  unread: number
  total: number
}

export interface AccountSummary {
  account_id: string
  email_address: string
  provider: Provider
  folders: FolderCount[]
}

export interface Summary {
  consolidated: FolderCount[]
  accounts: AccountSummary[]
}

export type FolderRole = 'inbox' | 'sent' | 'drafts' | 'starred' | 'spam' | 'trash'
export type ContactSubTab = 'all' | 'inbox' | 'sent' | 'drafts'
export type FileType = 'pdf' | 'image' | 'doc' | 'sheet' | 'archive'

export interface ThreadMessage extends EmailRow {
  to_recipients: Recipient[]
  body_text: string | null
  body_html: string | null
  attachments: AttachmentMeta[]
  is_mine: boolean
}

export interface Label {
  id: string
  name: string
  email_count: number
  created_at: string
}

export interface TimelineMessage extends EmailRow {
  to_recipients: Recipient[]
  is_mine: boolean
  position: number
}

export interface LabelDetail extends Label {
  emails: TimelineMessage[]
}

/** A position inside a tab's navigation history. */
export type TabLocation =
  | { view: 'home' }
  | { view: 'folders'; accountId: string }
  | { view: 'breakdown'; folder: FolderRole }
  | { view: 'list'; accountId?: string; folder: FolderRole; viaHome?: boolean }
  | { view: 'email'; emailId: string; subject: string }
  | { view: 'contact'; contactId: string; sub: ContactSubTab }
  | { view: 'graph' }
  | { view: 'search'; query: string; fileType?: FileType }
  | { view: 'label'; labelId: string; name: string }
  | { view: 'settings' }
  | { view: 'calendar' }

export interface BreadcrumbSegment {
  label: string
  loc?: TabLocation
}

export type TabKind = 'home' | 'account' | 'email' | 'contact' | 'label' | 'settings' | 'calendar'

export interface Tab {
  id: string
  kind: TabKind
  /** dedupe key, e.g. account:<id>, email:<id>, contact:<id> */
  key: string
  title: string
  provider?: Provider
  history: TabLocation[]
  historyIndex: number
  /** breadcrumb prefix for email tabs (where the email was opened from) */
  crumbPrefix?: BreadcrumbSegment[]
}

export interface CalendarEvent {
  id: string
  title: string
  location: string
  description: string
  starts_at: string
  ends_at: string | null
  all_day: boolean
  source: 'manual' | 'invite'
  organizer: string
  status: 'confirmed' | 'tentative' | 'cancelled'
  email_id: string | null
}

export interface TaskItem {
  id: string
  title: string
  notes: string
  due_at: string | null
  done: boolean
  created_at: string
}

export interface SavedSearch {
  id: string
  name: string
  query: string
  file_type: string | null
  count: number
}
