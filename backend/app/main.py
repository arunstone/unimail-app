import asyncio
import logging
from contextlib import asynccontextmanager

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from datetime import datetime, timedelta, timezone

from .config import settings
from .database import Base, engine
from .routers import (
    accounts,
    auth,
    calendar,
    contacts,
    drafts,
    emails,
    filters,
    graph,
    junk,
    labels,
    searches,
    sync,
)
from .services import storage
from .services.sync_service import sync_all_accounts

logging.basicConfig(level=logging.INFO)

scheduler = AsyncIOScheduler()


async def _sync_job() -> None:
    await asyncio.to_thread(sync_all_accounts)


def _sweep_stale_uploads() -> None:
    """Compose attachments staged but never sent (browser closed, etc.)
    would otherwise sit in object storage forever."""
    from .database import SessionLocal
    from .models import Upload

    db = SessionLocal()
    try:
        cutoff = datetime.now(timezone.utc) - timedelta(days=7)
        stale = db.query(Upload).filter(Upload.created_at < cutoff).all()
        if not stale:
            return
        keys = [u.id for u in stale]
        for u in stale:
            db.delete(u)
        db.commit()
        if storage.enabled():
            storage.delete_many(keys)
        logging.getLogger("unimail").info("Swept %d stale uploads", len(keys))
    except Exception:
        logging.getLogger("unimail").warning("Stale-upload sweep failed", exc_info=True)
    finally:
        db.close()


async def _upload_sweep_job() -> None:
    await asyncio.to_thread(_sweep_stale_uploads)


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    try:
        storage.ensure_bucket()
    except Exception:
        logging.getLogger("unimail").warning(
            "Attachment storage unreachable at startup; downloads fall back to IMAP",
            exc_info=True,
        )
    scheduler.add_job(
        _sync_job,
        "interval",
        minutes=settings.sync_interval_minutes,
        id="imap_sync",
        max_instances=1,
        coalesce=True,
    )
    scheduler.add_job(
        _upload_sweep_job,
        "interval",
        hours=24,
        id="upload_sweep",
        max_instances=1,
        coalesce=True,
    )
    scheduler.start()
    yield
    scheduler.shutdown(wait=False)


app = FastAPI(title="Unimail", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(accounts.router)
app.include_router(emails.router)
app.include_router(contacts.router)
app.include_router(sync.router)
app.include_router(graph.router)
app.include_router(labels.router)
app.include_router(drafts.router)
app.include_router(filters.router)
app.include_router(junk.router)
app.include_router(calendar.router)
app.include_router(searches.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
