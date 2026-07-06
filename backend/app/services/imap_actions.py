"""Push local changes back to the IMAP server: read/star flags, folder
moves, and copies of sent mail. Run as FastAPI background tasks (own DB
session) so API responses stay fast; failures are logged and the next
sync simply reflects whatever the server state is."""

import logging

from ..database import SessionLocal
from ..models import Email, Folder
from .sync_service import connect_account

logger = logging.getLogger("unimail.imap_actions")


def _pushable(row: Email | None) -> bool:
    return bool(row and row.imap_uid and row.folder_name
                and not row.folder_name.startswith("__"))


def push_flags(email_id: str) -> None:
    """Mirror is_read/is_starred to the server so sync doesn't revert them."""
    db = SessionLocal()
    try:
        row = db.get(Email, email_id)
        if not _pushable(row):
            return
        client = connect_account(db, row.account)
        try:
            client.select_folder(row.folder_name)
            uid = [row.imap_uid]
            if row.is_read:
                client.add_flags(uid, [b"\\Seen"])
            else:
                client.remove_flags(uid, [b"\\Seen"])
            if row.is_starred:
                client.add_flags(uid, [b"\\Flagged"])
            else:
                client.remove_flags(uid, [b"\\Flagged"])
        finally:
            try:
                client.logout()
            except Exception:
                pass
    except Exception:
        logger.exception("Failed to push flags for email %s", email_id)
    finally:
        db.close()


def push_move(email_id: str, target_role: str) -> None:
    """Move the message into the account's folder with the given role.
    Stays local-only when no such folder is synced (e.g. archive)."""
    db = SessionLocal()
    try:
        row = db.get(Email, email_id)
        # a detached UID (row moved server-side, not yet re-synced) can be
        # recovered by Message-ID so e.g. "Not spam" right after the junk
        # filter moved the message still reaches the server
        recover_uid = (
            row is not None and row.imap_uid is None and row.message_id
            and row.folder_name and not row.folder_name.startswith("__")
        )
        if not _pushable(row) and not recover_uid:
            return
        target = (
            db.query(Folder)
            .filter(Folder.account_id == row.account_id, Folder.role == target_role)
            .first()
        )
        if target is None or target.name == row.folder_name:
            return
        client = connect_account(db, row.account)
        try:
            client.select_folder(row.folder_name)
            if row.imap_uid is None:
                found = client.search(["HEADER", "Message-ID", row.message_id])
                if not found:
                    return
                row.imap_uid = found[0]
            try:
                client.move([row.imap_uid], target.name)
            except Exception:  # server without MOVE capability
                client.copy([row.imap_uid], target.name)
                client.add_flags([row.imap_uid], [b"\\Deleted"])
                client.expunge()
        finally:
            try:
                client.logout()
            except Exception:
                pass
        # UID in the target folder is unknown; the next sync re-fetches the
        # message there and reclaims this row by Message-ID.
        row.folder_name = target.name
        row.imap_uid = None
        db.commit()
    except Exception:
        logger.exception("Failed to move email %s to %s", email_id, target_role)
    finally:
        db.close()


def push_sent_copy(email_id: str, raw_message: bytes) -> None:
    """APPEND a just-sent message to the account's Sent folder. Only needed
    for plain-IMAP servers — Gmail/Outlook/Yahoo store their own copy."""
    db = SessionLocal()
    try:
        row = db.get(Email, email_id)
        if not row:
            return
        sent = (
            db.query(Folder)
            .filter(Folder.account_id == row.account_id, Folder.role == "sent")
            .first()
        )
        if sent is None:
            return
        client = connect_account(db, row.account)
        try:
            client.append(sent.name, raw_message, flags=[b"\\Seen"])
        finally:
            try:
                client.logout()
            except Exception:
                pass
        # leave imap_uid NULL: the next sync sees the appended copy in Sent
        # and reclaims this row by Message-ID instead of duplicating it
    except Exception:
        logger.exception("Failed to append sent copy for email %s", email_id)
    finally:
        db.close()
