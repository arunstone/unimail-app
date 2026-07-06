# Unimail — Feature Overview

A web-based, self-hosted unified email client. Every feature below is built,
deployed, and verified in a live production deployment.

## Unified inbox
- Connect unlimited accounts: **Gmail, Outlook, Yahoo, or any IMAP server** — one dashboard for all of them.
- Background sync every 5 minutes; manual sync on demand.
- **Two-way IMAP mirroring** — read/unread, stars, moves, junk verdicts, and sent copies made in Unimail are pushed back to the real mailbox, so every other client you use stays consistent.
- Automatic account setup: type an email address and Unimail detects the right IMAP/SMTP servers (Mozilla ISP database + domain autoconfig + port probing).
- "Continue with Google / Microsoft" OAuth sign-in: one consent connects the mailbox and logs you in.

## Reading & organizing
- Browser-style **tabbed workspace** — open emails, folders, contacts, settings, and search side by side in tabs.
- Conversation threads, labels with drag-to-label, unread badges.
- **Saved searches** — pin any search as a virtual folder with a live message count.
- Full-text search with file-type filters (e.g. only mail with PDFs).
- **Email graph view** — an Obsidian-style force graph showing which of your emails are related by content.

## Compose
- Rich HTML editor with formatting toolbar, per-account **signatures**, and a From-account selector.
- **Attachments** up to 25 MB per file, staged uploads with automatic cleanup.
- **Drafts autosave** every 3 seconds; reply and forward with proper quoting.

## Junk filter (trainable, private)
- Personal **Bayesian spam filter** — mark 3 spam and 3 ham messages and it activates, learning *your* definition of junk.
- Runs entirely on your server; no third party sees your mail.
- Verdicts are mirrored to the mailbox's junk folder server-side.

## Filter rules
- If/then rules applied automatically to incoming mail: mark read, star, move to folder.
- Server-side mirroring — a rule that files mail into a folder does it on the actual IMAP server, not just the app.

## Calendar & tasks
- Month-view calendar with manual events and a task list with due dates.
- **Automatic invite ingestion** — meeting invites (.ics) arriving in any connected mailbox appear on the calendar by themselves; reschedules update in place and cancellations are tracked.
- Upcoming-events list and links back to the source email.

## Contacts
- Address book auto-populated from your mail traffic, plus fully editable manual contacts (phone, notes).
- Live contacts panel with per-contact conversation history.

## Attachments at any scale
- Attachments are stored in an S3-compatible object store (MinIO), streamed on demand — mailbox size is no longer your storage limit.
- Falls back to fetching from IMAP if an object is missing, and backfills the store.

## Notifications
- Desktop notifications for new mail and an unread-count badge in the browser tab title.

## Responsive UI
- Full experience on phone, tablet, split-screen, and desktop — panels become slide-in drawers on small screens.
- Polished design system: dark theme, gradient accents, skeleton loading, toasts.

## Accounts & security
- App accounts with email verification and password reset.
- Mail credentials and OAuth tokens **encrypted at rest** (Fernet); JWT session auth.
- nginx rate limiting on auth and API endpoints; HTTPS everywhere.
- Self-hosted: your server, your data, your keys.

## Companion mail server
- Hardened docker-mailserver stack for real mailboxes on your own domain: DKIM signing, SPF, TLS 1.3, rspamd spam filtering, fail2ban.
- Production deployment scores **10/10 on mail-tester.com**.

## Roadmap
- PGP/S-MIME encryption, mailbox import/export, keyboard shortcuts, RSVP replies and recurring events on the calendar, CalDAV.
