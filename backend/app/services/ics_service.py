"""Ingest iCalendar (.ics / text/calendar) meeting invites from synced
email into calendar_events. Updates and cancellations are matched by the
invite's UID; recurring rules are stored as their first occurrence (the
RRULE itself is noted in the description, not expanded)."""

import logging
from datetime import date, datetime, time, timezone

from icalendar import Calendar
from sqlalchemy.orm import Session

from ..models import CalendarEvent, Email

logger = logging.getLogger("unimail.ics")


def _to_utc(value) -> tuple[datetime | None, bool]:
    """icalendar DTSTART/DTEND value → (aware UTC datetime, is_all_day)."""
    if value is None:
        return None, False
    dt = getattr(value, "dt", value)
    if isinstance(dt, datetime):
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc), False
    if isinstance(dt, date):
        return datetime.combine(dt, time.min, tzinfo=timezone.utc), True
    return None, False


def parse_invites(content: bytes) -> list[dict]:
    """VEVENTs found in raw ics bytes, normalised for upserting."""
    cal = Calendar.from_ical(content)
    method = str(cal.get("METHOD", "")).upper()
    events: list[dict] = []
    for component in cal.walk("VEVENT"):
        starts_at, all_day = _to_utc(component.get("DTSTART"))
        if starts_at is None:
            continue
        ends_at, _ = _to_utc(component.get("DTEND"))
        status = str(component.get("STATUS", "CONFIRMED")).upper()
        if method == "CANCEL" or status == "CANCELLED":
            normalized = "cancelled"
        elif status == "TENTATIVE":
            normalized = "tentative"
        else:
            normalized = "confirmed"
        organizer = str(component.get("ORGANIZER", ""))
        if organizer.lower().startswith("mailto:"):
            organizer = organizer[7:]
        description = str(component.get("DESCRIPTION", "")).strip()
        rrule = component.get("RRULE")
        if rrule:
            try:
                rule_text = rrule.to_ical().decode()
            except Exception:
                rule_text = str(rrule)
            description = f"⟳ Repeats ({rule_text})\n{description}".strip()
        events.append({
            "ical_uid": str(component.get("UID", "")).strip()[:255] or None,
            "title": str(component.get("SUMMARY", "")).strip()[:255],
            "location": str(component.get("LOCATION", "")).strip()[:255],
            "description": description[:5000],
            "starts_at": starts_at,
            "ends_at": ends_at,
            "all_day": all_day,
            "organizer": organizer.strip()[:255],
            "status": normalized,
        })
    return events


def ingest(db: Session, user_id: str, email_row: Email, content: bytes) -> int:
    """Upsert every event in one invite payload; returns how many were
    added or updated. Never raises — a broken .ics must not break sync."""
    try:
        events = parse_invites(content)
    except Exception:
        logger.warning("Unparseable calendar part in email %s", email_row.id,
                       exc_info=True)
        return 0
    changed = 0
    for data in events:
        existing = None
        if data["ical_uid"]:
            existing = (
                db.query(CalendarEvent)
                .filter(CalendarEvent.user_id == user_id,
                        CalendarEvent.ical_uid == data["ical_uid"])
                .first()
            )
        if existing is not None:
            for key, value in data.items():
                setattr(existing, key, value)
            existing.email_id = email_row.id
            changed += 1
        else:
            db.add(CalendarEvent(user_id=user_id, source="invite",
                                 email_id=email_row.id, **data))
            changed += 1
    return changed
