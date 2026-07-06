import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import { PROVIDER_COLORS } from '../../lib/utils'
import { useAccountsStore } from '../../stores/accountsStore'
import { useAuthStore } from '../../stores/authStore'
import { toast } from '../../stores/toastStore'
import ProviderIcon from '../common/ProviderIcon'
import FiltersSection from './FiltersSection'
import type { Account } from '../../types'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-divider bg-panel shadow-card">
      <h2 className="border-b border-divider px-4 py-2.5 text-caption font-bold uppercase tracking-wide text-muted">
        {title}
      </h2>
      <div className="p-4">{children}</div>
    </section>
  )
}

function SignatureEditor({ account }: { account: Account }) {
  const [signature, setSignature] = useState(account.signature ?? '')
  const [saving, setSaving] = useState(false)
  const fetchAccounts = useAccountsStore((s) => s.fetchAccounts)
  const dirty = signature !== (account.signature ?? '')

  const save = async () => {
    setSaving(true)
    try {
      await api.patch(`/api/accounts/${account.id}`, { signature })
      await fetchAccounts()
      toast.success('Signature saved')
    } catch {
      toast.error('Could not save signature')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <ProviderIcon provider={account.provider} size={16} />
        <span className="font-mono text-caption text-muted">{account.email_address}</span>
      </div>
      <textarea
        value={signature}
        onChange={(e) => setSignature(e.target.value)}
        rows={3}
        placeholder="Appended to messages you write from this account…"
        className="input-base resize-y px-3 py-2"
      />
      {dirty && (
        <button className="btn-primary self-end px-3 py-1 text-caption" disabled={saving} onClick={() => void save()}>
          {saving ? 'Saving…' : 'Save signature'}
        </button>
      )}
    </div>
  )
}

function NotificationsSection() {
  const supported = 'Notification' in window
  const [permission, setPermission] = useState(supported ? Notification.permission : 'denied')

  const enable = async () => {
    const result = await Notification.requestPermission()
    setPermission(result)
    if (result === 'granted') toast.success('Desktop notifications enabled')
  }

  if (!supported) {
    return <div className="text-body text-muted">This browser does not support notifications.</div>
  }
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 text-body text-muted">
        {permission === 'granted'
          ? '✓ Enabled — you get a desktop notification when new mail arrives.'
          : permission === 'denied'
            ? 'Blocked by the browser. Allow notifications for this site in your browser settings.'
            : 'Get a desktop notification when new mail arrives.'}
      </div>
      {permission === 'default' && (
        <button className="btn-primary px-3 py-1.5" onClick={() => void enable()}>
          Enable
        </button>
      )}
    </div>
  )
}

interface JunkStats {
  enabled: boolean
  spam_trained: number
  ham_trained: number
  min_needed: number
  active: boolean
}

function JunkSection() {
  const [stats, setStats] = useState<JunkStats | null>(null)

  useEffect(() => {
    api.get<JunkStats>('/api/junk').then(setStats).catch(() => setStats(null))
  }, [])

  if (!stats) return <div className="text-body text-muted">Loading…</div>

  const toggle = async () => {
    try {
      setStats(await api.patch<JunkStats>('/api/junk', { enabled: !stats.enabled }))
    } catch {
      toast.error('Could not update the junk filter')
    }
  }

  const needSpam = Math.max(0, stats.min_needed - stats.spam_trained)
  const needHam = Math.max(0, stats.min_needed - stats.ham_trained)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="flex-1 text-body text-muted">
          Learns from you: mark messages 🚫 Spam / ✓ Not spam and new mail in
          every connected account gets checked automatically.
        </div>
        <button
          onClick={() => void toggle()}
          className={`rounded-full px-3 py-1.5 text-caption font-medium transition-colors ${
            stats.enabled
              ? 'bg-accent/20 text-accent'
              : 'border border-divider text-muted hover:text-primary'
          }`}
        >
          {stats.enabled ? 'On' : 'Off'}
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-caption">
        <span className="rounded-full border border-divider px-2.5 py-1 font-mono text-muted">
          🚫 trained as spam: {stats.spam_trained}
        </span>
        <span className="rounded-full border border-divider px-2.5 py-1 font-mono text-muted">
          ✓ trained as not spam: {stats.ham_trained}
        </span>
        <span
          className={`rounded-full px-2.5 py-1 font-medium ${
            stats.active ? 'bg-green-500/15 text-green-400' : 'border border-divider text-muted'
          }`}
        >
          {stats.active
            ? '● Active — filtering new mail'
            : !stats.enabled
              ? 'Turned off'
              : `Learning — mark ${[
                  needSpam ? `${needSpam} more spam` : '',
                  needHam ? `${needHam} more legit (✓ Not spam)` : '',
                ].filter(Boolean).join(' and ')} message${needSpam + needHam === 1 ? '' : 's'} to activate`}
        </span>
      </div>
    </div>
  )
}

export default function SettingsView() {
  const { user, logout } = useAuthStore()
  const { accounts, disconnect } = useAccountsStore()

  const handleDisconnect = async (accountId: string, email: string) => {
    if (!window.confirm(`Disconnect ${email}? Its synced emails will be removed.`)) return
    try {
      await disconnect(accountId)
      toast.success('Account disconnected')
    } catch {
      toast.error('Failed to disconnect account')
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 p-6">
      <h1 className="text-head font-bold text-primary">⚙ Settings</h1>

      <Section title="Profile">
        <div className="flex flex-col gap-1">
          <div className="text-body font-medium text-primary">{user?.name}</div>
          <div className="text-body text-muted">{user?.email}</div>
          <div className="text-caption text-muted">
            {user?.is_verified ? '✓ Email verified' : 'Email not verified'}
          </div>
        </div>
      </Section>

      <Section title="Connected accounts">
        {accounts.length === 0 ? (
          <div className="text-body text-muted">No mail accounts connected.</div>
        ) : (
          <div className="flex flex-col gap-2">
            {accounts.map((account) => (
              <div key={account.id} className="flex items-center gap-3">
                <ProviderIcon provider={account.provider} size={20} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-body text-primary">{account.email_address}</div>
                  <div className="text-caption" style={{ color: PROVIDER_COLORS[account.provider] }}>
                    {account.provider}
                  </div>
                </div>
                <button
                  onClick={() => handleDisconnect(account.id, account.email_address)}
                  className="rounded border border-divider px-2.5 py-1 text-caption text-muted transition-colors hover:border-red-400 hover:text-red-400"
                >
                  Disconnect
                </button>
              </div>
            ))}
          </div>
        )}
      </Section>

      {accounts.length > 0 && (
        <Section title="Signatures">
          <div className="flex flex-col gap-4">
            {accounts.map((account) => (
              <SignatureEditor key={account.id} account={account} />
            ))}
          </div>
        </Section>
      )}

      <Section title="Notifications">
        <NotificationsSection />
      </Section>

      <Section title="Junk filter">
        <JunkSection />
      </Section>

      <Section title="Message filters">
        <FiltersSection />
      </Section>

      <Section title="Session">
        <button
          onClick={logout}
          className="rounded-lg border border-divider px-4 py-2 text-body font-medium text-muted transition-colors hover:border-red-400 hover:text-red-400"
        >
          Sign out
        </button>
      </Section>
    </div>
  )
}
