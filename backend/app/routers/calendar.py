"""Calendar events (manual + ingested invites) and to-do tasks."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import CalendarEvent, Task, User
from ..schemas import EventIn, EventOut, EventPatchIn, TaskIn, TaskOut, TaskPatchIn

router = APIRouter(prefix="/api/calendar", tags=["calendar"])


def _aware(dt: datetime) -> datetime:
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt


def _own_event(db: Session, user: User, event_id: str) -> CalendarEvent:
    row = db.get(CalendarEvent, event_id)
    if not row or row.user_id != user.id:
        raise HTTPException(404, "Event not found")
    return row


@router.get("/events", response_model=list[EventOut])
def list_events(
    start: datetime,
    end: datetime,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Events overlapping [start, end)."""
    start, end = _aware(start), _aware(end)
    return (
        db.query(CalendarEvent)
        .filter(
            CalendarEvent.user_id == user.id,
            CalendarEvent.starts_at < end,
            or_(
                CalendarEvent.ends_at >= start,
                CalendarEvent.ends_at.is_(None) & (CalendarEvent.starts_at >= start),
            ),
        )
        .order_by(CalendarEvent.starts_at.asc())
        .limit(500)
        .all()
    )


@router.post("/events", response_model=EventOut, status_code=201)
def create_event(data: EventIn, user: User = Depends(get_current_user),
                 db: Session = Depends(get_db)):
    if data.ends_at and _aware(data.ends_at) < _aware(data.starts_at):
        raise HTTPException(400, "Event ends before it starts")
    row = CalendarEvent(user_id=user.id, source="manual", **data.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.patch("/events/{event_id}", response_model=EventOut)
def patch_event(event_id: str, data: EventPatchIn,
                user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    row = _own_event(db, user, event_id)
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(row, key, value)
    if row.ends_at and _aware(row.ends_at) < _aware(row.starts_at):
        raise HTTPException(400, "Event ends before it starts")
    db.commit()
    db.refresh(row)
    return row


@router.delete("/events/{event_id}", status_code=204)
def delete_event(event_id: str, user: User = Depends(get_current_user),
                 db: Session = Depends(get_db)):
    db.delete(_own_event(db, user, event_id))
    db.commit()


@router.get("/tasks", response_model=list[TaskOut])
def list_tasks(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return (
        db.query(Task)
        .filter(Task.user_id == user.id)
        .order_by(Task.done.asc(), func.coalesce(Task.due_at, Task.created_at).asc())
        .limit(200)
        .all()
    )


@router.post("/tasks", response_model=TaskOut, status_code=201)
def create_task(data: TaskIn, user: User = Depends(get_current_user),
                db: Session = Depends(get_db)):
    row = Task(user_id=user.id, **data.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.patch("/tasks/{task_id}", response_model=TaskOut)
def patch_task(task_id: str, data: TaskPatchIn,
               user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    row = db.get(Task, task_id)
    if not row or row.user_id != user.id:
        raise HTTPException(404, "Task not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/tasks/{task_id}", status_code=204)
def delete_task(task_id: str, user: User = Depends(get_current_user),
                db: Session = Depends(get_db)):
    row = db.get(Task, task_id)
    if not row or row.user_id != user.id:
        raise HTTPException(404, "Task not found")
    db.delete(row)
    db.commit()
