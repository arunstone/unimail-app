"""Junk-filter status and settings. Training happens on the email
endpoints (POST /api/emails/{id}/spam | /not-spam)."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import JunkStat, User
from ..schemas import JunkSettingsIn, JunkStatsOut
from ..services import junk_service

router = APIRouter(prefix="/api/junk", tags=["junk"])


def _stats_out(db: Session, user: User) -> JunkStatsOut:
    stats = db.get(JunkStat, user.id)
    spam = stats.spam_messages if stats else 0
    ham = stats.ham_messages if stats else 0
    return JunkStatsOut(
        enabled=user.junk_enabled,
        spam_trained=spam,
        ham_trained=ham,
        min_needed=junk_service.MIN_TRAINED,
        active=user.junk_enabled
        and spam >= junk_service.MIN_TRAINED
        and ham >= junk_service.MIN_TRAINED,
    )


@router.get("", response_model=JunkStatsOut)
def junk_stats(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _stats_out(db, user)


@router.patch("", response_model=JunkStatsOut)
def junk_settings(data: JunkSettingsIn, user: User = Depends(get_current_user),
                  db: Session = Depends(get_db)):
    user.junk_enabled = data.enabled
    db.commit()
    return _stats_out(db, user)
