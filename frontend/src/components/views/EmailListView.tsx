import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../../api/client'
import { FOLDER_LABELS, truncate } from '../../lib/utils'
import { useAccountsStore } from '../../stores/accountsStore'
import { useTabsStore } from '../../stores/tabsStore'
import { useUiStore } from '../../stores/uiStore'
import { toast } from '../../stores/toastStore'
import EmptyState from '../common/EmptyState'
import { SkeletonList, SkeletonRow } from '../common/Skeleton'
import EmailRowItem from './EmailRowItem'
import type { BreadcrumbSegment, EmailDetail, EmailRow, FolderRole } from '../../types'

const PAGE_SIZE = 30

export default function EmailListView({
  accountId,
  folder,
  viaHome = false,
}: {
  accountId?: string
  folder: FolderRole
  viaHome?: boolean
}) {
  const [emails, setEmails] = useState<EmailRow[]>([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(true)
  const sentinel = useRef<HTMLDivElement>(null)
  const openTab = useTabsStore((s) => s.openTab)
  const accounts = useAccountsStore((s) => s.accounts)

  const fetchPage = useCallback(
    async (p: number) => {
      const params = new URLSearchParams({
        folder,
        page: String(p),
        limit: String(PAGE_SIZE),
      })
      if (accountId) params.set('account_id', accountId)
      const rows = await api.get<EmailRow[]>(`/api/emails?${params}`)
      setEmails((prev) => (p === 1 ? rows : [...prev, ...rows]))
      setHasMore(rows.length === PAGE_SIZE)
      setLoading(false)
    },
    [accountId, folder],
  )

  useEffect(() => {
    setEmails([])
    setPage(1)
    setHasMore(true)
    setLoading(true)
    void fetchPage(1)
  }, [fetchPage])

  // infinite scroll
  useEffect(() => {
    const el = sentinel.current
    if (!el || loading || !hasMore) return
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        const next = page + 1
        setPage(next)
        void fetchPage(next)
      }
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [page, loading, hasMore, fetchPage])

  const openCompose = useUiStore((s) => s.openCompose)

  const openDraft = async (email: EmailRow) => {
    try {
      const detail = await api.get<EmailDetail>(`/api/emails/${email.id}`)
      openCompose({
        accountId: detail.account_id,
        to: detail.to_recipients.map((r) => r.email).join(', '),
        cc: detail.cc_recipients.map((r) => r.email).join(', '),
        bcc: detail.bcc_recipients.map((r) => r.email).join(', '),
        subject: detail.subject,
        body: detail.body_text ?? '',
        bodyHtml: detail.body_html ?? undefined,
        // drafts synced from the mail server open as a fresh copy — only
        // drafts saved in Unimail are updated in place
        draftId: email.folder_name === '__local_draft__' ? email.id : undefined,
        attachments: email.folder_name === '__local_draft__' ? detail.attachments : [],
      })
    } catch {
      toast.error('Could not open draft')
    }
  }

  const openEmail = (email: EmailRow) => {
    if (email.folder_role === 'drafts') {
      void openDraft(email)
      return
    }
    const account = accounts.find((a) => a.id === email.account_id)
    const accountLabel = account?.email_address.split('@')[0] ?? 'Account'
    const folderLabel = FOLDER_LABELS[folder]
    const crumbPrefix: BreadcrumbSegment[] = accountId
      ? viaHome
        ? [
            { label: 'Home', loc: { view: 'home' } },
            { label: folderLabel, loc: { view: 'breakdown', folder } },
            { label: accountLabel, loc: { view: 'list', accountId, folder, viaHome: true } },
          ]
        : [
            { label: accountLabel, loc: { view: 'folders', accountId } },
            { label: folderLabel, loc: { view: 'list', accountId, folder } },
          ]
      : [
          { label: 'Home', loc: { view: 'home' } },
          { label: folderLabel, loc: { view: 'list', folder } },
        ]
    openTab({
      kind: 'email',
      key: `email:${email.id}`,
      title: truncate(email.subject || '(no subject)', 30),
      location: { view: 'email', emailId: email.id, subject: email.subject },
      crumbPrefix,
    })
    if (!email.is_read) {
      setEmails((prev) =>
        prev.map((e) => (e.id === email.id ? { ...e, is_read: true } : e)),
      )
    }
  }

  const setStar = (id: string, starred: boolean) =>
    setEmails((prev) => prev.map((e) => (e.id === id ? { ...e, is_starred: starred } : e)))

  if (loading) return <SkeletonList />

  if (emails.length === 0) {
    return (
      <EmptyState
        title="No emails here"
        hint={
          folder === 'inbox'
            ? 'New mail appears automatically every few minutes, or hit ↻ to sync now.'
            : undefined
        }
      />
    )
  }

  return (
    <div>
      {emails.map((email) => (
        <EmailRowItem
          key={email.id}
          email={email}
          onOpen={openEmail}
          onStarChange={setStar}
          showAccount={!accountId}
        />
      ))}
      {hasMore && (
        <div ref={sentinel}>
          <SkeletonRow />
        </div>
      )}
    </div>
  )
}
