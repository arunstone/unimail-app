# Unimail — Unified Email Client

A single dashboard to connect multiple email accounts (Gmail, Outlook, Yahoo, any IMAP)
and manage all your mail in one place. Three-column layout: accounts on the left,
a browser-style tabbed workspace in the middle, and a live contacts panel on the right.

**Stack:** FastAPI + PostgreSQL + APScheduler (backend) · React + TypeScript + Vite +
Tailwind + Zustand (frontend) · Docker Compose.

📖 **[About the product](ABOUT.md)** · **[Full feature list](FEATURES.md)** · **[Self-hosting setup manual](SETUP.md)**

## Quick start

```bash
cd unimail
cp .env.example .env        # then edit (see "Environment variables" below)
docker compose up -d --build
```

- Frontend: http://localhost:5173
- Backend API + docs: http://localhost:8000/docs

Register an app user at `/register`, sign in, then click **+ Add Account**.

## Environment variables (`.env`)

| Variable | Purpose |
|---|---|
| `POSTGRES_DB/USER/PASSWORD` | Database credentials (compose wires them to the backend) |
| `JWT_SECRET` | Signs app login tokens — any long random string |
| `FERNET_KEY` | Encrypts mail passwords/OAuth tokens at rest. Generate: `python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` |
| `FRONTEND_ORIGIN` | Browser URL of the frontend (CORS + post-OAuth redirect) |
| `BACKEND_URL` | Public URL of the backend (builds OAuth redirect URIs) |
| `GOOGLE_CLIENT_ID/SECRET` | Gmail OAuth (optional) |
| `OUTLOOK_CLIENT_ID/SECRET` | Outlook OAuth (optional) |
| `SYNC_INTERVAL_MINUTES` | Background IMAP poll interval (default 5) |
| `SYSTEM_SMTP_HOST/PORT/USERNAME/PASSWORD/FROM` | SMTP server Unimail uses to send registration-verification emails. Leave `SYSTEM_SMTP_HOST` empty and verification is skipped (new users are active immediately). Gmail example: `smtp.gmail.com` / `587` / your address / an app password |
| `VERIFY_TOKEN_EXPIRE_HOURS` | Verification link lifetime (default 48) |

The current `.env` was generated with random secrets already filled in.

## Connecting accounts

**Yahoo / any IMAP (works out of the box, no OAuth setup):**
Click *+ Add Account → Yahoo* (or *Other (IMAP)*). Yahoo needs an
[app password](https://help.yahoo.com/kb/SLN15241.html), not your normal password.
Gmail also works this way with an app password (host `imap.gmail.com` / `smtp.gmail.com`)
if you don't want to set up OAuth.

**Gmail via OAuth:**
1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials) create an
   OAuth client (type: Web application).
2. Add authorized redirect URI: `<BACKEND_URL>/api/accounts/oauth/gmail/callback`
3. Put the client id/secret in `.env`, restart: `docker compose up -d backend`

**Outlook via OAuth:**
1. In [Azure Portal → App registrations](https://portal.azure.com) create an app.
2. Add a Web redirect URI: `<BACKEND_URL>/api/accounts/oauth/outlook/callback`
3. Under *API permissions* add `IMAP.AccessAsUser.All`, `SMTP.Send`, `offline_access`.
4. Put the client id/secret in `.env`, restart the backend.

## How sync works

APScheduler runs inside the backend process and polls every account over IMAP every
5 minutes (new messages, read/star flag changes). Gmail/Outlook authenticate with
OAuth XOAUTH2 over IMAP — one unified sync path for all providers. Contacts are
extracted automatically from To/From/Cc headers. Manual sync: the ↻ button in the
app, or `POST /api/sync/{account_id}`.

## Notes & design decisions

- Tables are created automatically on backend startup (`Base.metadata.create_all`)
  — no migration step needed. If you later change models, add Alembic.
- OAuth tokens and IMAP passwords are Fernet-encrypted at rest.
- Email HTML is sanitised with bleach server-side and additionally rendered in a
  fully sandboxed iframe.
- The frontend container runs the Vite dev server (hot reload). For production,
  build `frontend/dist` and serve it via nginx instead.

## Useful commands

```bash
docker compose logs -f backend     # watch sync activity
docker compose restart backend     # after editing .env
docker exec -it unimail-postgres-1 psql -U unimail unimail   # inspect DB
```
