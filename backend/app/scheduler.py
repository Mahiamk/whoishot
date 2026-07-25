"""In-process APScheduler setup for sending contest ending reminders."""

import logging
from datetime import timedelta
from typing import Sequence

from apscheduler.schedulers.background import BackgroundScheduler
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.email import send_email
from app.models import Contest, Contestant, ContestantStatus, ContestStatus, User, utcnow

logger = logging.getLogger(__name__)

scheduler = BackgroundScheduler()


def check_ending_contests_and_send_reminders(db: Session) -> None:
    """Finds active contests approaching 24h and 1h deadlines that haven't had
    reminders sent yet, and emails all active contestants + creator."""
    now = utcnow()

    # 1. Check 24h window (ends_at <= now + 24h, ends_at > now, reminder_24h_sent_at is None)
    target_24h = now + timedelta(hours=24)
    contests_24h = (
        db.query(Contest)
        .filter(
            Contest.status == ContestStatus.active,
            Contest.reminder_24h_sent_at.is_(None),
            Contest.ends_at <= target_24h,
            Contest.ends_at > now,
        )
        .all()
    )

    for contest in contests_24h:
        contest.reminder_24h_sent_at = now
        db.flush()

        _send_contest_reminders(db, contest, time_left="24 hours")

    # 2. Check 1h window (ends_at <= now + 1h, ends_at > now, reminder_1h_sent_at is None)
    target_1h = now + timedelta(hours=1)
    contests_1h = (
        db.query(Contest)
        .filter(
            Contest.status == ContestStatus.active,
            Contest.reminder_1h_sent_at.is_(None),
            Contest.ends_at <= target_1h,
            Contest.ends_at > now,
        )
        .all()
    )

    for contest in contests_1h:
        contest.reminder_1h_sent_at = now
        db.flush()

        _send_contest_reminders(db, contest, time_left="1 hour")

    db.commit()


def _send_contest_reminders(db: Session, contest: Contest, time_left: str) -> None:
    """Helper to gather active contestants + creator and dispatch emails."""
    contestant_user_ids = [
        c.user_id
        for c in db.query(Contestant.user_id)
        .filter(
            Contestant.contest_id == contest.id,
            Contestant.status == ContestantStatus.active,
            Contestant.user_id.isnot(None),
        )
        .all()
    ]
    user_ids = list(set([uid for uid in contestant_user_ids if uid is not None] + [contest.creator_id]))
    if not user_ids:
        return

    users: Sequence[User] = db.query(User).filter(User.id.in_(user_ids)).all()

    for user in users:
        send_email(
            db,
            to=user.email,
            template_key="contest_ending_soon",
            context={
                "contest_title": contest.title,
                "time_left": time_left,
                "contest_join_code": contest.join_code,
                "contest_id": contest.id,
            },
            user_id=user.id,
            is_transactional_required=False,  # Respects email_opt_out!
        )


def run_reminder_job() -> None:
    """Job wrapper executing inside a fresh SessionLocal session."""
    db = SessionLocal()
    try:
        check_ending_contests_and_send_reminders(db)
    except Exception as exc:
        logger.error("Error executing reminder job: %s", exc)
    finally:
        db.close()


def start_scheduler() -> None:
    if not scheduler.running:
        scheduler.add_job(
            run_reminder_job,
            trigger="interval",
            minutes=30,
            id="contest_reminders",
            replace_existing=True,
        )
        scheduler.start()
        logger.info("APScheduler started for contest ending reminders.")


def stop_scheduler() -> None:
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("APScheduler stopped.")
