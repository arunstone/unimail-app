import json
import logging
import re
from datetime import datetime, timezone

from urllib.parse import quote

import bleach
from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    Query,
    Response,
    UploadFile,
)
from fastapi.responses import StreamingResponse
from sqlalchemy import case, func, or_
from sqlalchemy.orm import Session, selectinload

from ..database import get_db
from ..deps import get_current_user
from ..models import Attachment, Email, EmailAccount, Upload, User
from ..schemas import (
    AccountSummary,
    EmailDetailOut,
    EmailPatchIn,
    EmailRowOut,
    FolderCount,
    NewMailItem,
    NewMailOut,
    SendEmailIn,
    SummaryOut,
    ThreadMessageOut,
    UploadOut,
)
from ..services import imap_actions, imap_service, junk_service, storage
from ..services.smtp_service import send_email
from ..services.sync_service import connect_account

logger = logging.getLogger("unimail.emails")

router = APIRouter(prefix="/api/emails", tags=["emails"])

FOLDERS = ["inbox", "sent", "drafts", "starred", "spam", "trash"]

ALLOWED_TAGS = [
    "a", "b", "i", "u", "em", "strong", "p", "br", "div", "span", "ul", "ol", "li",
    "blockquote", "pre", "code", "h1", "h2", "h3", "h4", "h5", "h6", "table", "thead",
    "tbody", "tr", "td", "th", "img", "hr", "font", "center", "small", "sub", "sup",
]
ALLOWED_ATTRS = {
    "a": ["href", "title"],
    "img": ["src", "alt", "width", "height"],
    "*": ["style", "align", "valign", "width", "height", "color", "bgcolor"],
}


def _like(term: str) -> str:
    """Contains-pattern with LIKE wildcards in the user's text escaped."""
    escaped = term.replace("\\", "\\\\").replace("%", r"\%").replace("_", r"\_")
    return f"%{escaped}%"


def _recipient_pattern(address: str) -> str:
    """Match an exact address inside a stored JSON recipient list, instead of
    a bare substring (which would also hit jimbob@x.com for bob@x.com)."""
    escaped = address.replace("\\", "\\\\").replace("%", r"\%").replace("_", r"\_")
    return f'%"email": "{escaped}"%'


def _own_email(db: Session, user: User, email_id: str) -> Email:
    row = db.get(Email, email_id)
    if not row or row.account.user_id != user.id:
        raise HTTPException(404, "Email not found")
    return row


# attachment file-type categories for the ?file_type= filter
FILE_TYPE_MATCHERS: dict[str, list] = {
    "pdf": [Attachment.content_type == "application/pdf",
            Attachment.filename.ilike("%.pdf")],
    "image": [Attachment.content_type.ilike("image/%")],
    "doc": [Attachment.content_type.ilike("%msword%"),
            Attachment.content_type.ilike("%wordprocessingml%"),
            Attachment.filename.ilike("%.doc"),
            Attachment.filename.ilike("%.docx")],
    "sheet": [Attachment.content_type.ilike("%spreadsheetml%"),
              Attachment.content_type.ilike("%ms-excel%"),
              Attachment.content_type == "text/csv",
              Attachment.filename.ilike("%.xls"),
              Attachment.filename.ilike("%.xlsx"),
              Attachment.filename.ilike("%.csv")],
    "archive": [Attachment.content_type.ilike("%zip%"),
                Attachment.content_type.ilike("%compressed%"),
                Attachment.content_type.ilike("%x-tar%"),
                Attachment.filename.ilike("%.zip"),
                Attachment.filename.ilike("%.rar"),
                Attachment.filename.ilike("%.7z"),
                Attachment.filename.ilike("%.tar.gz")],
}


