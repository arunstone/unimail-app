import json

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import Email, EmailAccount, FilterRule, Label, User
from ..schemas import FilterRuleIn, FilterRuleOut
from ..services import filter_service, imap_actions

router = APIRouter(prefix="/api/filters", tags=["filters"])


def _to_out(rule: FilterRule) -> FilterRuleOut:
    return FilterRuleOut(
        id=rule.id,
        name=rule.name,
        account_id=rule.account_id,
        match_type=rule.match_type,
        conditions=json.loads(rule.conditions or "[]"),
        actions=json.loads(rule.actions or "{}"),
        enabled=rule.enabled,
        position=rule.position,
        created_at=rule.created_at,
    )


def _own_rule(db: Session, user: User, rule_id: str) -> FilterRule:
    rule = db.get(FilterRule, rule_id)
    if not rule or rule.user_id != user.id:
        raise HTTPException(404, "Filter not found")
    return rule


def _validate(db: Session, user: User, data: FilterRuleIn) -> None:
    if not data.name.strip():
        raise HTTPException(400, "Filter needs a name")
    if data.match_type not in ("all", "any"):
        raise HTTPException(400, "match_type must be all or any")
    if not data.conditions:
        raise HTTPException(400, "Filter needs at least one condition")
    for cond in data.conditions:
        if cond.field not in filter_service.FIELDS:
            raise HTTPException(400, f"Unknown condition field {cond.field!r}")
        if cond.op not in filter_service.OPS:
            raise HTTPException(400, f"Unknown condition op {cond.op!r}")
        if not cond.value.strip():
            raise HTTPException(400, "Condition value cannot be empty")
    act = data.actions
    if not (act.move_to or act.label_id or act.mark_read or act.star):
        raise HTTPException(400, "Filter needs at least one action")
    if act.move_to and act.move_to not in filter_service.MOVE_TARGETS:
        raise HTTPException(400, "move_to must be trash, spam or archive")
    if act.label_id:
        label = db.get(Label, act.label_id)
        if not label or label.user_id != user.id:
            raise HTTPException(404, "Label not found")
    if data.account_id:
        account = db.get(EmailAccount, data.account_id)
        if not account or account.user_id != user.id:
            raise HTTPException(404, "Account not found")


@router.get("", response_model=list[FilterRuleOut])
def list_filters(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rules = (
        db.query(FilterRule)
        .filter(FilterRule.user_id == user.id)
        .order_by(FilterRule.position.asc(), FilterRule.created_at.asc())
        .all()
    )
    return [_to_out(r) for r in rules]


@router.post("", response_model=FilterRuleOut, status_code=201)
def create_filter(data: FilterRuleIn, user: User = Depends(get_current_user),
                  db: Session = Depends(get_db)):
    _validate(db, user, data)
    max_pos = (
        db.query(FilterRule.position)
        .filter(FilterRule.user_id == user.id)
        .order_by(FilterRule.position.desc())
        .first()
    )
    rule = FilterRule(
        user_id=user.id,
        account_id=data.account_id,
        name=data.name.strip(),
        match_type=data.match_type,
        conditions=json.dumps([c.model_dump() for c in data.conditions]),
        actions=json.dumps(data.actions.model_dump()),
        enabled=data.enabled,
        position=(max_pos[0] + 1) if max_pos else 0,
    )
    db.add(rule)
    db.commit()
    return _to_out(rule)


@router.put("/{rule_id}", response_model=FilterRuleOut)
def update_filter(rule_id: str, data: FilterRuleIn,
                  user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rule = _own_rule(db, user, rule_id)
    _validate(db, user, data)
    rule.name = data.name.strip()
    rule.account_id = data.account_id
    rule.match_type = data.match_type
    rule.conditions = json.dumps([c.model_dump() for c in data.conditions])
    rule.actions = json.dumps(data.actions.model_dump())
    rule.enabled = data.enabled
    db.commit()
    return _to_out(rule)


@router.delete("/{rule_id}", status_code=204)
def delete_filter(rule_id: str, user: User = Depends(get_current_user),
                  db: Session = Depends(get_db)):
    rule = _own_rule(db, user, rule_id)
    db.delete(rule)
    db.commit()


RUN_BATCH_LIMIT = 500


@router.post("/{rule_id}/run")
def run_filter(rule_id: str, background: BackgroundTasks,
               user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Apply one rule to existing inbox mail (most recent first, capped).
    Flag/move changes are mirrored to IMAP in the background."""
    rule = _own_rule(db, user, rule_id)
    q = (
        db.query(Email)
        .join(EmailAccount)
        .filter(EmailAccount.user_id == user.id, Email.folder_role == "inbox")
    )
    if rule.account_id:
        q = q.filter(Email.account_id == rule.account_id)
    rows = q.order_by(Email.received_at.desc()).limit(RUN_BATCH_LIMIT).all()

    affected = 0
    pushes: list[tuple[str, str | None, bool]] = []
    for row in rows:
        if not filter_service.rule_matches(rule, row):
            continue
        was = (row.is_read, row.is_starred)
        move_to = filter_service.apply_local_actions(db, row, [rule])
        flags_changed = (row.is_read, row.is_starred) != was
        if move_to:
            row.folder_role = move_to
        if flags_changed or move_to:
            pushes.append((row.id, move_to, flags_changed))
        affected += 1
    db.commit()
    for email_id, move_to, flags_changed in pushes:
        if flags_changed:
            background.add_task(imap_actions.push_flags, email_id)
        if move_to and move_to != "archive":  # archive stays local-only
            background.add_task(imap_actions.push_move, email_id, move_to)
    return {"matched": affected, "scanned": len(rows)}
