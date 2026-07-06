"""Message filter rules: match conditions against a message and apply
actions. Used by sync (new inbox mail) and the /api/filters run-now
endpoint (existing mail)."""

import json
import logging

from sqlalchemy.orm import Session

from ..models import Email, FilterRule, Label, LabelEmail

logger = logging.getLogger("unimail.filters")

FIELDS = ("from", "to", "subject", "body")
OPS = ("contains", "not_contains", "equals")
MOVE_TARGETS = ("trash", "spam", "archive")


def load_rules(db: Session, user_id: str) -> list[FilterRule]:
    return (
        db.query(FilterRule)
        .filter(FilterRule.user_id == user_id, FilterRule.enabled.is_(True))
        .order_by(FilterRule.position.asc(), FilterRule.created_at.asc())
        .all()
    )


def _email_ctx(row: Email) -> dict[str, str]:
    def addrs(raw: str) -> str:
        try:
            parts = json.loads(raw or "[]")
        except ValueError:
            return ""
        return " ".join(f"{p.get('name', '')} {p.get('email', '')}" for p in parts)

    return {
        "from": f"{row.from_name} {row.from_email}".lower(),
        "to": (addrs(row.to_recipients) + " " + addrs(row.cc_recipients)).lower(),
        "subject": (row.subject or "").lower(),
        "body": (row.body_text or row.preview or "").lower(),
    }


def _condition_matches(cond: dict, ctx: dict[str, str]) -> bool:
    value = (cond.get("value") or "").lower().strip()
    field = ctx.get(cond.get("field", ""), "")
    if not value:
        return False
    op = cond.get("op", "contains")
    if op == "contains":
        return value in field
    if op == "not_contains":
        return value not in field
    if op == "equals":
        # exact match on the address for from/to, else the whole field
        if cond.get("field") in ("from", "to"):
            return value in field.split()
        return field.strip() == value
    return False


def rule_matches(rule: FilterRule, row: Email) -> bool:
    if rule.account_id and rule.account_id != row.account_id:
        return False
    try:
        conditions = json.loads(rule.conditions or "[]")
    except ValueError:
        return False
    if not conditions:
        return False
    ctx = _email_ctx(row)
    results = (_condition_matches(c, ctx) for c in conditions)
    return all(results) if rule.match_type == "all" else any(results)


def apply_local_actions(db: Session, row: Email, rules: list[FilterRule]) -> str | None:
    """Apply matching rules' mark-read/star/label actions to the row and
    return the requested move target role (first match wins), or None.
    Caller is responsible for mirroring flags/moves to IMAP."""
    move_to = None
    for rule in rules:
        if not rule_matches(rule, row):
            continue
        try:
            actions = json.loads(rule.actions or "{}")
        except ValueError:
            continue
        if actions.get("mark_read"):
            row.is_read = True
        if actions.get("star"):
            row.is_starred = True
        label_id = actions.get("label_id")
        if label_id:
            label = db.get(Label, label_id)
            if label and label.user_id == rule.user_id:
                exists = (
                    db.query(LabelEmail)
                    .filter(LabelEmail.label_id == label_id,
                            LabelEmail.email_id == row.id)
                    .first()
                )
                if not exists:
                    db.add(LabelEmail(label_id=label_id, email_id=row.id))
        target = actions.get("move_to")
        if move_to is None and target in MOVE_TARGETS:
            move_to = target
    return move_to
