# Unimail — Self-Hosting Setup Manual

Step-by-step guide to run your own Unimail instance. No prior DevOps
experience required — if you can paste commands into a terminal, you can
run this.

## 1. What you need

- A Linux server (a small VPS with 2 GB RAM is plenty) or any machine with
  **Docker** and **Docker Compose v2** installed.
- Optional, for production use: a domain name and ports 80/443 reachable.

Install Docker if you don't have it:

```bash
curl -fsSL https://get.docker.com | sh
```

## 2. Get the code

```bash
git clone https://github.com/arunstone/unimail-app.git unimail
cd unimail
```

## 3. Configure the environment

```bash
cp .env.example .env
```

Open `.env` and set at minimum:

| Variable | What to put there |
|---|---|
| `POSTGRES_PASSWORD` | Any strong random password |
| `JWT_SECRET` | Any long random string (signs login tokens) |
| `FERNET_KEY` | Encrypts mail passwords at rest — generate it with the command below |
| `FRONTEND_ORIGIN` | URL you'll open in the browser, e.g. `http://localhost:5173` or `https://mail.example.com` |
| `BACKEND_URL` | Public URL of the API, e.g. `http://localhost:8000` or `https://mail.example.com` |

Generate the Fernet key:

```bash
python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Everything else can stay at its default for a first run. `MINIO_ROOT_PASSWORD`
and `S3_SECRET_KEY` enable the attachment object store — set them to random
strings, or leave the storage variables empty to fall back to fetching
attachments from IMAP on demand.

## 4. Start it

```bash
docker compose up -d --build
```

First build takes a few minutes. Then open:

- **App:** http://localhost:5173
- **API docs:** http://localhost:8000/docs

Create your account at `/register` and sign in.

> If `SYSTEM_SMTP_HOST` is empty (the default), signup email verification is
> skipped and new accounts are active immediately. Point it at any SMTP
> server to enable verification and password-reset emails.

## 5. Connect a mailbox

Click **＋ Add Account**.

**Any IMAP provider (works out of the box):**
Type your address and Unimail auto-detects the IMAP/SMTP servers. Note that
most big providers require an *app password* instead of your normal one:

- Yahoo: account security → generate app password
- Gmail: enable 2-Step Verification, then create an app password
  (host `imap.gmail.com` / `smtp.gmail.com`)

**Gmail / Outlook via OAuth (optional, nicer UX):**

1. Create an OAuth client — Google Cloud Console → *APIs & Services →
   Credentials* (type: Web application), or Azure Portal → *App
   registrations*.
2. Register **both** redirect URIs (replace with your `BACKEND_URL`):
   - `<BACKEND_URL>/api/accounts/oauth/gmail/callback`
   - `<BACKEND_URL>/api/auth/oauth/gmail/callback`
   (for Outlook: the same two paths with `outlook`)
3. Put `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (or `OUTLOOK_*`) in
   `.env` and restart: `docker compose up -d backend`
4. "Continue with Google/Microsoft" buttons appear on the login page
   automatically.

## 6. Production deployment (domain + HTTPS)

Run Unimail behind any reverse proxy. Example with nginx:

```nginx
server {
    listen 443 ssl;
    server_name mail.example.com;
    # ssl_certificate ... (use certbot / Let's Encrypt)

    client_max_body_size 25m;          # attachment uploads

    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    location / {
        proxy_pass http://127.0.0.1:5173;
        proxy_set_header Host $host;
    }
}
```

Then set in `.env`:

```
FRONTEND_ORIGIN=https://mail.example.com
BACKEND_URL=https://mail.example.com
```

and restart: `docker compose up -d`.

Recommended extras: rate-limit `/api/auth/` at the proxy, and put the site
behind Cloudflare or similar if you like.

## 7. Good to know

- **Sync cadence:** every account re-syncs in the background every
  `SYNC_INTERVAL_MINUTES` (default 5); the ⟳ button syncs on demand.
- **Junk filter:** activates per user after you mark **3 spam and 3 ham**
  messages (🚫 / ✓ buttons on any email). It learns your mail only.
- **Filter rules, signatures, notifications:** all under ⚙ Settings.
- **Calendar:** meeting invites (.ics) arriving in connected mailboxes show
  up automatically on the 📅 Calendar tab.
- **Backups:** your state lives in the `pgdata` and `miniodata` Docker
  volumes — back those up and you can rebuild everything else from this
  repo.

## 8. Updating

```bash
git pull
docker compose up -d --build
```

## 9. Optional: run your own mail server

Unimail is a *client* — it connects to mailboxes anywhere. If you also want
to host real mailboxes on your own domain (`you@example.com`), pair it with
[docker-mailserver](https://github.com/docker-mailserver/docker-mailserver):
set up DKIM/SPF/DMARC DNS records, then connect the mailbox to Unimail like
any other IMAP account. Done right, self-hosted mail scores 10/10 on
[mail-tester.com](https://www.mail-tester.com).
