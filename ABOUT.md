# About Unimail

**Unimail is a self-hosted, web-based email client that brings all your mailboxes
— Gmail, Outlook, Yahoo, or any IMAP account — into one fast, modern dashboard.**

## Why Unimail exists

Desktop clients like Thunderbird solved unified email years ago — but they live on
one machine. Webmail is everywhere — but it locks you into one provider's inbox,
one provider's rules, and one provider's data mining.

Unimail closes that gap: a full-featured email client that runs in any browser, on
any device, connects to every account you own, and lives on **your** server. Your
credentials are encrypted at rest with keys only you hold, your spam filter is
trained by you and stays with you, and nothing about your mail is anyone else's
business.

## What it feels like

Open one tab and see every account. A three-column workspace — accounts and
folders on the left, a browser-style tabbed reading area in the middle, live
contacts on the right — that collapses gracefully to a phone screen. Compose rich
HTML mail with attachments and signatures. Let filter rules sort incoming mail and
watch the changes mirror back to the real mailbox. Mark a few messages as junk and
a personal Bayesian filter learns your definition of spam. Meeting invites landing
in your inbox appear on the built-in calendar by themselves.

It syncs both ways: read, flag, move, or send in Unimail and the same change
happens on the underlying IMAP server — so your mail stays consistent everywhere,
including in any other client you use.

## Built to own the whole stack

Unimail pairs with a hardened companion mail server (docker-mailserver: DKIM, SPF,
DMARC, TLS 1.3, rspamd, fail2ban) so you can run real mailboxes on your own domain
end-to-end. The production deployment scores **10/10 on mail-tester.com** — mail
sent from this stack lands in inboxes, not spam folders.

## Tech at a glance

| Layer | Stack |
|---|---|
| Backend | FastAPI · SQLAlchemy · PostgreSQL · APScheduler (background IMAP sync) |
| Frontend | React · TypeScript · Vite · Tailwind · Zustand |
| Storage | MinIO (S3-compatible) for attachments of any size |
| Security | Fernet-encrypted credentials at rest · JWT auth · nginx rate limiting · HTTPS |
| Deploy | Docker Compose behind an nginx reverse proxy |

See [FEATURES.md](FEATURES.md) for the complete feature list.
