# Unimail — Complete Self-Hosting Guide (from zero)

This guide is for someone starting with **nothing** — no server, no domain —
who wants their own Unimail running on the public internet. It explains
**what every piece is, why you need it, and what it costs**, then walks
through setting each one up.

---

## 1. The big picture — what you need and why

| Piece | What it is | Why Unimail needs it | Typical cost |
|---|---|---|---|
| **VPS (server)** | A small Linux computer rented in a datacenter (Contabo, Hetzner, DigitalOcean…) | Runs the app 24/7 so you can reach your mail from anywhere | ~$5–8/month |
| **Domain name** | Your address on the internet, e.g. `example.com`, bought from a registrar like **Namecheap** | People (and you) reach the app at `https://mail.example.com` instead of a raw IP; also required for HTTPS certificates | ~$10/year |
| **DNS records** | Settings at your registrar that map names → your server | `mail.example.com → your VPS IP` is one DNS "A record" | free |
| **Cloudflare** *(optional)* | A free service that sits in front of your website | Hides your server's real IP, blocks bots/DDoS, caches static files | free plan is fine |
| **Docker** | Software that runs each part of Unimail in isolated containers | One command starts the whole stack identically on any server | free |
| **PostgreSQL** | The database (runs inside Docker, automatic) | Stores your synced emails, contacts, calendar, settings | free, included |
| **MinIO (S3 storage)** | An object store — like your own private Amazon S3 (runs inside Docker, automatic) | Stores email **attachments** outside the database, any size, streamed on demand. Without it Unimail falls back to re-downloading attachments from the mail server each time | free, included |
| **Reverse proxy + HTTPS** | nginx + a free Let's Encrypt certificate | Gives you the padlock (`https://`) and routes traffic to the right container | free |
| **Your own mail server** *(optional)* | docker-mailserver — real `you@example.com` mailboxes | Only if you want to HOST mail on your domain. Unimail itself is a client and works fine with Gmail/Yahoo/etc. accounts | free software |

**Minimum path:** VPS + Docker → Unimail runs on an IP address.
**Recommended path:** all of the above → a proper `https://mail.example.com`.

---

## 2. Rent a VPS

Any provider works (Contabo, Hetzner, DigitalOcean, Vultr…). Pick:

- Ubuntu 22.04 or newer, **2 GB RAM minimum** (4 GB comfortable)
- Note the server's **public IP address** — you'll use it everywhere below

Some providers (e.g. Contabo) also have a **panel-level firewall** — if a
port doesn't respond later even though the server looks fine, check that
panel and open the port there too.

Install Docker on the VPS:

```bash
curl -fsSL https://get.docker.com | sh
```

## 3. Buy a domain and point it at your server (Namecheap example)

1. Buy a domain at [namecheap.com](https://www.namecheap.com) (any registrar
   works the same way).
2. In Namecheap → *Domain List → Manage → Advanced DNS*, add an **A record**:

   | Type | Host | Value |
   |---|---|---|
   | A | `mail` | *your VPS IP* |

   This makes `mail.example.com` point at your server. (Use host `@` instead
   if you want the bare `example.com`.)
3. Wait a few minutes, then check it propagated: `ping mail.example.com`
   should show your VPS IP.

**What DNS is doing here:** it's just a public phone book. Every record maps
a name to your machine — nothing more.

## 4. (Optional) Put Cloudflare in front

Cloudflare's free plan gives you DDoS protection and hides your server's
real IP from visitors.

1. Sign up at cloudflare.com, add your domain — it imports your DNS records.
2. At Namecheap, replace the nameservers with the two Cloudflare gives you.
3. In Cloudflare DNS, set the record for the **web app** (e.g. `mail`) to
   **Proxied** (orange cloud).

⚠️ **Important if you later run your own mail server:** records used for
actual email (`MX`, and the hostname the MX points to) must be set to
**DNS only** (grey cloud). Cloudflare's proxy only carries web traffic —
proxied mail records silently break SMTP/IMAP.

## 5. Install Unimail

```bash
git clone https://github.com/arunstone/unimail-app.git unimail
cd unimail
cp .env.example .env
```

Edit `.env` — what each value is **for**:

