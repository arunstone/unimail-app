"""IMAP connection + message fetching/parsing. Works for plain-password
accounts (Yahoo app passwords, generic IMAP) and XOAUTH2 accounts
(Gmail, Outlook) through the same interface."""

import email
import email.utils
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from email.message import EmailMessage
from email.policy import default as default_policy

from imapclient import IMAPClient

# Folders we never sync (would duplicate messages already synced elsewhere)
SKIP_FOLDERS = {"[gmail]/all mail", "[gmail]/important", "[gmail]/starred", "archive"}

ROLE_PATTERNS = [
    ("inbox", re.compile(r"^inbox$", re.I)),
    ("sent", re.compile(r"sent", re.I)),
    ("drafts", re.compile(r"draft", re.I)),
    ("spam", re.compile(r"spam|junk|bulk", re.I)),
    ("trash", re.compile(r"trash|deleted|bin", re.I)),
]

FIRST_SYNC_LIMIT = 200   # newest messages pulled per folder on first sync
FLAG_REFRESH_LIMIT = 500  # newest UIDs re-checked for read/star changes each sync


def folder_role(name: str, special_use: list[bytes] | None = None) -> str:
    flags = {f.decode().lower() for f in (special_use or [])}
    if "\\sent" in flags:
        return "sent"
    if "\\drafts" in flags:
        return "drafts"
    if "\\junk" in flags:
        return "spam"
    if "\\trash" in flags:
        return "trash"
    for role, pattern in ROLE_PATTERNS:
        if pattern.search(name):
            return role
    return "custom"


@dataclass
class ParsedEmail:
    imap_uid: int
    message_id: str
    from_name: str
    from_email: str
    to: list[dict]
    cc: list[dict]
    bcc: list[dict]
    subject: str
    preview: str
    body_text: str | None
    body_html: str | None
    received_at: datetime
    is_read: bool
    is_starred: bool
    attachments: list[dict] = field(default_factory=list)


def connect(host: str, port: int, username: str, password: str | None,
            oauth_token: str | None = None) -> IMAPClient:
    client = IMAPClient(host, port=port, ssl=True, timeout=30)
    if oauth_token:
        client.oauth2_login(username, oauth_token)
    else:
        client.login(username, password)
    return client


def list_folders(client: IMAPClient) -> list[tuple[str, str]]:
    """Returns [(folder_name, role)] excluding duplicate-prone folders."""
    out = []
    for flags, _delim, name in client.list_folders():
        if "\\noselect" in {f.decode().lower() for f in flags}:
            continue
        if name.lower() in SKIP_FOLDERS:
            continue
        out.append((name, folder_role(name, flags)))
    return out


def _addr_list(msg: EmailMessage, header: str) -> list[dict]:
    raw = msg.get_all(header, [])
    pairs = email.utils.getaddresses(raw)
    return [{"name": n, "email": a.lower()} for n, a in pairs if a]


