"""Saved searches — virtual folders in the left panel. Each row stores a
search + optional attachment-type filter; listing returns live match
counts computed with the same filters the search view uses."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import SavedSearch, User
from ..schemas import SavedSearchIn, SavedSearchOut
from .emails import build_email_query

router = APIRouter(prefix="/api/searches", tags=["searches"])

MAX_SAVED = 30


@router.get("", response_model=list[SavedSearchOut])
def list_searches(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = (
        db.query(SavedSearch)
        .filter(SavedSearch.user_id == user.id)
        .order_by(SavedSearch.created_at.asc())
        .all()
    )
    out = []
    for row in rows:
        count = build_email_query(
            db, user, folder="all", search=row.query, file_type=row.file_type
        ).count()
        out.append(SavedSearchOut(id=row.id, name=row.name, query=row.query,
                                  file_type=row.file_type, count=count))
    return out


@router.post("", response_model=SavedSearchOut, status_code=201)
def create_search(data: SavedSearchIn, user: User = Depends(get_current_user),
                  db: Session = Depends(get_db)):
    total = db.query(SavedSearch).filter(SavedSearch.user_id == user.id).count()
    if total >= MAX_SAVED:
        raise HTTPException(400, f"Limit of {MAX_SAVED} saved searches reached")
    dup = (
        db.query(SavedSearch)
        .filter(SavedSearch.user_id == user.id, SavedSearch.name == data.name)
        .first()
    )
    if dup:
        raise HTTPException(409, "A saved search with that name already exists")
    row = SavedSearch(user_id=user.id, **data.model_dump())
    db.add(row)
    db.commit()
    count = build_email_query(
        db, user, folder="all", search=row.query, file_type=row.file_type
    ).count()
    return SavedSearchOut(id=row.id, name=row.name, query=row.query,
                          file_type=row.file_type, count=count)


@router.delete("/{search_id}", status_code=204)
def delete_search(search_id: str, user: User = Depends(get_current_user),
                  db: Session = Depends(get_db)):
    row = db.get(SavedSearch, search_id)
    if not row or row.user_id != user.id:
        raise HTTPException(404, "Saved search not found")
    db.delete(row)
    db.commit()
