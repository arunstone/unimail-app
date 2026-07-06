"""Email similarity graph: nodes are emails, edges connect semantically
similar ones. Similarity is cosine over ollama embeddings (cached in
email_embeddings), falling back to TF-IDF when ollama is unreachable or
the cache is still cold."""

import numpy as np
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from sqlalchemy import or_
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import Email, EmailAccount, User
from ..services import embeddings as emb_service
from .emails import _like

router = APIRouter(prefix="/api/graph", tags=["graph"])

SIMILARITY_THRESHOLD = 0.18
# embeddings put unrelated text much closer together than sparse TF-IDF
# vectors do, so the cutoff sits higher
EMBEDDING_SIMILARITY_THRESHOLD = 0.62
MAX_EDGES_PER_NODE = 5


class GraphNode(BaseModel):
    id: str
    subject: str
    from_name: str
    from_email: str
    folder_role: str
    account_id: str
    provider: str
    received_at: str
    is_read: bool


class GraphEdge(BaseModel):
    source: str
    target: str
    weight: float


class GraphOut(BaseModel):
    nodes: list[GraphNode]
    edges: list[GraphEdge]
    engine: str = "tfidf"  # which similarity engine produced the edges


def _doc_text(e: Email) -> str:
    body = e.body_text or e.preview or ""
    # subject counts double: it is usually the strongest topic signal
    return f"{e.subject} {e.subject} {body[:4000]}"


@router.get("", response_model=GraphOut)
def email_graph(
    search: str = "",
    account_id: str | None = None,
    limit: int = Query(300, ge=10, le=1000),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = (
        db.query(Email, EmailAccount.provider)
        .join(EmailAccount)
        .filter(EmailAccount.user_id == user.id)
        .filter(Email.folder_role.notin_(["trash", "spam"]))
    )
    if account_id:
        q = q.filter(Email.account_id == account_id)
    if search:
        like = _like(search)
        q = q.filter(
            or_(
                Email.subject.ilike(like, escape="\\"),
                Email.body_text.ilike(like, escape="\\"),
                Email.from_email.ilike(like, escape="\\"),
                Email.from_name.ilike(like, escape="\\"),
            )
        )
    rows = q.order_by(Email.received_at.desc()).limit(limit).all()

    nodes = [
        GraphNode(
            id=e.id,
            subject=e.subject or "(no subject)",
            from_name=e.from_name,
            from_email=e.from_email,
            folder_role=e.folder_role,
            account_id=e.account_id,
            provider=provider,
            received_at=e.received_at.isoformat(),
            is_read=e.is_read,
        )
        for e, provider in rows
    ]

    if len(rows) < 2:
        return GraphOut(nodes=nodes, edges=[])

    emails = [e for e, _ in rows]
    engine = "tfidf"
    sims = None
    threshold = SIMILARITY_THRESHOLD

    # preferred: real embeddings from ollama (cached in Postgres). Only use
    # them when (nearly) every node has a vector, otherwise edges would be
    # biased toward whichever emails happen to be embedded already.
    vectors = emb_service.get_vectors(db, emails)
    if len(vectors) >= len(emails) * 0.9 and len(vectors) >= 2:
        kept = [i for i, e in enumerate(emails) if e.id in vectors]
        matrix = np.array([vectors[emails[i].id] for i in kept])
        norms = np.linalg.norm(matrix, axis=1, keepdims=True)
        norms[norms == 0] = 1.0
        matrix = matrix / norms
        full = np.zeros((len(emails), len(emails)))
        sub = matrix @ matrix.T
        for a, i in enumerate(kept):
            for b, j in enumerate(kept):
                full[i, j] = sub[a, b]
        sims = full
        threshold = EMBEDDING_SIMILARITY_THRESHOLD
        engine = "embeddings"

    if sims is None:
        docs = [_doc_text(e) for e in emails]
        try:
            vectorizer = TfidfVectorizer(
                stop_words="english",
                max_features=5000,
                token_pattern=r"(?u)\b[a-zA-Z][a-zA-Z]+\b",
            )
            matrix = vectorizer.fit_transform(docs)
        except ValueError:  # e.g. all docs empty after stop-word removal
            return GraphOut(nodes=nodes, edges=[])
        sims = cosine_similarity(matrix)

    # strip quoted-reply noise: identical subjects ("Re: X") already
    # produce high similarity, which is exactly the thread flow we want
    edges: list[GraphEdge] = []
    edge_count: dict[int, int] = {}
    candidates = []
    n = len(rows)
    for i in range(n):
        for j in range(i + 1, n):
            w = float(sims[i, j])
            if w >= threshold:
                candidates.append((w, i, j))
    candidates.sort(reverse=True)
    for w, i, j in candidates:
        if edge_count.get(i, 0) >= MAX_EDGES_PER_NODE:
            continue
        if edge_count.get(j, 0) >= MAX_EDGES_PER_NODE:
            continue
        edges.append(
            GraphEdge(source=nodes[i].id, target=nodes[j].id, weight=round(w, 3))
        )
        edge_count[i] = edge_count.get(i, 0) + 1
        edge_count[j] = edge_count.get(j, 0) + 1

    return GraphOut(nodes=nodes, edges=edges, engine=engine)
