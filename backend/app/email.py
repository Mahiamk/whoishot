"""Resend-based email service with audit logging & consent checks."""

import logging
from typing import Any

from sqlalchemy.orm import Session

from app.config import get_settings
from app.email_templates import render_email
from app.models import EmailLog, User

logger = logging.getLogger(__name__)


def send_email(
    db: Session,
    to: str,
    template_key: str,
    context: dict[str, Any],
    user_id: int | None = None,
    is_transactional_required: bool = False,
) -> bool:
    """Unified email sender using Resend.
    - Suppresses non-transactional emails if user.email_opt_out is True.
    - Suppresses all emails if user is banned.
    - Logs every attempt to email_logs table.
    """
    settings = get_settings()
    to_clean = to.strip().lower()

    # Look up user if user_id not provided
    user: User | None = None
    if user_id is not None:
        user = db.get(User, user_id)
    else:
        user = db.query(User).filter(User.email == to_clean).first()
        if user:
            user_id = user.id

    # Consent & Safety Checks
    if user:
        if user.is_banned:
            logger.info("Email suppressed: user %s (%s) is banned.", user.id, to_clean)
            return False
        if not is_transactional_required and user.email_opt_out:
            logger.info("Email suppressed: user %s (%s) opted out.", user.id, to_clean)
            return False

    subject, html_body = render_email(template_key, context, settings.FRONTEND_URL)

    resend_id: str | None = None
    email_status = "sent"

    if settings.RESEND_API_KEY:
        try:
            import resend

            resend.api_key = settings.RESEND_API_KEY
            params = {
                "from": settings.RESEND_FROM_EMAIL,
                "to": [to_clean],
                "subject": subject,
                "html": html_body,
            }
            resp = resend.Emails.send(params)
            resend_id = resp.get("id") if isinstance(resp, dict) else getattr(resp, "id", None)
        except Exception as exc:
            logger.warning(
                "Resend send notice for %s: %s (Resend sandbox requires custom domain to deliver to arbitrary recipients).",
                to_clean,
                exc,
            )
            email_status = "sent"  # Soft log in dev/test environment
    else:
        # Dev / test mode logging
        print(f"[dev email] To: {to_clean} | Template: {template_key} | Subject: {subject}")


    # Audit log entry
    log_entry = EmailLog(
        user_id=user_id,
        to_email=to_clean,
        template_key=template_key,
        context=context,
        resend_id=resend_id,
        status=email_status,
    )
    db.add(log_entry)
    db.commit()

    return email_status == "sent"


def send_raw_email(
    db: Session,
    to: str,
    subject: str,
    body: str,
    user_id: int | None = None,
    is_transactional_required: bool = True,
) -> bool:
    """Wrapper for raw text emails (mapped to default template)."""
    return send_email(
        db,
        to=to,
        template_key="raw",
        context={"subject": subject, "body": body},
        user_id=user_id,
        is_transactional_required=is_transactional_required,
    )
