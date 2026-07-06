import asyncio
import logging
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..deps import get_current_user
from ..models import EmailAccount, User
from ..schemas import LoginIn, RegisterIn, TokenOut, UserOut
from ..security import create_access_token, encrypt_secret, hash_password, verify_password
from ..services import oauth, system_mail

logger = logging.getLogger("unimail.auth")

router = APIRouter(prefix="/api/auth", tags=["auth"])


class ResendIn(BaseModel):
    email: EmailStr


class ResetPasswordIn(BaseModel):
    token: str
    password: str


def _start_verification(db: Session, user: User) -> None:
    user.verify_token = secrets.token_urlsafe(32)
    user.verify_sent_at = datetime.now(timezone.utc)
    db.commit()
    try:
        system_mail.send_verification_email(user.email, user.name, user.verify_token)
    except Exception:
        logger.exception("Failed to send verification email to %s", user.email)
        raise HTTPException(502, "Could not send the verification email. Try again later.")


@router.post("/register", response_model=UserOut, status_code=201)
def register(data: RegisterIn, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == data.email.lower()).first()
    if existing:
        raise HTTPException(409, "An account with this email already exists")
    user = User(
        name=data.name.strip(),
        email=data.email.lower(),
        password_hash=hash_password(data.password),
        # without system SMTP there is no way to deliver the link, so don't
        # lock the user out — verify immediately
        is_verified=not system_mail.is_configured(),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    if not user.is_verified:
        _start_verification(db, user)
    return user


@router.get("/verify")
def verify(token: str = Query(min_length=10), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.verify_token == token).first()
    if not user:
        raise HTTPException(400, "Invalid or already used verification link")
    sent_at = user.verify_sent_at
    if sent_at and sent_at.tzinfo is None:
        sent_at = sent_at.replace(tzinfo=timezone.utc)
    expires = timedelta(hours=settings.verify_token_expire_hours)
    if not sent_at or datetime.now(timezone.utc) - sent_at > expires:
        raise HTTPException(400, "Verification link has expired — request a new one")
    user.is_verified = True
    user.verify_token = None
    user.verify_sent_at = None
    db.commit()
    return {"status": "verified", "email": user.email}


@router.post("/resend-verification", status_code=202)
def resend_verification(data: ResendIn, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email.lower()).first()
    # always claim success so the endpoint can't be used to probe for accounts
    if user and not user.is_verified:
        _start_verification(db, user)
    return {"status": "sent"}


@router.post("/forgot-password", status_code=202)
def forgot_password(data: ResendIn, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email.lower()).first()
    # always claim success so the endpoint can't be used to probe for accounts
    if user:
        user.reset_token = secrets.token_urlsafe(32)
        user.reset_sent_at = datetime.now(timezone.utc)
        db.commit()
        try:
            system_mail.send_password_reset_email(user.email, user.name, user.reset_token)
        except Exception:
            logger.exception("Failed to send password reset email to %s", user.email)
    return {"status": "sent"}


@router.post("/reset-password")
def reset_password(data: ResetPasswordIn, db: Session = Depends(get_db)):
    if len(data.password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")
    user = db.query(User).filter(User.reset_token == data.token).first()
    if not user:
        raise HTTPException(400, "Invalid or already used reset link")
    sent_at = user.reset_sent_at
    if sent_at and sent_at.tzinfo is None:
        sent_at = sent_at.replace(tzinfo=timezone.utc)
    expires = timedelta(hours=settings.reset_token_expire_hours)
    if not sent_at or datetime.now(timezone.utc) - sent_at > expires:
        raise HTTPException(400, "Reset link has expired — request a new one")
    user.password_hash = hash_password(data.password)
    user.reset_token = None
    user.reset_sent_at = None
    # a working reset link proves mailbox ownership
    user.is_verified = True
    db.commit()
    return {"status": "reset", "email": user.email}


@router.post("/login", response_model=TokenOut)
def login(data: LoginIn, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email.lower()).first()
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(401, "Invalid email or password")
    if not user.is_verified:
        raise HTTPException(403, "Email not verified — check your inbox for the link")
    return TokenOut(access_token=create_access_token(user.id))


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user


# ---- Sign in with Google / Microsoft ----
# One consent = app login (account created from the provider identity, no
# password) + the mailbox connected in the same step, Notion-Mail-style.


@router.get("/oauth-providers")
def oauth_providers():
    """Which sign-in buttons the login page should show (a provider is
    available once its client id/secret are set in .env)."""
    return {p: bool(cfg["client_id"]()) for p, cfg in oauth.PROVIDERS.items()}


@router.get("/oauth/{provider}/start")
def oauth_login_start(provider: str):
    if provider not in oauth.PROVIDERS:
        raise HTTPException(400, "Unsupported sign-in provider")
    if not oauth.PROVIDERS[provider]["client_id"]():
        raise HTTPException(
            501, f"Sign in with {provider} is not configured (missing client id/secret in .env)"
        )
    return RedirectResponse(oauth.build_consent_url(provider, "", login=True))


@router.get("/oauth/{provider}/callback")
async def oauth_login_callback(
    provider: str,
    background: BackgroundTasks,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    db: Session = Depends(get_db),
):
    fail = f"{settings.frontend_origin}/login?oauth_error="
    if provider not in oauth.PROVIDERS:
        return RedirectResponse(f"{fail}bad_provider")
    if error or not code or not state:
        return RedirectResponse(f"{fail}{error or 'missing_code'}")
    payload = oauth.read_state(state, purpose="oauth_login")
    if not payload or payload.get("provider") != provider:
        return RedirectResponse(f"{fail}bad_state")

    try:
        tokens = await asyncio.to_thread(oauth.exchange_code, provider, code, True)
        email, name = await asyncio.to_thread(oauth.fetch_identity, provider, tokens)
    except Exception:
        logger.exception("OAuth login token exchange failed (%s)", provider)
        return RedirectResponse(f"{fail}token_exchange_failed")
    email = email.lower().strip()
    if not email:
        return RedirectResponse(f"{fail}no_email")

    user = db.query(User).filter(User.email == email).first()
    if user is None:
        user = User(
            name=name.strip() or email.partition("@")[0],
            email=email,
            # no password — set one later via "Forgot password" if wanted
            password_hash=hash_password(secrets.token_urlsafe(32)),
            is_verified=True,
        )
        db.add(user)
        db.flush()
    else:
        # the provider vouches for this address
        user.is_verified = True

    # connect (or refresh) the mailbox in the same step
    cfg = oauth.PROVIDERS[provider]
    account = (
        db.query(EmailAccount)
        .filter(EmailAccount.user_id == user.id, EmailAccount.email_address == email)
        .first()
    )
    if account is None:
        account = EmailAccount(
            user_id=user.id,
            provider=provider,
            email_address=email,
            imap_host=cfg["imap_host"],
            imap_port=993,
            smtp_host=cfg["smtp_host"],
            smtp_port=587,
        )
        db.add(account)
    account.access_token_enc = encrypt_secret(tokens["access_token"])
    if tokens.get("refresh_token"):
        account.refresh_token_enc = encrypt_secret(tokens["refresh_token"])
    account.token_expires_at = datetime.now(timezone.utc) + timedelta(
        seconds=tokens.get("expires_in", 3600)
    )
    account.is_active = True
    db.commit()

    from ..routers.accounts import _first_sync

    background.add_task(_first_sync, account.id)
    jwt_token = create_access_token(user.id)
    return RedirectResponse(f"{settings.frontend_origin}/login?oauth_token={jwt_token}")
