from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.contest_expiry import check_contest_expiry
from app.db import get_db
from app.deps import get_current_user
from app.email import send_email
from app.ratelimit import RATING_LIMIT, limiter

from app.models import (
    ContestCriterion,
    Contestant,
    ContestantStatus,
    ContestStatus,
    EntryPayment,
    EntryPaymentStatus,
    Gender,
    Rating,
    Report,
    ReportStatus,
    SocialLink,
    User,
    as_aware,
    utcnow,
)
from app.routers.contests import (
    contestant_averages,
    get_contest_or_404,
    invalidate_leaderboard_cache,
)
from app.routers.media import generate_blurred_thumb
from app.security import verify_password
from app.schemas import (
    ContestCriterionRead,
    ContestantCreate,
    ContestantProfile,
    ContestantRead,
    ContestantUpdate,
    ContestantWithScore,
    RatingsUpsert,
    ReportRead,
    ReportSubmit,
    SocialLinkRead,
)

router = APIRouter(tags=["contestants"])

AUTO_HIDE_REPORT_COUNT = 3
MIN_VOTES_FOR_AVG = 3


def get_contestant_or_404(db: Session, contestant_id: int) -> Contestant:
    contestant = db.get(Contestant, contestant_id)
    if contestant is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Contestant not found"
        )
    return contestant


@router.post(
    "/contests/{join_code}/contestants",
    response_model=ContestantRead,
    status_code=status.HTTP_201_CREATED,
)
def join_contest(
    join_code: str,
    payload: ContestantCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Contestant:
    contest = get_contest_or_404(db, join_code)
    if contest.is_deleted:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="This contest has been deleted"
        )
    if contest.is_paused:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="This contest is currently paused by the creator"
        )
    if contest.status == ContestStatus.ended:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="This contest has ended"
        )
    if contest.allowed_email_domain:
        domain = contest.allowed_email_domain
        # Emails are stored lowercase at registration. Exact domain or any
        # subdomain of it passes (me@student.x.edu matches x.edu).
        if not (
            current_user.email.endswith(f"@{domain}")
            or current_user.email.endswith(f".{domain}")
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"This contest is for @{domain} students",
            )
    if contest.join_password_hash is not None:
        if not payload.password or not verify_password(
            payload.password, contest.join_password_hash
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Wrong contest password",
            )
    existing = (
        db.query(Contestant)
        .filter(
            Contestant.user_id == current_user.id,
            Contestant.contest_id == contest.id,
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You already joined this contest",
        )

    entry_payment = None
    if contest.entry_fee_cents > 0:
        entry_payment = (
            db.query(EntryPayment)
            .filter(
                EntryPayment.user_id == current_user.id,
                EntryPayment.contest_id == contest.id,
                EntryPayment.status == EntryPaymentStatus.paid,
            )
            .first()
        )
        if not entry_payment:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Entry fee payment required before joining this contest",
            )

    contestant = Contestant(
        user_id=current_user.id,
        contest_id=contest.id,
        **payload.model_dump(exclude={"socials", "password"}),
    )
    db.add(contestant)
    db.flush()
    if entry_payment:
        entry_payment.contestant_id = contestant.id
    for social in payload.socials:
        db.add(
            SocialLink(
                contestant_id=contestant.id,
                platform=social.platform,
                handle=social.handle,
            )
        )
    db.commit()
    db.refresh(contestant)
    invalidate_leaderboard_cache(contest.id)
    generate_blurred_thumb(contestant.id, contestant.photo_url)

    send_email(
        db,
        to=current_user.email,
        template_key="contest_joined",
        context={
            "contest_title": contest.title,
            "gender_category": contestant.gender_category.value,
            "contest_join_code": contest.join_code,
            "ends_at": contest.ends_at.strftime("%Y-%m-%d %H:%M UTC") if contest.ends_at else "",
            "contest_id": contest.id,
        },
        user_id=current_user.id,
        is_transactional_required=False,
    )

    return contestant



@router.patch("/contestants/{contestant_id}", response_model=ContestantRead)
def update_own_profile(
    contestant_id: int,
    payload: ContestantUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Contestant:
    contestant = get_contestant_or_404(db, contestant_id)
    if contestant.is_demo or contestant.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only edit your own profile",
        )

    for field, value in payload.model_dump(exclude={"socials"}).items():
        setattr(contestant, field, value)

    if payload.socials is not None:
        db.query(SocialLink).filter(
            SocialLink.contestant_id == contestant.id
        ).delete()
        for social in payload.socials:
            db.add(
                SocialLink(
                    contestant_id=contestant.id,
                    platform=social.platform,
                    handle=social.handle,
                )
            )

    db.commit()
    db.refresh(contestant)
    invalidate_leaderboard_cache(contestant.contest_id)
    generate_blurred_thumb(contestant.id, contestant.photo_url)
    return contestant


