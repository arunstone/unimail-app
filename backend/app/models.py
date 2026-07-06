import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    verify_token: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    verify_sent_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    reset_token: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    reset_sent_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # adaptive junk filter on/off (training is kept either way)
    junk_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    accounts: Mapped[list["EmailAccount"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class EmailAccount(Base):
    __tablename__ = "email_accounts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    provider: Mapped[str] = mapped_column(String(20))  # gmail | yahoo | outlook | imap
    email_address: Mapped[str] = mapped_column(String(255))
    display_name: Mapped[str] = mapped_column(String(120), default="")

    # OAuth tokens / IMAP password, encrypted with Fernet
    access_token_enc: Mapped[str | None] = mapped_column(Text, nullable=True)
    refresh_token_enc: Mapped[str | None] = mapped_column(Text, nullable=True)
    token_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Manual IMAP settings
    imap_host: Mapped[str | None] = mapped_column(String(255), nullable=True)
    imap_port: Mapped[int | None] = mapped_column(Integer, nullable=True)
    imap_username: Mapped[str | None] = mapped_column(String(255), nullable=True)
    imap_password_enc: Mapped[str | None] = mapped_column(Text, nullable=True)
    smtp_host: Mapped[str | None] = mapped_column(String(255), nullable=True)
    smtp_port: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # appended to outgoing messages composed in the app
    signature: Mapped[str] = mapped_column(Text, default="")

    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_synced_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    sync_status: Mapped[str] = mapped_column(String(20), default="pending")  # pending|syncing|ok|error
    sync_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    user: Mapped["User"] = relationship(back_populates="accounts")
    emails: Mapped[list["Email"]] = relationship(
        back_populates="account", cascade="all, delete-orphan"
    )
    folders: Mapped[list["Folder"]] = relationship(
        back_populates="account", cascade="all, delete-orphan"
    )

    __table_args__ = (UniqueConstraint("user_id", "email_address", name="uq_user_account"),)


class Folder(Base):
    __tablename__ = "folders"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    account_id: Mapped[str] = mapped_column(ForeignKey("email_accounts.id"), index=True)
    name: Mapped[str] = mapped_column(String(255))  # provider's raw folder name
    # normalised role: inbox|sent|drafts|starred|spam|trash|custom
    role: Mapped[str] = mapped_column(String(20), default="custom")
    uidvalidity: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    last_seen_uid: Mapped[int] = mapped_column(BigInteger, default=0)

    account: Mapped["EmailAccount"] = relationship(back_populates="folders")

    __table_args__ = (UniqueConstraint("account_id", "name", name="uq_account_folder"),)


class Email(Base):
    __tablename__ = "emails"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    account_id: Mapped[str] = mapped_column(ForeignKey("email_accounts.id"), index=True)
    folder_role: Mapped[str] = mapped_column(String(20), index=True)  # normalised folder
    folder_name: Mapped[str] = mapped_column(String(255), default="")
    imap_uid: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    message_id: Mapped[str | None] = mapped_column(String(512), nullable=True, index=True)

    from_name: Mapped[str] = mapped_column(String(255), default="")
    from_email: Mapped[str] = mapped_column(String(255), default="", index=True)
    to_recipients: Mapped[str] = mapped_column(Text, default="")  # JSON list
    cc_recipients: Mapped[str] = mapped_column(Text, default="")  # JSON list
    bcc_recipients: Mapped[str] = mapped_column(Text, default="")  # JSON list

    subject: Mapped[str] = mapped_column(Text, default="")
    preview: Mapped[str] = mapped_column(String(200), default="")
    body_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    body_html: Mapped[str | None] = mapped_column(Text, nullable=True)

    is_read: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    is_starred: Mapped[bool] = mapped_column(Boolean, default=False)
    has_attachments: Mapped[bool] = mapped_column(Boolean, default=False)
    # what the junk classifier was taught with this message: spam|ham|NULL
    # (recorded so re-training the other way reverses the first lesson)
    spam_trained: Mapped[str | None] = mapped_column(String(4), nullable=True)
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    account: Mapped["EmailAccount"] = relationship(back_populates="emails")
    attachments: Mapped[list["Attachment"]] = relationship(
        back_populates="email", cascade="all, delete-orphan"
    )

    __table_args__ = (
        UniqueConstraint("account_id", "folder_name", "imap_uid", name="uq_account_folder_uid"),
        Index("ix_emails_account_folder_received", "account_id", "folder_role", "received_at"),
    )


class Attachment(Base):
    __tablename__ = "attachments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    email_id: Mapped[str] = mapped_column(ForeignKey("emails.id"), index=True)
    filename: Mapped[str] = mapped_column(String(512))
    content_type: Mapped[str] = mapped_column(String(255), default="application/octet-stream")
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    # attachment content lives in S3-compatible storage under storage_key
    # (uploaded during sync); IMAP re-fetch is the fallback when NULL
    imap_part: Mapped[str | None] = mapped_column(String(32), nullable=True)
    storage_key: Mapped[str | None] = mapped_column(String(64), nullable=True)

    email: Mapped["Email"] = relationship(back_populates="attachments")


class Contact(Base):
    __tablename__ = "contacts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(255), default="")
    email: Mapped[str] = mapped_column(String(255), index=True)
    # JSON list of account ids this contact appears in
    account_ids: Mapped[str] = mapped_column(Text, default="[]")
    email_count: Mapped[int] = mapped_column(Integer, default=0)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    # address-book fields; is_manual marks contacts the user created/edited
    # themselves (protected from auto-derived name overwrites)
    is_manual: Mapped[bool] = mapped_column(Boolean, default=False)
    phone: Mapped[str] = mapped_column(String(50), default="")
    notes: Mapped[str] = mapped_column(Text, default="")

    __table_args__ = (UniqueConstraint("user_id", "email", name="uq_user_contact"),)


class Label(Base):
    __tablename__ = "labels"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    emails: Mapped[list["LabelEmail"]] = relationship(
        back_populates="label", cascade="all, delete-orphan"
    )

    __table_args__ = (UniqueConstraint("user_id", "name", name="uq_user_label"),)


class LabelEmail(Base):
    __tablename__ = "label_emails"

    label_id: Mapped[str] = mapped_column(
        ForeignKey("labels.id"), primary_key=True
    )
    email_id: Mapped[str] = mapped_column(
        ForeignKey("emails.id"), primary_key=True
    )
    position: Mapped[int] = mapped_column(Integer, default=0)

    label: Mapped["Label"] = relationship(back_populates="emails")
    email: Mapped["Email"] = relationship()


class EmailEmbedding(Base):
    """Cached embedding vector per email (JSON-encoded list of floats)."""

    __tablename__ = "email_embeddings"

    email_id: Mapped[str] = mapped_column(
        ForeignKey("emails.id"), primary_key=True
    )
    model: Mapped[str] = mapped_column(String(80))
    vector: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class Upload(Base):
    """A compose attachment uploaded ahead of send. The file bytes live in
    object storage under key = id; on send the row becomes an Attachment
    (same storage key) and is deleted. Stale rows are swept by a daily job."""

    __tablename__ = "uploads"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    filename: Mapped[str] = mapped_column(String(512))
    content_type: Mapped[str] = mapped_column(String(255), default="application/octet-stream")
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class FilterRule(Base):
    """User-defined message filter: conditions on incoming mail → actions.
    Applied to newly synced inbox messages, or on demand via /run."""

    __tablename__ = "filter_rules"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    # limit the rule to one account; NULL = all accounts
    account_id: Mapped[str | None] = mapped_column(
        ForeignKey("email_accounts.id"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(120))
    match_type: Mapped[str] = mapped_column(String(8), default="all")  # all|any
    # JSON list of {"field": from|to|subject|body, "op": contains|not_contains|equals, "value": str}
    conditions: Mapped[str] = mapped_column(Text, default="[]")
    # JSON {"move_to": role|null, "label_id": str|null, "mark_read": bool, "star": bool}
    actions: Mapped[str] = mapped_column(Text, default="{}")
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    position: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class SavedSearch(Base):
    """A saved search shown as a virtual folder in the left panel."""

    __tablename__ = "saved_searches"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    query: Mapped[str] = mapped_column(String(255))
    file_type: Mapped[str | None] = mapped_column(String(10), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    __table_args__ = (UniqueConstraint("user_id", "name", name="uq_user_saved_search"),)


class CalendarEvent(Base):
    """A calendar entry: created by hand or ingested from a meeting-invite
    (.ics / text/calendar) part of a synced email. Invite updates and
    cancellations are matched by ical_uid."""

    __tablename__ = "calendar_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    title: Mapped[str] = mapped_column(String(255), default="")
    location: Mapped[str] = mapped_column(String(255), default="")
    description: Mapped[str] = mapped_column(Text, default="")
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    all_day: Mapped[bool] = mapped_column(Boolean, default=False)
    source: Mapped[str] = mapped_column(String(10), default="manual")  # manual|invite
    ical_uid: Mapped[str | None] = mapped_column(String(255), nullable=True)
    organizer: Mapped[str] = mapped_column(String(255), default="")
    status: Mapped[str] = mapped_column(String(20), default="confirmed")  # confirmed|tentative|cancelled
    # the email the invite arrived in; detached (not deleted) on disconnect
    email_id: Mapped[str | None] = mapped_column(
        ForeignKey("emails.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    __table_args__ = (UniqueConstraint("user_id", "ical_uid", name="uq_user_ical_uid"),)


class Task(Base):
    """Simple to-do item shown next to the calendar."""

    __tablename__ = "tasks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    title: Mapped[str] = mapped_column(String(255))
    notes: Mapped[str] = mapped_column(Text, default="")
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    done: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class JunkStat(Base):
    """Per-user junk-corpus size: how many messages were trained as spam
    and as ham. The classifier only activates once both pass a minimum."""

    __tablename__ = "junk_stats"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), primary_key=True)
    spam_messages: Mapped[int] = mapped_column(Integer, default=0)
    ham_messages: Mapped[int] = mapped_column(Integer, default=0)


class JunkToken(Base):
    """Bayesian junk-filter vocabulary: per user, how many trained spam/ham
    messages contained this token."""

    __tablename__ = "junk_tokens"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), primary_key=True)
    token: Mapped[str] = mapped_column(String(64), primary_key=True)
    spam_count: Mapped[int] = mapped_column(Integer, default=0)
    ham_count: Mapped[int] = mapped_column(Integer, default=0)


class SyncLog(Base):
    __tablename__ = "sync_log"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    account_id: Mapped[str] = mapped_column(ForeignKey("email_accounts.id"), index=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="running")  # running|ok|error
    new_emails: Mapped[int] = mapped_column(Integer, default=0)
    detail: Mapped[str | None] = mapped_column(Text, nullable=True)
