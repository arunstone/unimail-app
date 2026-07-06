"""Email embeddings via the local ollama container, cached in Postgres.

The graph endpoint asks for vectors for a set of emails; anything already
cached is read from email_embeddings, a bounded number of missing ones are
embedded on the fly (so the cache fills up over a few graph visits without
any single request taking forever), and the caller falls back to TF-IDF when
ollama is unreachable or nothing is embedded yet."""

import json
import logging

import requests
from sqlalchemy.orm import Session

from ..config import settings
from ..models import Email, EmailEmbedding

logger = logging.getLogger("unimail.embeddings")

# embed at most this many uncached emails per request
EMBED_BATCH_LIMIT = 80
REQUEST_TIMEOUT = 60


def _doc_text(e: Email) -> str:
    body = e.body_text or e.preview or ""
    return f"{e.subject}\n{body[:2000]}"


def ollama_available() -> bool:
    try:
        r = requests.get(f"{settings.ollama_url}/api/tags", timeout=3)
        r.raise_for_status()
        models = [m.get("name", "") for m in r.json().get("models", [])]
        return any(m.startswith(settings.embedding_model) for m in models)
    except Exception:
        return False


def _embed_batch(texts: list[str]) -> list[list[float]] | None:
    try:
        r = requests.post(
            f"{settings.ollama_url}/api/embed",
            json={"model": settings.embedding_model, "input": texts},
            timeout=REQUEST_TIMEOUT,
        )
        r.raise_for_status()
        return r.json().get("embeddings")
    except Exception as exc:
        logger.warning("ollama embed failed: %s", exc)
        return None


def get_vectors(db: Session, emails: list[Email]) -> dict[str, list[float]]:
    """Return {email_id: vector} for as many of the given emails as possible."""
    ids = [e.id for e in emails]
    cached = {
        row.email_id: json.loads(row.vector)
        for row in db.query(EmailEmbedding)
        .filter(EmailEmbedding.email_id.in_(ids),
                EmailEmbedding.model == settings.embedding_model)
        .all()
    }

    missing = [e for e in emails if e.id not in cached][:EMBED_BATCH_LIMIT]
    if missing and ollama_available():
        vectors = _embed_batch([_doc_text(e) for e in missing])
        if vectors and len(vectors) == len(missing):
            for e, vec in zip(missing, vectors):
                cached[e.id] = vec
                db.merge(EmailEmbedding(
                    email_id=e.id, model=settings.embedding_model,
                    vector=json.dumps(vec),
                ))
            db.commit()
            logger.info("Embedded %d emails (%d now cached for this view)",
                        len(missing), len(cached))
    return cached