def _make_preview(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()[:80]


def parse_message(uid: int, raw: bytes, flags: tuple) -> ParsedEmail:
    msg: EmailMessage = email.message_from_bytes(raw, policy=default_policy)

    from_pairs = email.utils.getaddresses(msg.get_all("From", []))
    from_name, from_email = (from_pairs[0] if from_pairs else ("", ""))

    body_text = None
    body_html = None
    attachments = []
    for part in msg.walk():
        if part.is_multipart():
            continue
        disposition = part.get_content_disposition()
        ctype = part.get_content_type()
        if disposition == "attachment" or (disposition == "inline" and part.get_filename()):
            payload = part.get_payload(decode=True) or b""
            attachments.append({
                "filename": part.get_filename() or "attachment",
                "content_type": ctype,
                "size_bytes": len(payload),
                "content": payload,  # popped by sync before the DB insert
            })
        elif ctype == "text/calendar":
            # inline meeting invite without a filename — keep it as an
            # attachment so sync can feed it to the calendar
            payload = part.get_payload(decode=True) or b""
            attachments.append({
                "filename": part.get_filename() or "invite.ics",
                "content_type": ctype,
                "size_bytes": len(payload),
                "content": payload,
            })
        elif ctype == "text/plain" and body_text is None:
            body_text = part.get_content()
        elif ctype == "text/html" and body_html is None:
            body_html = part.get_content()

    date = msg.get("Date")
    try:
        received_at = email.utils.parsedate_to_datetime(date) if date else None
    except (TypeError, ValueError):
        received_at = None
    if received_at is None:
        received_at = datetime.now(timezone.utc)
    if received_at.tzinfo is None:
        received_at = received_at.replace(tzinfo=timezone.utc)

    flag_set = {f.decode().lower() if isinstance(f, bytes) else str(f).lower() for f in flags}
    preview_source = body_text or re.sub(r"<[^>]+>", " ", body_html or "")

    return ParsedEmail(
        imap_uid=uid,
        message_id=(msg.get("Message-ID") or "").strip()[:512],
        from_name=from_name[:255],
        from_email=from_email.lower()[:255],
        to=_addr_list(msg, "To"),
        cc=_addr_list(msg, "Cc"),
        bcc=_addr_list(msg, "Bcc"),
        subject=str(msg.get("Subject") or "")[:998],
        preview=_make_preview(preview_source),
        body_text=body_text,
        body_html=body_html,
        received_at=received_at,
        is_read="\\seen" in flag_set,
        is_starred="\\flagged" in flag_set,
        attachments=attachments,
    )


def fetch_new_messages(client: IMAPClient, folder: str, last_seen_uid: int
                       ) -> tuple[list[ParsedEmail], int, int | None]:
    """Fetch messages with UID > last_seen_uid. Returns (messages, max_uid, uidvalidity)."""
    info = client.select_folder(folder, readonly=True)
    uidvalidity = info.get(b"UIDVALIDITY")
    if last_seen_uid:
        uids = client.search(f"UID {last_seen_uid + 1}:*")
        uids = [u for u in uids if u > last_seen_uid]
    else:
        uids = client.search("ALL")
        uids = sorted(uids)[-FIRST_SYNC_LIMIT:]

    messages = []
    max_uid = last_seen_uid
    if uids:
        fetched = client.fetch(uids, ["RFC822", "FLAGS"])
        for uid, data in fetched.items():
            raw = data.get(b"RFC822")
            if not raw:
                continue
            messages.append(parse_message(uid, raw, data.get(b"FLAGS", ())))
            max_uid = max(max_uid, uid)
    return messages, max_uid, uidvalidity


def fetch_attachment(client: IMAPClient, folder: str, uid: int,
                     filename: str, size_bytes: int) -> bytes | None:
    """Re-fetch a message and return the decoded payload of the attachment
    matching filename (and, when several share a name, size)."""
    client.select_folder(folder, readonly=True)
    data = client.fetch([uid], ["RFC822"]).get(uid)
    raw = data.get(b"RFC822") if data else None
    if not raw:
        return None
    msg: EmailMessage = email.message_from_bytes(raw, policy=default_policy)

    fallback = None
    for part in msg.walk():
        if part.is_multipart():
            continue
        disposition = part.get_content_disposition()
        if disposition != "attachment" and not (disposition == "inline" and part.get_filename()):
            continue
        if (part.get_filename() or "attachment") != filename:
            continue
        payload = part.get_payload(decode=True) or b""
        if len(payload) == size_bytes:
            return payload
        if fallback is None:
            fallback = payload
    return fallback


def fetch_flag_updates(client: IMAPClient, folder: str) -> dict[int, tuple[bool, bool]]:
    """Returns {uid: (is_read, is_starred)} for the newest messages in the folder."""
    client.select_folder(folder, readonly=True)
    uids = sorted(client.search("ALL"))[-FLAG_REFRESH_LIMIT:]
    if not uids:
        return {}
    out = {}
    for uid, data in client.fetch(uids, ["FLAGS"]).items():
        flags = {f.decode().lower() if isinstance(f, bytes) else str(f).lower()
                 for f in data.get(b"FLAGS", ())}
        out[uid] = ("\\seen" in flags, "\\flagged" in flags)
    return out