| Variable | What it's for | What to put |
|---|---|---|
| `POSTGRES_PASSWORD` | Protects the database | any strong random string |
| `JWT_SECRET` | Signs login sessions — anyone with it could forge logins | long random string |
| `FERNET_KEY` | **Encrypts your mail passwords at rest** in the database, so a DB leak doesn't leak your mailbox credentials | generate: `python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` |
| `FRONTEND_ORIGIN` | The URL browsers will use (CORS protection + OAuth redirects) | `https://mail.example.com` |
| `BACKEND_URL` | Public URL of the API (builds OAuth callback URLs) | `https://mail.example.com` |
| `MINIO_ROOT_PASSWORD`, `S3_SECRET_KEY` | Lock your attachment store | random strings |
| `SYSTEM_SMTP_*` | An SMTP account Unimail uses to send **its own** emails (signup verification, password reset). Leave empty to skip verification | any SMTP server + login |

**About MinIO / S3:** when a mailbox syncs, attachments are copied into
MinIO (an S3-compatible object store running as a container on your own
server — your data never goes to Amazon). The database stays small, and
attachments of any size download instantly. If you leave the S3 variables
empty, Unimail still works — it just re-fetches attachments from the mail
provider over IMAP each time you download one.

Start everything:

```bash
docker compose up -d --build
```

This launches: backend (FastAPI), frontend (React), PostgreSQL, MinIO, and
a small outbound-SMTP helper. First build takes a few minutes.

## 6. HTTPS with nginx + Let's Encrypt

**Why:** browsers require HTTPS for logins, notifications, and OAuth — and
you're typing mail passwords into this app.

On the VPS:

```bash
apt install -y nginx certbot python3-certbot-nginx
certbot --nginx -d mail.example.com   # free certificate, auto-renews
```

nginx site config:

```nginx
server {
    listen 443 ssl;
    server_name mail.example.com;
    # certbot fills in the ssl_certificate lines

    client_max_body_size 25m;              # attachment uploads

    location /api/ {
        proxy_pass http://127.0.0.1:8000;  # backend container
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    location / {
        proxy_pass http://127.0.0.1:5173;  # frontend container
        proxy_set_header Host $host;
    }
}
```

Reload nginx, open `https://mail.example.com`, register your account, done.

**Recommended hardening:** add nginx `limit_req` rate limiting on
`/api/auth/` so bots can't hammer your login endpoint.

## 7. Connect your mailboxes

Click **＋ Add Account** in the app.

- **Any IMAP provider:** type your address — Unimail auto-detects the
  servers (Mozilla ISP database + autoconfig + port probing). Big providers
  need an **app password** (Yahoo: account security → app password; Gmail:
  enable 2-Step Verification → app passwords).
- **Gmail/Outlook OAuth buttons** (optional, nicer): create an OAuth client
  in Google Cloud Console / Azure, register both callback URLs
  (`<BACKEND_URL>/api/accounts/oauth/<provider>/callback` and
  `<BACKEND_URL>/api/auth/oauth/<provider>/callback`), put the client
  ID/secret in `.env`, restart the backend.

## 8. (Optional) Host your own mailboxes — `you@example.com`

Unimail is a **client**; this step gives it something of your own to
connect to. Use [docker-mailserver](https://github.com/docker-mailserver/docker-mailserver).
The software is the easy part — **deliverability is the real work**, and
it's all DNS:

| Record | What it's for |
|---|---|
| `MX` | Tells the world "mail for @example.com goes to this server" |
| `SPF` (TXT) | Lists which servers may send as your domain — without it, Gmail junks or rejects you |
| `DKIM` (TXT) | Cryptographic signature on every mail proving it wasn't forged |
| `DMARC` (TXT) | Policy telling receivers what to do when SPF/DKIM fail |
| `PTR` (reverse DNS) | Set at your **VPS provider**: IP → `mail.example.com`. Big providers refuse mail from IPs without it |

Also: open ports **25, 465, 587, 993** (server firewall *and* provider
panel), and remember the Cloudflare warning from step 4 — mail DNS records
stay grey-cloud.

Test with [mail-tester.com](https://www.mail-tester.com) until you score
10/10 — then your mail actually lands in inboxes. Finally, add the new
mailbox to Unimail like any other IMAP account.

## 9. Operating it

- **Backups:** everything lives in the `pgdata` (database) and `miniodata`
  (attachments) Docker volumes — back those two up and the rest is
  rebuildable from this repo.
- **Updates:** `git pull && docker compose up -d --build`
- **Junk filter:** activates per user after marking 3 spam + 3 ham (🚫/✓
  buttons); it trains only on your mail, on your server.
- **Sync:** background sync every 5 minutes (`SYNC_INTERVAL_MINUTES`), ⟳
  for on-demand.

## 10. Total cost of ownership

| Item | Cost |
|---|---|
| VPS | ~$5–8 / month |
| Domain | ~$10 / year |
| Cloudflare, HTTPS certs, all software | $0 |
| **Total** | **≈ $7 / month** for private, unified, own-your-data email |
