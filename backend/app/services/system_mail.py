"""Outgoing mail sent by Unimail itself (verification emails), as opposed to
mail sent on behalf of a connected account (see smtp_service)."""

import logging
import smtplib
from email.message import EmailMessage
from email.utils import formatdate, make_msgid

from ..config import settings

logger = logging.getLogger("unimail.system_mail")


def is_configured() -> bool:
    return bool(settings.system_smtp_host)


def _send(to_address: str, subject: str, body: str, kind: str) -> None:
    msg = EmailMessage()
    from_address = settings.system_smtp_from or settings.system_smtp_username
    msg["From"] = from_address
    msg["To"] = to_address
    msg["Subject"] = subject
    msg["Date"] = formatdate(localtime=True)
    msg["Message-ID"] = make_msgid(domain=from_address.rpartition("@")[2] or None)
    msg.set_content(body)

    with smtplib.SMTP(settings.system_smtp_host, settings.system_smtp_port,
                      timeout=30) as smtp:
        if settings.system_smtp_starttls:
            smtp.starttls()
        if settings.system_smtp_username:
            smtp.login(settings.system_smtp_username, settings.system_smtp_password)
        smtp.send_message(msg)
    logger.info("Sent %s email to %s", kind, to_address)


def send_verification_email(to_address: str, name: str, token: str) -> None:
    link = f"{settings.frontend_origin}/verify?token={token}"
    if not is_configured():
        # No system SMTP set up — surface the link in the logs so the admin
        # can pass it on manually if needed.
        logger.warning("SYSTEM_SMTP_HOST not set; verification link for %s: %s",
                       to_address, link)
        return

    _send(
        to_address,
        "Verify your Unimail account",
        f"Hi {name},\n\n"
        f"Welcome to Unimail. Confirm your email address by opening this link:\n\n"
        f"{link}\n\n"
        f"The link expires in {settings.verify_token_expire_hours} hours. "
        f"If you didn't create this account, you can ignore this email.\n",
        "verification",
    )


def send_password_reset_email(to_address: str, name: str, token: str) -> None:
    link = f"{settings.frontend_origin}/reset?token={token}"
    if not is_configured():
        logger.warning("SYSTEM_SMTP_HOST not set; password reset link for %s: %s",
                       to_address, link)
        return

    _send(
        to_address,
        "Reset your Unimail password",
        f"Hi {name},\n\n"
        f"Someone (hopefully you) asked to reset the password for this account.\n"
        f"Open this link to choose a new password:\n\n"
        f"{link}\n\n"
        f"The link expires in {settings.reset_token_expire_hours} hours. "
        f"If you didn't ask for this, you can ignore this email — your "
        f"password stays unchanged.\n",
        "password reset",
    )
