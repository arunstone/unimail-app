import { useEffect, useMemo, useState } from 'react'
import { api } from '../../api/client'
import { useAccountsStore } from '../../stores/accountsStore'
import { useContactsStore } from '../../stores/contactsStore'
import { useTabsStore } from '../../stores/tabsStore'
import { toast } from '../../stores/toastStore'
import Avatar from '../common/Avatar'
import ProviderIcon from '../common/ProviderIcon'
import type { Contact } from '../../types'

function NewContactForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const fetchContacts = useContactsStore((s) => s.fetchContacts)

  const save = async () => {
    setSaving(true)
    try {
      await api.post('/api/contacts', { name, email })
      toast.success('Contact added')
      await fetchContacts()
      onDone()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not add contact')
    } finally {
      setSaving(false)
    }
  }

  const input =
    'w-full rounded-md border border-divider bg-app px-3 py-1.5 text-body text-primary outline-none placeholder:text-muted focus:border-accent'

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-accent/40 bg-app p-2">
      <input className={input} placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
      <input
        className={input}
        placeholder="Email address"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <div className="flex justify-end gap-2">
        <button className="px-2 py-1 text-caption text-muted hover:text-primary" onClick={onDone}>
          Cancel
        </button>
        <button
          className="btn-primary px-3 py-1 text-caption"
          disabled={saving || !email.includes('@')}
          onClick={() => void save()}
        >
          {saving ? 'Adding…' : 'Add'}
        </button>
      </div>
    </div>
  )
}

export default function RightPanel() {
  const { contacts, search, accountFilter, setSearch, setAccountFilter, fetchContacts } =
    useContactsStore()
  const accounts = useAccountsStore((s) => s.accounts)
  const openTab = useTabsStore((s) => s.openTab)
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    void fetchContacts()
  }, [fetchContacts])

  const grouped = useMemo(() => {
    const groups = new Map<string, Contact[]>()
    for (const c of contacts) {
      const letter = (c.name || c.email)[0]?.toUpperCase() ?? '#'
      const key = /[A-Z]/.test(letter) ? letter : '#'
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(c)
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [contacts])

  const openContact = (contact: Contact) => {
    openTab({
      kind: 'contact',
      key: `contact:${contact.id}`,
      title: contact.name || contact.email,
      location: { view: 'contact', contactId: contact.id, sub: 'all' },
    })
  }

  return (
    <aside className="flex h-full w-full flex-col border-l border-divider bg-panel">
      <div className="border-b border-divider p-3">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-subhead font-semibold text-primary">Contacts</h2>
          <button
            onClick={() => setAdding(!adding)}
            title="New contact"
            className="rounded px-1.5 text-subhead text-muted transition-colors hover:bg-surface hover:text-accent"
          >
            ＋
          </button>
        </div>
        {adding && (
          <div className="mb-2">
            <NewContactForm onDone={() => setAdding(false)} />
          </div>
        )}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name or email…"
          className="mb-2 w-full rounded-md border border-divider bg-app px-3 py-1.5 text-body text-primary outline-none placeholder:text-muted focus:border-accent"
        />
        <select
          value={accountFilter ?? ''}
          onChange={(e) => setAccountFilter(e.target.value || null)}
          className="w-full rounded-md border border-divider bg-app px-2 py-1.5 text-body text-primary outline-none focus:border-accent"
        >
          <option value="">All Accounts</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.email_address}
            </option>
          ))}
        </select>
      </div>

      <div className="flex-1 overflow-y-auto">
        {grouped.map(([letter, group]) => (
          <div key={letter}>
            <div className="sticky top-0 z-10 bg-panel px-3 py-1 text-caption font-bold text-accent">
              {letter}
            </div>
            {group.map((contact) => {
              const source = accounts.find((a) => contact.account_ids.includes(a.id))
              return (
                <button
                  key={contact.id}
                  onClick={() => openContact(contact)}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-surface"
                >
                  <Avatar name={contact.name} email={contact.email} size={28} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body font-medium text-primary">
                      {contact.name || contact.email.split('@')[0]}
                    </span>
                    <span className="block truncate font-mono text-caption text-muted">
                      {contact.email}
                    </span>
                  </span>
                  {source && <ProviderIcon provider={source.provider} size={14} />}
                </button>
              )
            })}
          </div>
        ))}
        {contacts.length === 0 && (
          <div className="px-3 py-6 text-center text-body text-muted">
            {search ? 'No matches' : 'Contacts appear here after your first sync'}
          </div>
        )}
      </div>

      <div className="border-t border-divider px-3 py-2 text-center font-mono text-caption text-muted">
        {contacts.length} contact{contacts.length === 1 ? '' : 's'}
      </div>
    </aside>
  )
}
