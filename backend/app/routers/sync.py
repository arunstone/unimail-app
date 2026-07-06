import asyncio

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import SessionLocal, get_db
from ..deps import get_current_user
from ..models import EmailAccount, User
from ..schemas import SyncStatusOut
from ..services.sync_service import sync_account

router = APIRouter(prefix="/api/sync", tags=["sync"])


def _own_account(db: Session, user: User, account_id: str) -> EmailAccount:
    account = db.get(EmailAccount, account_id)
    if not account or account.user_id != user.id:
        raise HTTPException(404, "Account not found")
    return account


def _run_sync(account_id: str) -> None:
    db = SessionLocal()
    try:
        sync_account(db, account_id)
    finally:
        db.close()


@router.post("/{account_id}", response_model=SyncStatusOut)
async def trigger_sync(account_id: str, user: User = Depends(get_current_user),
                       db: Session = Depends(get_db)):
    account = _own_account(db, user, account_id)
    if account.sync_status == "syncing":
        return SyncStatusOut(
            account_id=account.id, sync_status="syncing",
            last_synced_at=account.last_synced_at, sync_error=None,
        )
    await asyncio.to_thread(_run_sync, account.id)
    db.refresh(account)
    return SyncStatusOut(
        account_id=account.id, sync_status=account.sync_status,
        last_synced_at=account.last_synced_at, sync_error=account.sync_error,
    )


@router.get("/{account_id}/status", response_model=SyncStatusOut)
def sync_status(account_id: str, user: User = Depends(get_current_user),
                db: Session = Depends(get_db)):
    account = _own_account(db, user, account_id)
    return SyncStatusOut(
        account_id=account.id, sync_status=account.sync_status,
        last_synced_at=account.last_synced_at, sync_error=account.sync_error,
    )
