"""User-defined labels: hand-picked collections of emails (built by dragging
search results into the workspace panel), viewed as a chat-style timeline."""

import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, selectinload

from ..database import get_db
from ..deps import get_current_user
from ..models import Email, EmailAccount, Label, LabelEmail, User
from ..schemas import (
    EmailRowOut,
    LabelCreateIn,
    LabelDetailOut,
    LabelEmailAddIn,
    LabelOut,
    LabelPatchIn,
    TimelineMessageOut,
)

router = APIRouter(prefix="/api/labels", tags=["labels"])


def _own_label(db: Session, user: User, label_id: str) -> Label:
    label = db.get(Label, label_id)
    if not label or label.user_id != user.id:
        raise HTTPException(404, "Label not found")
    return label


def _own_email_ids(db: Session, user: User, email_ids: list[str]) -> list[str]:
    if not email_ids:
        return []
    rows = (
        db.query(Email.id)
        .join(EmailAccount)
        .filter(EmailAccount.user_id == user.id, Email.id.in_(email_ids))
        .all()
    )
    found = {r.id for r in rows}
    # keep the caller's order, drop anything that isn't theirs
    return [eid for eid in email_ids if eid in found]


def _to_out(label: Label) -> LabelOut:
    return LabelOut(
        id=label.id, name=label.name,
        email_count=len(label.emails), created_at=label.created_at,
    )


@router.get("", response_model=list[LabelOut])
def list_labels(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    labels = (
        db.query(Label)
        .options(selectinload(Label.emails))
        .filter(Label.user_id == user.id)
        .order_by(Label.created_at.desc())
        .all()
    )
    return [_to_out(l) for l in labels]


@router.post("", response_model=LabelOut, status_code=201)
def create_label(data: LabelCreateIn, user: User = Depends(get_current_user),
                 db: Session = Depends(get_db)):
    name = data.name.strip()
    if not name:
        raise HTTPException(400, "Label name is required")
    if db.query(Label).filter(Label.user_id == user.id, Label.name == name).first():
        raise HTTPException(409, "A label with this name already exists")
    label = Label(user_id=user.id, name=name)
    db.add(label)
    db.flush()
    for pos, eid in enumerate(_own_email_ids(db, user, data.email_ids)):
        db.add(LabelEmail(label_id=label.id, email_id=eid, position=pos))
    db.commit()
    db.refresh(label)
    return _to_out(label)


@router.get("/{label_id}", response_model=LabelDetailOut)
def get_label(label_id: str, user: User = Depends(get_current_user),
              db: Session = Depends(get_db)):
    label = _own_label(db, user, label_id)
    my_addresses = {
        a.email_address.lower()
        for a in db.query(EmailAccount).filter(EmailAccount.user_id == user.id)
    }
    links = sorted(label.emails, key=lambda le: le.position)
    messages = []
    for link in links:
        e = link.email
        messages.append(
            TimelineMessageOut(
                **EmailRowOut.model_validate(e).model_dump(),
                to_recipients=json.loads(e.to_recipients or "[]"),
                is_mine=e.from_email.lower() in my_addresses,
                position=link.position,
            )
        )
    # timeline reads chronologically regardless of drag order
    messages.sort(key=lambda m: m.received_at)
    return LabelDetailOut(
        id=label.id, name=label.name,
        email_count=len(links), created_at=label.created_at,
        emails=messages,
    )


@router.patch("/{label_id}", response_model=LabelOut)
def patch_label(label_id: str, data: LabelPatchIn,
                user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    label = _own_label(db, user, label_id)
    if data.name is not None:
        name = data.name.strip()
        if not name:
            raise HTTPException(400, "Label name is required")
        label.name = name
    if data.order is not None:
        positions = {eid: pos for pos, eid in enumerate(data.order)}
        for link in label.emails:
            if link.email_id in positions:
                link.position = positions[link.email_id]
    db.commit()
    db.refresh(label)
    return _to_out(label)


@router.delete("/{label_id}", status_code=204)
def delete_label(label_id: str, user: User = Depends(get_current_user),
                 db: Session = Depends(get_db)):
    label = _own_label(db, user, label_id)
    db.delete(label)
    db.commit()


@router.post("/{label_id}/emails", response_model=LabelOut)
def add_email(label_id: str, data: LabelEmailAddIn,
              user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    label = _own_label(db, user, label_id)
    if not _own_email_ids(db, user, [data.email_id]):
        raise HTTPException(404, "Email not found")
    if not any(le.email_id == data.email_id for le in label.emails):
        next_pos = max((le.position for le in label.emails), default=-1) + 1
        db.add(LabelEmail(label_id=label.id, email_id=data.email_id, position=next_pos))
        db.commit()
    db.refresh(label)
    return _to_out(label)


@router.delete("/{label_id}/emails/{email_id}", response_model=LabelOut)
def remove_email(label_id: str, email_id: str,
                 user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    label = _own_label(db, user, label_id)
    link = (
        db.query(LabelEmail)
        .filter(LabelEmail.label_id == label.id, LabelEmail.email_id == email_id)
        .first()
    )
    if link:
        db.delete(link)
        db.commit()
    db.refresh(label)
    return _to_out(label)