@router.get(
    "/contests/{join_code}/contestants",
    response_model=list[ContestantWithScore],
)
def list_contestants(
    join_code: str,
    gender: Gender | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[ContestantWithScore]:
    contest = get_contest_or_404(db, join_code)
    query = (
        db.query(Contestant)
        .join(User, Contestant.user_id == User.id)
        .filter(
            Contestant.contest_id == contest.id,
            Contestant.status == ContestantStatus.active,
            Contestant.is_demo == False,  # noqa: E712
            User.is_banned == False,  # noqa: E712
        )
    )
    if gender is not None:
        query = query.filter(Contestant.gender_category == gender)

    averages = contestant_averages(db, contest.id)
    return [
        ContestantWithScore(
            **ContestantRead.model_validate(c).model_dump(),
            avg_score=averages.get(c.id),
        )
        for c in query.all()
    ]


@router.get("/contestants/{contestant_id}", response_model=ContestantProfile)
def get_contestant_profile(
    contestant_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ContestantProfile:
    contestant = get_contestant_or_404(db, contestant_id)
    # Demo profiles have no real owner and never get a full profile page.
    # Removed/auto-hidden profiles are only visible to their owner;
    # banned users' profiles are hidden from everyone. `is_demo` is checked
    # first so `.user` (None for demo rows) is never dereferenced below.
    if contestant.is_demo or contestant.user.is_banned or (
        contestant.status != ContestantStatus.active
        and contestant.user_id != current_user.id
    ):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Contestant not found"
        )
    contest = check_contest_expiry(db, contestant.contest)

    criterion_rows = (
        db.query(ContestCriterion.key, func.avg(Rating.score))
        .join(ContestCriterion, Rating.criterion_id == ContestCriterion.id)
        .join(User, Rating.voter_id == User.id)
        .filter(
            Rating.contestant_id == contestant.id,
            User.is_banned == False,  # noqa: E712
        )
        .group_by(ContestCriterion.key)
        .all()
    )
    criterion_averages = {c: round(float(a), 2) for c, a in criterion_rows}
    vote_count = (
        db.query(func.count(func.distinct(Rating.voter_id)))
        .join(User, Rating.voter_id == User.id)
        .filter(
            Rating.contestant_id == contestant.id,
            User.is_banned == False,  # noqa: E712
        )
        .scalar()
        or 0
    )
    avg_score = (
        round(sum(criterion_averages.values()) / len(criterion_averages), 2)
        if criterion_averages and vote_count >= MIN_VOTES_FOR_AVG
        else None
    )
    my_ratings_rows = (
        db.query(ContestCriterion.key, Rating.score)
        .join(ContestCriterion, Rating.criterion_id == ContestCriterion.id)
        .filter(
            Rating.voter_id == current_user.id,
            Rating.contestant_id == contestant.id,
        )
        .all()
    )
    my_ratings = {key: score for key, score in my_ratings_rows}

    social_link_count = len(contestant.social_links)

    # Subscription gate: socials are visible only when the viewer has an
    # active (non-expired) subscription OR is viewing their own profile.
    is_own_profile = contestant.user_id == current_user.id
    sub_active = (
        current_user.has_socials_subscription
        and (
            current_user.subscription_expires_at is None
            or as_aware(current_user.subscription_expires_at) > utcnow()
        )
    )
    can_see_socials = (sub_active or is_own_profile) and contestant.socials_visible
    socials_locked = not can_see_socials and social_link_count > 0

    socials = (
        [SocialLinkRead.model_validate(s) for s in contestant.social_links]
        if can_see_socials
        else []
    )

    return ContestantProfile(
        **ContestantRead.model_validate(contestant).model_dump(),
        socials=socials,
        socials_locked=socials_locked,
        social_link_count=social_link_count,
        criterion_averages=criterion_averages,
        vote_count=vote_count,
        avg_score=avg_score,
        my_ratings=my_ratings,
        contest_status=contest.status,
        contest_join_code=contest.join_code,
        contest_title=contest.title,
        criteria=[ContestCriterionRead.model_validate(c) for c in contest.criteria],
    )


@router.put("/contestants/{contestant_id}/ratings", response_model=dict[str, int])
@limiter.limit(RATING_LIMIT)
def upsert_ratings(
    request: Request,
    contestant_id: int,
    payload: RatingsUpsert,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, int]:
    contestant = get_contestant_or_404(db, contestant_id)
    # Demo profiles never enter the rating flow. `is_demo` is checked first
    # so `.user` (None for demo rows) is never dereferenced below.
    if (
        contestant.is_demo
        or contestant.status != ContestantStatus.active
        or contestant.user.is_banned
    ):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Contestant not found"
        )
    if contestant.user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You cannot rate yourself",
        )
    contest = check_contest_expiry(db, contestant.contest)
    if contest.is_deleted:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This contest has been deleted — ratings are closed",
        )
    if contest.is_paused:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This contest is currently paused by the creator — ratings are paused",
        )
    if contest.status == ContestStatus.ended:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This contest has ended — ratings are closed",
        )

    contest_criteria = {c.key: c.id for c in contestant.contest.criteria}
    for criterion_key in payload.root.keys():
        if criterion_key not in contest_criteria:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Unknown criterion '{criterion_key}' for this contest",
            )

    is_first_vote_in_contest = (
        db.query(Rating.id)
        .join(Contestant, Rating.contestant_id == Contestant.id)
        .filter(Rating.voter_id == current_user.id, Contestant.contest_id == contestant.contest_id)
        .first()
        is None
    )

    existing = {
        r.criterion_id: r
        for r in db.query(Rating).filter(
            Rating.voter_id == current_user.id,
            Rating.contestant_id == contestant.id,
        )
    }
    for criterion_key, score in payload.root.items():
        crit_id = contest_criteria[criterion_key]
        if crit_id in existing:
            existing[crit_id].score = score
        else:
            db.add(
                Rating(
                    voter_id=current_user.id,
                    contestant_id=contestant.id,
                    criterion_id=crit_id,
                    score=score,
                )
            )
    db.commit()
    invalidate_leaderboard_cache(contestant.contest_id)

    if is_first_vote_in_contest:
        send_email(
            db,
            to=current_user.email,
            template_key="contest_joined_voter",
            context={
                "contest_title": contestant.contest.title,
                "contest_join_code": contestant.contest.join_code,
                "contest_id": contestant.contest_id,
            },
            user_id=current_user.id,
            is_transactional_required=False,
        )

    res_rows = (
        db.query(ContestCriterion.key, Rating.score)
        .join(ContestCriterion, Rating.criterion_id == ContestCriterion.id)
        .filter(
            Rating.voter_id == current_user.id,
            Rating.contestant_id == contestant.id,
        )
        .all()
    )
    return {key: score for key, score in res_rows}



