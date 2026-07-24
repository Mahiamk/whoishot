from sqlalchemy.orm import Session

from app.audit import audit
from app.models import ContestantStatus, InfoRequest, InfoRequestStatus, as_aware, utcnow


def check_expire(db: Session, info_request: InfoRequest) -> InfoRequest:
    """Check-on-read expiry: no cron. Every path that reads an info request
    calls this first. A pending request past its deadline flips to expired
    and auto-hides the linked contestant, pending admin review."""
    if (
        info_request.status == InfoRequestStatus.pending
        and as_aware(info_request.deadline_at) < utcnow()
    ):
        from app.routers.contests import invalidate_leaderboard_cache

        info_request.status = InfoRequestStatus.expired
        contestant = info_request.report.contestant
        if contestant.status == ContestantStatus.active:
            contestant.status = ContestantStatus.reported
            invalidate_leaderboard_cache(contestant.contest_id)
        audit(
            db,
            info_request.admin,
            "info_request.expire",
            "info_request",
            info_request.id,
            {"report_id": info_request.report_id, "contestant_id": contestant.id},
        )
        db.commit()
    return info_request
