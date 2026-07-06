import json

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import Contact, Email, EmailAccount, User
from ..schemas import ContactCreateIn, ContactOut, ContactPatchIn, EmailRowOut
from .emails import _like, _recipient_pattern

router = APIRouter(prefix="/api/contacts", tags=["contacts"])


def _to_out(c: Contact) -> ContactOut:
    return ContactOut(
        id=c.id, name=c.name, email=c.email,
        account_ids=json.loads(c.account_ids or "[]"),
        email_count=c.email_count,
        is_manual=c.is_manual, phone=c.phone or "", notes=c.notes or "",
    )


def _own_contact(db: Session, user: User, contact_id: str) -> Contact:
    contact = db.get(Contact, contact_id)
    if not contact or contact.user_id != user.id:
        raise HTTPException(404, "Contact not found")
    return contact


@router.get("", response_model=list[ContactOut])
def list_contacts(
    search: str = "",
    account_id: str | None = None,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(Contact).filter(Contact.user_id == user.id)
    if search:
        like = _like(search)
        q = q.filter(or_(Contact.name.ilike(like, escape="\\"),
                         Contact.email.ilike(like, escape="\\")))
    if account_id:
        q = q.filter(Contact.account_ids.contains(account_id))
    return [
        _to_out(c)
        for c in q.order_by(Contact.name.asc(), Contact.email.asc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    ]


@router.post("", response_model=ContactOut, status_code=201)
def create_contact(data: ContactCreateIn, user: User = Depends(get_current_user),
                   db: Session = Depends(get_db)):
    address = str(data.email).lower().strip()
    existing = (
        db.query(Contact)
        .filter(Contact.user_id == user.id, Contact.email == address)
        .first()
    )
    if existing:
        raise HTTPException(409, "A contact with this address already exists")
    contact = Contact(user_id=user.id, email=address, name=data.name.strip(),
                      phone=data.phone.strip(), notes=data.notes,
                      is_manual=True, email_count=0)
    db.add(contact)
    db.commit()
    return _to_out(contact)


@router.patch("/{contact_id}", response_model=ContactOut)
def update_contact(contact_id: str, data: ContactPatchIn,
                   user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    contact = _own_contact(db, user, contact_id)
    if data.email is not None:
        address = str(data.email).lower().strip()
        if address != contact.email:
            duplicate = (
                db.query(Contact)
                .filter(Contact.user_id == user.id, Contact.email == address)
                .first()
            )
            if duplicate:
                raise HTTPException(409, "A contact with this address already exists")
            contact.email = address
    if data.name is not None:
        contact.name = data.name.strip()
    if data.phone is not None:
        contact.phone = data.phone.strip()
    if data.notes is not None:
        contact.notes = data.notes
    contact.is_manual = True  # user-curated from now on
    db.commit()
    return _to_out(contact)


@router.delete("/{contact_id}", status_code=204)
def delete_contact(contact_id: str, user: User = Depends(get_current_user),
                   db: Session = Depends(get_db)):
    contact = _own_contact(db, user, contact_id)
    db.delete(contact)
    db.commit()


@router.get("/{contact_id}", response_model=ContactOut)
def get_contact(contact_id: str, user: User = Depends(get_current_user),
                db: Session = Depends(get_db)):
    contact = _own_contact(db, user, contact_id)
    return _to_out(contact)


@router.get("/{contact_id}/emails", response_model=list[EmailRowOut])
def contact_emails(
    contact_id: str,
    folder: str = "all",
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    contact = db.get(Contact, contact_id)
    if not contact or contact.user_id != user.id:
        raise HTTPException(404, "Contact not found")

    address = contact.email
    like = _recipient_pattern(address)
    q = (
        db.query(Email)
        .join(EmailAccount)
        .filter(EmailAccount.user_id == user.id)
        .filter(
            or_(
                Email.from_email == address,
                Email.to_recipients.ilike(like, escape="\\"),
                Email.cc_recipients.ilike(like, escape="\\"),
            )
        )
    )
    if folder != "all":
        if folder not in ("inbox", "sent", "drafts"):
            raise HTTPException(400, "folder must be all|inbox|sent|drafts")
        q = q.filter(Email.folder_role == folder)
    else:
        q = q.filter(Email.folder_role.notin_(["trash", "spam"]))
    return (
        q.order_by(Email.received_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )
