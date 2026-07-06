import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import { truncate } from '../../lib/utils'
import { useAccountsStore } from '../../stores/accountsStore'
import { useContactsStore } from '../../stores/contactsStore'
import { useTabsStore } from '../../stores/tabsStore'
import { toast } from '../../stores/toastStore'
import Avatar from '../common/Avatar'
import EmptyState from '../common/EmptyState'
import ProviderIcon from '../common/ProviderIcon'
import { SkeletonList } from '../common/Skeleton'
import EmailRowItem from './EmailRowItem'
import type { Contact, ContactSubTab, EmailRow } from '../../types'

const SUB_TABS: { id: ContactSubTab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'inbox', label: 'Inbox' },
  { id: 'sent', label: 'Sent' },
  { id: 'drafts', label: 'Drafts' },
]

export default function ContactView({
  contactId,
  sub,
}: {
  contactId: string
  sub: ContactSubTab
}) {
  const [contact, setContact] = useState<Contact | null>(null)
  const [emails, setEmails] = useState<EmailRow[] | null>(null)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', phone: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const { navigate, openTab, activeTab, closeTab, activeTabId, updateTitle } = useTabsStore()
  const accounts = useAccountsStore((s) => s.accounts)
  const fetchContacts = useContactsStore((s) => s.fetchContacts)
  const tab = activeTab()

  const startEdit = () => {
    if (!contact) return
    setForm({
      name: contact.name,
      email: contact.email,
      phone: contact.phone,
      notes: contact.notes,
    })
    setEditing(true)
  }

  const save = async () => {
    setSaving(true)
    try {
      const updated = await api.patch<Contact>(`/api/contacts/${contactId}`, form)
      setContact(updated)
      setEditing(false)
      updateTitle(activeTabId, updated.name || updated.email)
      void fetchContacts()
      toast.success('Contact saved')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save contact')
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!contact) return
    if (!window.confirm(`Delete contact ${contact.name || contact.email}? Their emails stay.`))
      return
    try {
      await api.delete(`/api/contacts/${contactId}`)
      void fetchContacts()
      toast.success('Contact deleted')
      closeTab(activeTabId)
    } catch {
      toast.error('Could not delete contact')
    }
  }

  useEffect(() => {
    void api.get<Contact>(`/api/contacts/${contactId}`).then(setContact)
  }, [contactId])

  useEffect(() => {
    setEmails(null)
    void api
      .get<EmailRow[]>(`/api/contacts/${contactId}/emails?folder=${sub}&limit=100`)
      .then(setEmails)
  }, [contactId, sub])

  const openEmail = (email: EmailRow) => {
    openTab({
      kind: 'email',
      key: `email:${email.id}`,
      title: truncate(email.subject || '(no subject)', 30),
      location: { view: 'email', emailId: email.id, subject: email.subject },
      crumbPrefix: [
        {
          label: contact?.name || contact?.email || 'Contact',
          loc: { view: 'contact', contactId, sub },
        },
      ],
    })
  }

  const setStar = (id: string, starred: boolean) =>
    setEmails((prev) =>
      prev ? prev.map((e) => (e.id === id ? { ...e, is_starred: starred } : e)) : prev,
    )

  if (!contact) return <SkeletonList rows={3} />

  const sourceAccounts = accounts.filter((a) => contact.account_ids.includes(a.id))

  return (
    <div>
      <div className="border-b border-divider p-6">
        {editing ? (
          <div className="flex max-w-md flex-col gap-2">
            <input
              className="input-base px-3 py-2"
              placeholder="Name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <input
              className="input-base px-3 py-2"
              placeholder="Email address"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
            <input
              className="input-base px-3 py-2"
              placeholder="Phone"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
            <textarea
              className="input-base resize-y px-3 py-2"
              rows={2}
              placeholder="Notes"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
            <div className="flex justify-end gap-2">
              <button
                className="rounded-lg px-3 py-1.5 text-body text-muted hover:text-primary"
                onClick={() => setEditing(false)}
              >
                Cancel
              </button>
              <button
                className="btn-primary px-4 py-1.5"
                disabled={saving || !form.email.includes('@')}
                onClick={() => void save()}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-4">
            <Avatar name={contact.name} email={contact.email} size={56} />
            <div className="min-w-0">
              <h2 className="text-head font-semibold text-primary">
                {contact.name || contact.email}
              </h2>
              <div className="font-mono text-body text-muted">{contact.email}</div>
              {contact.phone && (
                <div className="font-mono text-caption text-muted">📞 {contact.phone}</div>
              )}
              {contact.notes && (
                <div className="mt-0.5 max-w-md text-caption text-muted">{contact.notes}</div>
              )}
              <div className="mt-1 flex items-center gap-1.5">
                {sourceAccounts.map((a) => (
                  <span key={a.id} className="flex items-center gap-1 text-caption text-muted">
                    <ProviderIcon provider={a.provider} size={14} />
                    {a.email_address}
                  </span>
                ))}
              </div>
            </div>
            <div className="ml-auto flex items-center gap-3">
              <div className="text-right">
                <div className="text-head font-bold text-primary">{contact.email_count}</div>
                <div className="text-caption text-muted">emails</div>
              </div>
              <div className="flex flex-col gap-1.5">
                <button
                  onClick={startEdit}
                  className="rounded-lg border border-divider px-2.5 py-1 text-caption text-muted transition-colors hover:border-accent hover:text-primary"
                >
                  ✎ Edit
                </button>
                <button
                  onClick={() => void remove()}
                  className="rounded-lg border border-divider px-2.5 py-1 text-caption text-muted transition-colors hover:border-red-400 hover:text-red-400"
                >
                  🗑 Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-1 border-b border-divider px-4">
        {SUB_TABS.map((s) => (
          <button
            key={s.id}
            onClick={() => {
              if (s.id !== sub) navigate({ view: 'contact', contactId, sub: s.id })
            }}
            className={`border-b-2 px-4 py-2.5 text-body transition-colors ${
              s.id === sub
                ? 'border-accent font-medium text-primary'
                : 'border-transparent text-muted hover:text-primary'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {emails === null ? (
        <SkeletonList />
      ) : emails.length === 0 ? (
        <EmptyState title="No emails here" hint={`Nothing in ${sub} with ${tab.title}.`} />
      ) : (
        emails.map((email) => (
          <EmailRowItem
            key={email.id}
            email={email}
            onOpen={openEmail}
            onStarChange={setStar}
            showAccount
          />
        ))
      )}
    </div>
  )
}
