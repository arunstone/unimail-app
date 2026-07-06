"""Local draft management. A draft is an Email row with folder_role="drafts"
and folder_name="__local_draft__", so it shows up in the existing drafts
folder views and counts with no extra plumbing. Staged Upload rows become
Attachment rows (same storage object) when attached to a draft."""

import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import Attachment, Email, EmailAccount, EmailEmbedding, LabelEmail, Upload, User
from ..schemas import DraftIn
from ..services import storage
from .emails import _own_email, _sanitize_html

logger = logging.getLogger("unimail.drafts")

router = APIRouter(prefix="/api/drafts", tags=["drafts"])

LOCAL_DRAFT = "__local_draft__"


def _addr_json(addrs: list[str]) -> str:
    return json.dumps([{"name": "", "email": a} for a in addrs if a.strip()])


def _out(row: Email) -> dict:
    return {
        "id": row.id,
        "attachments": [
            {"id": a.id, "filename": a.filename, "content_type": a.content_type,
             "size_bytes": a.size_bytes}
            for a in row.attachments
        ],
    }


def _apply(db: Session, row: Email, data: DraftIn, user: User) -> None:
    row.to_recipients = _addr_json(data.to)
    row.cc_recipients = _addr_json(data.cc)
    row.bcc_recipients = _addr_json(data.bcc)
    row.subject = data.subject
    row.body_text = data.body
    row.body_html = _sanitize_html(data.body_html)
    row.preview = data.body[:80]
    row.received_at = datetime.now(timezone.utc)  # keeps latest draft on top
    db.flush()

    if data.removed_attachment_ids:
        removed = (
            db.query(Attachment)
            .filter(Attachment.id.in_(data.removed_attachment_ids),
                    Attachment.email_id == row.id)
            .all()
        )
        keys = [a.storage_key for a in removed if a.storage_key]
        for a in removed:
            db.delete(a)
        if keys:
            try:
                storage.delete_many(keys)
            except Exception:
                logger.warning("Could not delete detached draft attachments", exc_info=True)

    if data.attachment_ids:
        uploads = (
            db.query(Upload)
            .filter(Upload.id.in_(data.attachment_ids), Upload.user_id == user.id)
            .all()
        )
        if len(uploads) != len(set(data.attachment_ids)):
            raise HTTPException(404, "One of the attachments was not found")
        for up in uploads:
            db.add(Attachment(email_id=row.id, filename=up.filename,
                              content_type=up.content_type, size_bytes=up.size_bytes,
                              storage_key=up.id))
            db.delete(up)
    db.flush()
    row.has_attachments = (
        db.query(Attachment.id).filter(Attachment.email_id == row.id).first() is not None
    )


@router.post("", status_code=201)
def create_draft(data: DraftIn, user: User = Depends(get_current_user),
                 db: Session = Depends(get_db)):
    account = db.get(EmailAccount, data.account_id)
    if not account or account.user_id != user.id:
        raise HTTPException(404, "Account not found")
    row = Email(
        account_id=account.id,
        folder_role="drafts",
        folder_name=LOCAL_DRAFT,
        from_name=account.display_name or account.email_address,
        from_email=account.email_address,
        is_read=True,
    )
    db.add(row)
    _apply(db, row, data, user)
    db.commit()
    return _out(row)


@router.put("/{draft_id}")
def update_draft(draft_id: str, data: DraftIn,
                 user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    row = _own_email(db, user, draft_id)
    if row.folder_role != "drafts" or row.folder_name != LOCAL_DRAFT:
        raise HTTPException(400, "Only drafts saved in Unimail can be updated")
    account = db.get(EmailAccount, data.account_id)
    if account and account.user_id == user.id:
        row.account_id = account.id
        row.from_name = account.display_name or account.email_address
        row.from_email = account.email_address
    _apply(db, row, data, user)
    db.commit()
    return _out(row)


@router.delete("/{draft_id}", status_code=204)
def delete_draft(draft_id: str, user: User = Depends(get_current_user),
                 db: Session = Depends(get_db)):
    row = _own_email(db, user, draft_id)
    if row.folder_role != "drafts" or row.folder_name != LOCAL_DRAFT:
        raise HTTPException(400, "Only drafts saved in Unimail can be deleted here")
    keys = [a.storage_key for a in row.attachments if a.storage_key]
    db.query(LabelEmail).filter(LabelEmail.email_id == row.id).delete(
        synchronize_session=False)
    db.query(EmailEmbedding).filter(EmailEmbedding.email_id == row.id).delete(
        synchronize_session=False)
    db.query(Attachment).filter(Attachment.email_id == row.id).delete(
        synchronize_session=False)
    db.delete(row)
    db.commit()
    if keys:
        try:
            storage.delete_many(keys)
        except Exception:
            logger.warning("Could not delete stored draft attachments", exc_info=True)