@router.post(
    "/contestants/{contestant_id}/reports",
    response_model=ReportRead,
    status_code=status.HTTP_201_CREATED,
)
def report_contestant(
    contestant_id: int,
    payload: ReportSubmit,
    db: Session = Depends(get_db),
) -> Report:
    contestant = get_contestant_or_404(db, contestant_id)
    report = Report(
        contestant_id=contestant.id,
        reporter_email=payload.reporter_email,
        reason=payload.reason,
    )
    db.add(report)
    db.flush()

    open_reports = (
        db.query(func.count(Report.id))
        .filter(
            Report.contestant_id == contestant.id,
            Report.status == ReportStatus.open,
        )
        .scalar()
        or 0
    )
    if (
        open_reports >= AUTO_HIDE_REPORT_COUNT
        and contestant.status == ContestantStatus.active
    ):
        contestant.status = ContestantStatus.reported
        invalidate_leaderboard_cache(contestant.contest_id)

    db.commit()
    db.refresh(report)
    return report


@router.delete("/contestants/{contestant_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_own_profile(
    contestant_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    contestant = db.get(Contestant, contestant_id)
    if contestant is None or contestant.is_demo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Contestant not found"
        )
    if contestant.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only remove your own profile",
        )
    contestant.status = ContestantStatus.removed
    if contestant.contest.status == ContestStatus.active and contestant.contest.entry_fee_cents > 0:
        ep = (
            db.query(EntryPayment)
            .filter(
                EntryPayment.contest_id == contestant.contest_id,
                EntryPayment.user_id == current_user.id,
                EntryPayment.status == EntryPaymentStatus.paid,
            )
            .first()
        )
        if ep:
            ep.status = EntryPaymentStatus.refund_pending

    db.commit()
    invalidate_leaderboard_cache(contestant.contest_id)
