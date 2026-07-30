from sqlalchemy import func
from sqlalchemy.orm import Session

from app.audit import audit
from app.models import (
    Contest,
    Contestant,
    ContestantStatus,
    ContestStatus,
    EntryPayment,
    EntryPaymentStatus,
    Payout,
    PayoutRowStatus,
    PayoutStatus,
    Rating,
    User,
    as_aware,
    utcnow,
)

MIN_PAID_ENTRANTS = 5


def compute_contest_payouts(db: Session, contest: Contest) -> None:
    """Compute payout rows or trigger refunds when a paid contest ends."""
    if contest.entry_fee_cents <= 0 or contest.payout_status != PayoutStatus.open:
        return

    paid_entries = (
        db.query(EntryPayment)
        .filter(
            EntryPayment.contest_id == contest.id,
            EntryPayment.status == EntryPaymentStatus.paid,
        )
        .all()
    )
    paid_count = len(paid_entries)

    if paid_count < MIN_PAID_ENTRANTS:
        # Low entrant count -> refund all paid entries
        for ep in paid_entries:
            ep.status = EntryPaymentStatus.refund_pending
        contest.payout_status = PayoutStatus.disputed
        return

    # Calculate contestant average scores for ranking
    per_criterion = (
        db.query(
            Rating.contestant_id,
            func.avg(Rating.score).label("crit_avg"),
        )
        .join(Contestant, Rating.contestant_id == Contestant.id)
        .join(User, Rating.voter_id == User.id)
        .filter(
            Contestant.contest_id == contest.id,
            Contestant.status == ContestantStatus.active,
            User.is_banned == False,  # noqa: E712
        )
        .group_by(Rating.contestant_id, Rating.criterion_id)
        .all()
    )
    crit_avgs: dict[int, list[float]] = {}
    for contestant_id, crit_avg in per_criterion:
        crit_avgs.setdefault(contestant_id, []).append(float(crit_avg))

    scores: dict[int, float] = {
        cid: round(sum(avgs) / len(avgs), 2)
        for cid, avgs in crit_avgs.items()
    }

    active_contestants = (
        db.query(Contestant)
        .join(User, Contestant.user_id == User.id)
        .filter(
            Contestant.contest_id == contest.id,
            Contestant.status == ContestantStatus.active,
            User.is_banned == False,  # noqa: E712
        )
        .all()
    )

    active_contestants.sort(
        key=lambda c: (scores.get(c.id, 0.0), -c.id),
        reverse=True,
    )

    total_pool = sum(ep.amount_cents for ep in paid_entries)
    p1 = (total_pool * 35) // 100
    p2 = (total_pool * 25) // 100
    p3 = (total_pool * 20) // 100
    platform = total_pool - (p1 + p2 + p3)

    c1 = active_contestants[0].id if len(active_contestants) > 0 else None
    c2 = active_contestants[1].id if len(active_contestants) > 1 else None
    c3 = active_contestants[2].id if len(active_contestants) > 2 else None

    payouts_data = [
        ("1", c1, p1),
        ("2", c2, p2),
        ("3", c3, p3),
        ("platform", None, platform),
    ]

    for rank_name, contestant_id, amt in payouts_data:
        db.add(
            Payout(
                contest_id=contest.id,
                contestant_id=contestant_id,
                rank=rank_name,
                amount_cents=amt,
                status=PayoutRowStatus.pending,
            )
        )

    contest.payout_status = PayoutStatus.pending


def check_contest_expiry(db: Session, contest: Contest) -> Contest:
    """Check-on-read expiry: no cron. Every path that resolves a contest
    calls this first. An active contest past ends_at flips to ended once
    and writes a system audit row (no admin_id)."""
    if contest.status == ContestStatus.active and as_aware(contest.ends_at) < utcnow():
        contest.status = ContestStatus.ended
        contest.is_active = False
        compute_contest_payouts(db, contest)
        audit(
            db,
            None,
            "contest.expire",
            "contest",
            contest.id,
            {"join_code": contest.join_code},
        )
        db.commit()
    return contest