def build_email_query(db: Session, user: User, account_id: str | None = None,
                      folder: str = "inbox", search: str = "",
                      file_type: str | None = None):
    """Shared filter builder for email listing, saved-search counts etc."""
    q = db.query(Email).join(EmailAccount).filter(EmailAccount.user_id == user.id)
    if account_id:
        q = q.filter(Email.account_id == account_id)
    if folder == "starred":
        q = q.filter(Email.is_starred.is_(True), Email.folder_role.notin_(["trash", "spam"]))
    elif folder == "all":
        q = q.filter(Email.folder_role.notin_(["trash", "spam"]))
    else:
        q = q.filter(Email.folder_role == folder)
    if search:
        like = _like(search)
        q = q.filter(
            or_(
                Email.subject.ilike(like, escape="\\"),
                Email.body_text.ilike(like, escape="\\"),
                Email.preview.ilike(like, escape="\\"),
                Email.from_email.ilike(like, escape="\\"),
                Email.from_name.ilike(like, escape="\\"),
            )
        )
    if file_type in FILE_TYPE_MATCHERS:
        q = q.join(Attachment).filter(or_(*FILE_TYPE_MATCHERS[file_type])).distinct()
    return q


@router.get("", response_model=list[EmailRowOut])
def list_emails(
    account_id: str | None = None,
    folder: str = "inbox",
    search: str = "",
    file_type: str | None = Query(None, pattern="^(pdf|image|doc|sheet|archive)$"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = build_email_query(db, user, account_id, folder, search, file_type)
    return (
        q.order_by(Email.received_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )


@router.get("/summary", response_model=SummaryOut)
def summary(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    accounts = db.query(EmailAccount).filter(EmailAccount.user_id == user.id).all()
    rows = (
        db.query(
            Email.account_id,
            Email.folder_role,
            func.count(Email.id),
            func.sum(case((Email.is_read.is_(False), 1), else_=0)),
            func.sum(case((Email.is_starred.is_(True), 1), else_=0)),
        )
        .join(EmailAccount)
        .filter(EmailAccount.user_id == user.id)
        .group_by(Email.account_id, Email.folder_role)
        .all()
    )

    per_account: dict[str, dict[str, FolderCount]] = {}
    for acc in accounts:
        per_account[acc.id] = {f: FolderCount(folder=f, unread=0, total=0) for f in FOLDERS}
    starred_unread: dict[str, int] = {}
    for account_id, role, total, unread, starred in rows:
        if account_id not in per_account:
            continue
        if role in per_account[account_id]:
            per_account[account_id][role] = FolderCount(
                folder=role, unread=int(unread or 0), total=int(total or 0)
            )
        if role not in ("trash", "spam"):
            fc = per_account[account_id]["starred"]
            per_account[account_id]["starred"] = FolderCount(
                folder="starred", unread=fc.unread, total=fc.total + int(starred or 0)
            )

    consolidated = {f: FolderCount(folder=f, unread=0, total=0) for f in FOLDERS}
    for counts in per_account.values():
        for f in FOLDERS:
            consolidated[f] = FolderCount(
                folder=f,
                unread=consolidated[f].unread + counts[f].unread,
                total=consolidated[f].total + counts[f].total,
            )

    return SummaryOut(
        consolidated=[consolidated[f] for f in FOLDERS],
        accounts=[
            AccountSummary(
                account_id=acc.id,
                email_address=acc.email_address,
                provider=acc.provider,
                folders=[per_account[acc.id][f] for f in FOLDERS],
            )
            for acc in accounts
        ],
    )


# declared before the /{email_id} routes so "new" / "uploads" aren't
# captured as email ids
@router.get("/new", response_model=NewMailOut)
def new_mail(
    since: datetime,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Inbox messages synced into the app after `since` — the browser polls
    this to fire desktop notifications."""
    if since.tzinfo is None:
        since = since.replace(tzinfo=timezone.utc)
    q = (
        db.query(Email, EmailAccount.email_address)
        .join(EmailAccount)
        .filter(
            EmailAccount.user_id == user.id,
            Email.folder_role == "inbox",
            Email.created_at > since,
        )
        .order_by(Email.created_at.desc())
    )
    count = q.count()
    latest = [
        NewMailItem(id=e.id, from_name=e.from_name, from_email=e.from_email,
                    subject=e.subject, account_email=account_email)
        for e, account_email in q.limit(5).all()
    ]
    return NewMailOut(count=count, latest=latest, now=datetime.now(timezone.utc))


MAX_UPLOAD_BYTES = 25 * 1024 * 1024


@router.post("/uploads", response_model=UploadOut, status_code=201)
async def upload_attachment(
    file: UploadFile,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Stage a compose attachment in object storage; reference the returned
    id in send/draft payloads."""
    if not storage.enabled():
        raise HTTPException(503, "Attachment storage is not configured")
    content = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "Attachment exceeds the 25 MB limit")
    row = Upload(
        user_id=user.id,
        filename=file.filename or "attachment",
        content_type=file.content_type or "application/octet-stream",
        size_bytes=len(content),
    )
    db.add(row)
    db.flush()
    storage.put(row.id, content, row.content_type)
    db.commit()
    return row


@router.delete("/uploads/{upload_id}", status_code=204)
def delete_upload(upload_id: str, user: User = Depends(get_current_user),
                  db: Session = Depends(get_db)):
    row = db.get(Upload, upload_id)
    if not row or row.user_id != user.id:
        raise HTTPException(404, "Upload not found")
    db.delete(row)
    db.commit()
    try:
        storage.delete_many([upload_id])
    except Exception:
        logger.warning("Could not delete stored upload %s", upload_id, exc_info=True)


_SUBJECT_PREFIX = re.compile(r"^\s*((re|fwd?|fw)\s*:\s*)+", re.IGNORECASE)


def _sanitize_html(body_html: str | None) -> str | None:
    if not body_html:
        return body_html
    return bleach.clean(
        body_html, tags=ALLOWED_TAGS, attributes=ALLOWED_ATTRS,
        protocols=["http", "https", "mailto", "data"], strip=True,
    )


@router.get("/{email_id}/thread", response_model=list[ThreadMessageOut])
def email_thread(
    email_id: str,
    limit: int = Query(100, ge=1, le=200),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """All messages in the same conversation, oldest first. Grouped by
    normalised subject (Re:/Fwd: stripped) plus the counterpart address,
    since References headers are not stored."""
    root = _own_email(db, user, email_id)

    my_addresses = {
        a.email_address.lower()
        for a in db.query(EmailAccount).filter(EmailAccount.user_id == user.id)
    }
    if root.from_email.lower() in my_addresses:
        recipients = json.loads(root.to_recipients or "[]")
        counterpart = (recipients[0].get("email", "") if recipients else "").lower()
    else:
        counterpart = root.from_email.lower()

    core = _SUBJECT_PREFIX.sub("", (root.subject or "").lower()).strip()

    q = (
        db.query(Email)
        .options(selectinload(Email.attachments))
        .join(EmailAccount)
        .filter(EmailAccount.user_id == user.id)
        .filter(Email.folder_role.notin_(["trash", "spam"]))
    )
    if core:
        norm = func.trim(
            func.regexp_replace(
                func.lower(Email.subject), r"^\s*((re|fwd?|fw)\s*:\s*)+", "", "i"
            )
        )
        q = q.filter(norm == core)
    if counterpart:
        like = _recipient_pattern(counterpart)
        q = q.filter(
            or_(
                func.lower(Email.from_email) == counterpart,
                Email.to_recipients.ilike(like, escape="\\"),
                Email.cc_recipients.ilike(like, escape="\\"),
            )
        )
    if not core and not counterpart:
        q = q.filter(Email.id == root.id)

    rows = q.order_by(Email.received_at.asc()).limit(limit).all()
    if not any(r.id == root.id for r in rows):
        rows.append(root)

    return [
        ThreadMessageOut(
            **EmailRowOut.model_validate(r).model_dump(),
            to_recipients=json.loads(r.to_recipients or "[]"),
            body_text=r.body_text,
            body_html=_sanitize_html(r.body_html),
            attachments=r.attachments,
            is_mine=r.from_email.lower() in my_addresses,
        )
        for r in rows
    ]


@router.get("/{email_id}", response_model=EmailDetailOut)
def get_email(email_id: str, user: User = Depends(get_current_user),
              db: Session = Depends(get_db)):
    row = (
        db.query(Email)
        .options(selectinload(Email.attachments))
        .filter(Email.id == email_id)
        .first()
    )
    if not row or row.account.user_id != user.id:
        raise HTTPException(404, "Email not found")

    body_html = row.body_html
    if body_html:
        body_html = bleach.clean(
            body_html, tags=ALLOWED_TAGS, attributes=ALLOWED_ATTRS,
            protocols=["http", "https", "mailto", "data"], strip=True,
        )

    detail = EmailDetailOut(
        **EmailRowOut.model_validate(row).model_dump(),
        to_recipients=json.loads(row.to_recipients or "[]"),
        cc_recipients=json.loads(row.cc_recipients or "[]"),
        bcc_recipients=json.loads(row.bcc_recipients or "[]"),
        body_text=row.body_text,
        body_html=body_html,
        attachments=row.attachments,
    )
    return detail


@router.get("/{email_id}/attachments/{attachment_id}/download")
def download_attachment(email_id: str, attachment_id: str,
                        user: User = Depends(get_current_user),
                        db: Session = Depends(get_db)):
    row = _own_email(db, user, email_id)
    att = db.get(Attachment, attachment_id)
    if not att or att.email_id != row.id:
        raise HTTPException(404, "Attachment not found")

    disposition = f"attachment; filename*=UTF-8''{quote(att.filename)}"

    if att.storage_key and storage.enabled():
        try:
            body, size = storage.get(att.storage_key)
            return StreamingResponse(
                body.iter_chunks(),
                media_type=att.content_type or "application/octet-stream",
                headers={"Content-Disposition": disposition,
                         "Content-Length": str(size)},
            )
        except Exception:
            logger.warning("Stored attachment %s unreadable, falling back to IMAP",
                           att.id, exc_info=True)

    if not row.imap_uid or not row.folder_name:
        raise HTTPException(404, "Attachment content is not available for this email")

    try:
        client = connect_account(db, row.account)
        try:
            content = imap_service.fetch_attachment(
                client, row.folder_name, row.imap_uid, att.filename, att.size_bytes
            )
        finally:
            try:
                client.logout()
            except Exception:
                pass
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(502, f"Could not fetch attachment from mail server: {exc}")

    if content is None:
        raise HTTPException(404, "Attachment no longer exists on the mail server")

    # backfill storage so the next download skips IMAP (rows from before the
    # storage layer existed have storage_key NULL)
    if storage.enabled():
        try:
            storage.put(att.id, content, att.content_type)
            att.storage_key = att.id
            db.commit()
        except Exception:
            logger.warning("Storage backfill failed for attachment %s",
                           att.id, exc_info=True)

    return Response(
        content=content,
        media_type=att.content_type or "application/octet-stream",
        headers={"Content-Disposition": disposition},
    )


@router.patch("/{email_id}", response_model=EmailRowOut)
def patch_email(email_id: str, data: EmailPatchIn, background: BackgroundTasks,
                user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    row = _own_email(db, user, email_id)
    flags_changed = False
    moved_to = None
    if data.is_read is not None and data.is_read != row.is_read:
        row.is_read = data.is_read
        flags_changed = True
    if data.is_starred is not None and data.is_starred != row.is_starred:
        row.is_starred = data.is_starred
        flags_changed = True
    if data.folder_role is not None:
        if data.folder_role not in FOLDERS + ["archive"]:
            raise HTTPException(400, "Invalid folder")
        if data.folder_role != row.folder_role:
            row.folder_role = data.folder_role
            moved_to = data.folder_role
    db.commit()
    db.refresh(row)
    # a manual move into/out of spam is also a lesson for the junk filter
    if moved_to == "spam" or (moved_to == "inbox" and row.spam_trained == "spam"):
        try:
            junk_service.train(db, user.id, row, as_spam=moved_to == "spam")
        except Exception:
            logger.warning("Junk training on move failed", exc_info=True)
    # mirror the change on the mail server so the next sync doesn't revert
    # it (flags first: the move detaches the row's UID)
    if flags_changed:
        background.add_task(imap_actions.push_flags, row.id)
    if moved_to:
        background.add_task(imap_actions.push_move, row.id, moved_to)
    return row


@router.post("/{email_id}/spam", response_model=EmailRowOut)
def mark_spam(email_id: str, background: BackgroundTasks,
              user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Train the junk filter with this message as spam and move it to the
    Spam folder (mirrored to the mail server)."""
    row = _own_email(db, user, email_id)
    junk_service.train(db, user.id, row, as_spam=True)
    if row.folder_role != "spam":
        row.folder_role = "spam"
        db.commit()
        background.add_task(imap_actions.push_move, row.id, "spam")
    db.refresh(row)
    return row


@router.post("/{email_id}/not-spam", response_model=EmailRowOut)
def mark_not_spam(email_id: str, background: BackgroundTasks,
                  user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Train the junk filter with this message as not spam; if it sits in
    the Spam folder, move it back to the inbox."""
    row = _own_email(db, user, email_id)
    junk_service.train(db, user.id, row, as_spam=False)
    if row.folder_role == "spam":
        row.folder_role = "inbox"
        db.commit()
        background.add_task(imap_actions.push_move, row.id, "inbox")
    db.refresh(row)
    return row


@router.post("/send", status_code=202)
def send(data: SendEmailIn, background: BackgroundTasks,
         user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    account = db.get(EmailAccount, data.account_id)
    if not account or account.user_id != user.id:
        raise HTTPException(404, "Account not found")

    in_reply_to = None
    if data.reply_to_id:
        original = _own_email(db, user, data.reply_to_id)
        in_reply_to = original.message_id

    draft = None
    if data.draft_id:
        draft = _own_email(db, user, data.draft_id)
        if draft.folder_role != "drafts":
            raise HTTPException(400, "draft_id does not point at a draft")

    # gather attachment payloads: the draft's stored attachments plus any
    # freshly staged uploads
    uploads: list[Upload] = []
    if data.attachment_ids:
        uploads = (
            db.query(Upload)
            .filter(Upload.id.in_(data.attachment_ids), Upload.user_id == user.id)
            .all()
        )
        if len(uploads) != len(set(data.attachment_ids)):
            raise HTTPException(404, "One of the attachments was not found")
    att_payload: list[tuple[str, str, bytes]] = []
    try:
        for att in (draft.attachments if draft else []):
            if att.storage_key:
                body, _size = storage.get(att.storage_key)
                att_payload.append((att.filename, att.content_type, body.read()))
        for up in uploads:
            body, _size = storage.get(up.id)
            att_payload.append((up.filename, up.content_type, body.read()))
    except Exception as exc:
        raise HTTPException(502, f"Could not read stored attachment: {exc}")

    body_html = _sanitize_html(data.body_html)
    try:
        msg = send_email(
            db, account, [str(a) for a in data.to], [str(a) for a in data.cc],
            [str(a) for a in data.bcc], data.subject, data.body, in_reply_to,
            body_html=body_html, attachments=att_payload,
        )
    except Exception as exc:
        raise HTTPException(502, f"Failed to send: {exc}")

    # reflect it locally right away (provider will also place it in Sent).
    # A sent draft is repurposed in place — its attachment rows and their
    # stored objects come along for free.
    now = datetime.now(timezone.utc)
    if draft is not None:
        sent_row = draft
        sent_row.account_id = account.id
        sent_row.imap_uid = None
    else:
        sent_row = Email(account_id=account.id)
        db.add(sent_row)
    sent_row.folder_role = "sent"
    sent_row.folder_name = "__local_sent__"
    sent_row.message_id = msg.get("Message-ID")
    sent_row.from_name = account.display_name or account.email_address
    sent_row.from_email = account.email_address
    sent_row.to_recipients = json.dumps([{"name": "", "email": str(a)} for a in data.to])
    sent_row.cc_recipients = json.dumps([{"name": "", "email": str(a)} for a in data.cc])
    sent_row.bcc_recipients = json.dumps([{"name": "", "email": str(a)} for a in data.bcc])
    sent_row.subject = data.subject
    sent_row.preview = data.body[:80]
    sent_row.body_text = data.body
    sent_row.body_html = body_html
    sent_row.is_read = True
    sent_row.received_at = now
    db.flush()
    # staged uploads become regular attachment rows on the sent email,
    # keeping the already-stored object (key = upload id)
    for up in uploads:
        db.add(Attachment(email_id=sent_row.id, filename=up.filename,
                          content_type=up.content_type, size_bytes=up.size_bytes,
                          storage_key=up.id))
        db.delete(up)
    sent_row.has_attachments = bool(att_payload)
    db.commit()
    # plain-IMAP servers don't store a Sent copy on SMTP send; APPEND one so
    # other clients see it too. Gmail/Outlook/Yahoo store their own copy,
    # which sync reclaims into sent_row by Message-ID (no duplicate).
    if account.provider == "imap":
        background.add_task(imap_actions.push_sent_copy, sent_row.id, msg.as_bytes())
    return {"status": "sent", "email_id": sent_row.id}
