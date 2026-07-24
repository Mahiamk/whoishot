import smtplib
from email.message import EmailMessage

from app.config import get_settings


def send_email(to: str, subject: str, body: str) -> None:
    """Best-effort send: unset SMTP_HOST logs to console (dev default);
    a configured but failing SMTP server logs a warning rather than
    raising, so a flaky mail server never blocks the underlying action."""
    settings = get_settings()
    if not settings.SMTP_HOST:
        print(f"[dev email] To: {to}\nSubject: {subject}\n\n{body}\n")
        return

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = settings.SMTP_FROM
    message["To"] = to
    message.set_content(body)

    try:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as server:
            server.starttls()
            if settings.SMTP_USER:
                server.login(settings.SMTP_USER, settings.SMTP_PASSWORD or "")
            server.send_message(message)
    except (smtplib.SMTPException, OSError) as exc:
        print(f"[email] failed to send to {to}: {exc}")
