"""Adaptive Bayesian junk classifier, Thunderbird-style.

Learns per app user from explicit "Spam" / "Not spam" actions and scores
new inbox mail during sync. Naive Bayes over the most decisive tokens
(Graham's combining rule) with Robinson smoothing so a small training
corpus doesn't produce extreme scores. The classifier stays inactive
until the user has trained at least MIN_TRAINED messages of each kind.
"""

import logging
import math
import re

from sqlalchemy.orm import Session

from ..models import Email, JunkStat, JunkToken, User

logger = logging.getLogger("unimail.junk")

MIN_TRAINED = 3        # spam AND ham messages needed before scoring starts
SPAM_THRESHOLD = 0.90  # score above this → junk
MAX_TOKENS = 300       # unique tokens considered per message
MAX_INTERESTING = 20   # most decisive tokens combined into the score

_WORD_RE = re.compile(r"[a-z0-9$€£][a-z0-9$€£'._-]{1,38}")
_TAG_RE = re.compile(r"<[^>]+>")


def tokenize(row: Email) -> set[str]:
    """Unique tokens for one message: subject and body words plus the
    sender address/domain (prefixed so header evidence stays distinct)."""
    tokens: set[str] = set()
    sender = (row.from_email or "").lower().strip()
    if sender:
        tokens.add(f"f:{sender}"[:64])
        if "@" in sender:
            tokens.add(f"d:{sender.rsplit('@', 1)[1]}"[:64])
    for word in _WORD_RE.findall((row.subject or "").lower())[:50]:
        tokens.add(f"s:{word}"[:64])
    body = row.body_text or _TAG_RE.sub(" ", row.body_html or "") or row.preview or ""
    for word in _WORD_RE.findall(body.lower()[:20000]):
        if len(tokens) >= MAX_TOKENS:
            break
        tokens.add(word)
    return tokens


def _get_stats(db: Session, user_id: str) -> JunkStat:
    stats = db.get(JunkStat, user_id)
    if stats is None:
        stats = JunkStat(user_id=user_id, spam_messages=0, ham_messages=0)
        db.add(stats)
        db.flush()
    return stats


def _token_rows(db: Session, user_id: str, tokens: set[str]) -> dict[str, JunkToken]:
    if not tokens:
        return {}
    rows = (
        db.query(JunkToken)
        .filter(JunkToken.user_id == user_id, JunkToken.token.in_(tokens))
        .all()
    )
    return {r.token: r for r in rows}


def train(db: Session, user_id: str, row: Email, as_spam: bool) -> None:
    """Teach the classifier this message. Re-training the same way is a
    no-op; training the opposite way first reverses the earlier lesson.
    Commits."""
    target = "spam" if as_spam else "ham"
    if row.spam_trained == target:
        return
    stats = _get_stats(db, user_id)
    tokens = tokenize(row)
    existing = _token_rows(db, user_id, tokens)

    if row.spam_trained == "spam":
        stats.spam_messages = max(0, stats.spam_messages - 1)
        for tok in tokens:
            if tok in existing:
                existing[tok].spam_count = max(0, existing[tok].spam_count - 1)
    elif row.spam_trained == "ham":
        stats.ham_messages = max(0, stats.ham_messages - 1)
        for tok in tokens:
            if tok in existing:
                existing[tok].ham_count = max(0, existing[tok].ham_count - 1)

    for tok in tokens:
        entry = existing.get(tok)
        if entry is None:
            entry = JunkToken(user_id=user_id, token=tok, spam_count=0, ham_count=0)
            db.add(entry)
            existing[tok] = entry
        if as_spam:
            entry.spam_count += 1
        else:
            entry.ham_count += 1
    if as_spam:
        stats.spam_messages += 1
    else:
        stats.ham_messages += 1
    row.spam_trained = target
    db.commit()


def ready(db: Session, user_id: str) -> JunkStat | None:
    """The user's corpus if their junk filter is on and trained enough to
    score mail; None otherwise. Loaded once per account sync."""
    user = db.get(User, user_id)
    if user is None or not user.junk_enabled:
        return None
    stats = db.get(JunkStat, user_id)
    if (
        stats is None
        or stats.spam_messages < MIN_TRAINED
        or stats.ham_messages < MIN_TRAINED
    ):
        return None
    return stats


def classify(db: Session, stats: JunkStat, row: Email) -> float:
    """Spam probability 0..1 for one message."""
    tokens = tokenize(row)
    known = _token_rows(db, stats.user_id, tokens)
    if not known:
        return 0.0

    # per-token spam probability, Robinson-smoothed towards 0.5 so tokens
    # seen only once or twice can't dominate
    probs: list[float] = []
    for entry in known.values():
        n = entry.spam_count + entry.ham_count
        if n == 0:
            continue
        spam_freq = entry.spam_count / max(1, stats.spam_messages)
        ham_freq = entry.ham_count / max(1, stats.ham_messages)
        if spam_freq + ham_freq == 0:
            continue
        p = spam_freq / (spam_freq + ham_freq)
        probs.append((0.5 + n * p) / (1 + n))

    if not probs:
        return 0.0
    # Graham: combine only the tokens that carry the most signal
    probs.sort(key=lambda p: abs(p - 0.5), reverse=True)
    picked = probs[:MAX_INTERESTING]
    # log space to avoid underflow on long messages
    log_p = sum(math.log(p) for p in picked)
    log_q = sum(math.log(1.0 - p) for p in picked)
    m = max(log_p, log_q)
    p_exp = math.exp(log_p - m)
    q_exp = math.exp(log_q - m)
    return p_exp / (p_exp + q_exp)
