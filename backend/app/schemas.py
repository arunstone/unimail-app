from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


# ---- Auth ----
class RegisterIn(BaseModel):
    name: str
    email: EmailStr
    password: str


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    id: str
    name: str
    email: str
    is_verified: bool = True

    class Config:
        from_attributes = True


# ---- Accounts ----
class AccountOut(BaseModel):
    id: str
    provider: str
    email_address: str
    display_name: str
    signature: str = ""
    is_active: bool
    last_synced_at: datetime | None
    sync_status: str
    unread_count: int = 0

    class Config:
        from_attributes = True


class AccountPatchIn(BaseModel):
    display_name: str | None = None
    signature: str | None = None


class AutoconfigOut(BaseModel):
    found: bool
    source: str = ""  # isp-db | autoconfig | probe
    imap_host: str | None = None
    imap_port: int | None = None
    smtp_host: str | None = None
    smtp_port: int | None = None
    username: str | None = None  # suggested login (full address or local part)


class ImapAccountIn(BaseModel):
    email_address: str
    imap_host: str
    imap_port: int = 993
    imap_username: str
    imap_password: str
    smtp_host: str | None = None
    smtp_port: int | None = 587
    display_name: str = ""


# ---- Emails ----
class EmailRowOut(BaseModel):
    id: str
    account_id: str
    folder_role: str
    # "__local_draft__" marks drafts editable in the app
    folder_name: str = ""
    from_name: str
    from_email: str
    subject: str
    preview: str
    is_read: bool
    is_starred: bool
    has_attachments: bool
    received_at: datetime

    class Config:
        from_attributes = True


class AttachmentOut(BaseModel):
    id: str
    filename: str
    content_type: str
    size_bytes: int

    class Config:
        from_attributes = True


class EmailDetailOut(EmailRowOut):
    to_recipients: list[dict]
    cc_recipients: list[dict]
    bcc_recipients: list[dict]
    body_text: str | None
    body_html: str | None
    attachments: list[AttachmentOut] = []


class EmailPatchIn(BaseModel):
    is_read: bool | None = None
    is_starred: bool | None = None
    folder_role: str | None = None  # archive / trash moves


class SendEmailIn(BaseModel):
    account_id: str
    to: list[EmailStr]
    cc: list[EmailStr] = []
    bcc: list[EmailStr] = []
    subject: str
    body: str
    body_html: str | None = None
    attachment_ids: list[str] = []  # Upload ids not yet attached to a draft
    draft_id: str | None = None  # send this draft (its attachments included)
    reply_to_id: str | None = None


class UploadOut(BaseModel):
    id: str
    filename: str
    content_type: str
    size_bytes: int

    class Config:
        from_attributes = True


# ---- Drafts ----
class DraftIn(BaseModel):
    account_id: str
    # free-form strings: a draft may hold half-typed addresses
    to: list[str] = []
    cc: list[str] = []
    bcc: list[str] = []
    subject: str = ""
    body: str = ""
    body_html: str | None = None
    attachment_ids: list[str] = []  # Upload ids to attach
    removed_attachment_ids: list[str] = []  # Attachment ids to detach (updates)


class NewMailItem(BaseModel):
    id: str
    from_name: str
    from_email: str
    subject: str
    account_email: str


class NewMailOut(BaseModel):
    count: int
    latest: list[NewMailItem] = []
    now: datetime  # server clock; pass back as ?since= on the next poll


# ---- Filters ----
class FilterConditionIn(BaseModel):
    field: str  # from | to | subject | body
    op: str = "contains"  # contains | not_contains | equals
    value: str


class FilterActionsIn(BaseModel):
    move_to: str | None = None  # trash | spam | archive
    label_id: str | None = None
    mark_read: bool = False
    star: bool = False


class FilterRuleIn(BaseModel):
    name: str
    account_id: str | None = None
    match_type: str = "all"  # all | any
    conditions: list[FilterConditionIn]
    actions: FilterActionsIn
    enabled: bool = True


class FilterRuleOut(FilterRuleIn):
    id: str
    position: int = 0
    created_at: datetime


class ThreadMessageOut(EmailRowOut):
    to_recipients: list[dict]
    body_text: str | None
    body_html: str | None
    attachments: list[AttachmentOut] = []
    is_mine: bool = False


# ---- Labels ----
class LabelCreateIn(BaseModel):
    name: str
    email_ids: list[str] = []


class LabelPatchIn(BaseModel):
    name: str | None = None
    order: list[str] | None = None  # email ids in the new display order


class LabelEmailAddIn(BaseModel):
    email_id: str


class LabelOut(BaseModel):
    id: str
    name: str
    email_count: int
    created_at: datetime


class TimelineMessageOut(EmailRowOut):
    to_recipients: list[dict]
    is_mine: bool = False
    position: int = 0


class LabelDetailOut(LabelOut):
    emails: list[TimelineMessageOut] = []


# ---- Contacts ----
class ContactOut(BaseModel):
    id: str
    name: str
    email: str
    account_ids: list[str]
    email_count: int
    is_manual: bool = False
    phone: str = ""
    notes: str = ""


class ContactCreateIn(BaseModel):
    name: str = ""
    email: EmailStr
    phone: str = ""
    notes: str = ""


class ContactPatchIn(BaseModel):
    name: str | None = None
    email: EmailStr | None = None
    phone: str | None = None
    notes: str | None = None


# ---- Summary ----
class FolderCount(BaseModel):
    folder: str
    unread: int
    total: int


class AccountSummary(BaseModel):
    account_id: str
    email_address: str
    provider: str
    folders: list[FolderCount]


class SummaryOut(BaseModel):
    consolidated: list[FolderCount]
    accounts: list[AccountSummary]


class SyncStatusOut(BaseModel):
    account_id: str
    sync_status: str
    last_synced_at: datetime | None
    sync_error: str | None


# ---- Junk filter ----
class JunkStatsOut(BaseModel):
    enabled: bool
    spam_trained: int
    ham_trained: int
    min_needed: int
    active: bool  # enabled AND trained past the minimum → scoring new mail


class JunkSettingsIn(BaseModel):
    enabled: bool


# ---- Calendar & tasks ----
class EventIn(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    location: str = ""
    description: str = ""
    starts_at: datetime
    ends_at: datetime | None = None
    all_day: bool = False


class EventPatchIn(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=255)
    location: str | None = None
    description: str | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    all_day: bool | None = None
    status: str | None = Field(None, pattern="^(confirmed|tentative|cancelled)$")


class EventOut(BaseModel):
    id: str
    title: str
    location: str
    description: str
    starts_at: datetime
    ends_at: datetime | None
    all_day: bool
    source: str
    organizer: str
    status: str
    email_id: str | None

    class Config:
        from_attributes = True


class TaskIn(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    notes: str = ""
    due_at: datetime | None = None


class TaskPatchIn(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=255)
    notes: str | None = None
    due_at: datetime | None = None
    done: bool | None = None


class TaskOut(BaseModel):
    id: str
    title: str
    notes: str
    due_at: datetime | None
    done: bool
    created_at: datetime

    class Config:
        from_attributes = True


# ---- Saved searches ----
class SavedSearchIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    query: str = Field(min_length=1, max_length=255)
    file_type: str | None = Field(None, pattern="^(pdf|image|doc|sheet|archive)$")


class SavedSearchOut(BaseModel):
    id: str
    name: str
    query: str
    file_type: str | None
    count: int = 0

    class Config:
        from_attributes = True
