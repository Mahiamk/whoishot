from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.audit import audit
from app.contest_expiry import check_contest_expiry
from app.db import get_db
from app.deps import get_current_user
from app.info_requests import check_expire

from app.models import (
    Contestant,
    ContestantStatus,
    EntryPayment,
    InfoRequest,
    InfoRequestStatus,
    IntroductionStatus,
    PartnerInquiry,
    PartnerIntroduction,
    PaymentMethod,
    Rating,
    Report,
    Subscription,
    User,
    utcnow,
)
from app.routers.contests import _bracket_stats, rank_in_bracket
from app.schemas import (
    InfoRequestRespond,
    IntroductionRespond,
    MyContestantEntry,
    MyInfoRequestItem,
    PartnerIntroductionRead,
    PasswordChange,
    UserPaymentItem,
    UserRead,
    UserUpdate,
)
from app.security import hash_password, verify_password

router = APIRouter(prefix="/users", tags=["users"])



@router.patch("/me", response_model=UserRead)
def update_me(
    payload: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> User:
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(current_user, field, value)
    db.commit()
    db.refresh(current_user)
    return current_user


@router.post("/me/password", status_code=status.HTTP_200_OK)
def change_password(
    payload: PasswordChange,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, str]:
    if not verify_password(payload.old_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Current password is incorrect",
        )
    current_user.password_hash = hash_password(payload.new_password)
    db.commit()
    return {"detail": "Password updated"}


@router.get("/me/contestants", response_model=list[MyContestantEntry])
def get_my_contestants(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[MyContestantEntry]:
    entries = (
        db.query(Contestant)
        .options(joinedload(Contestant.contest))
        .filter(Contestant.user_id == current_user.id)
        .order_by(Contestant.id.desc())
        .all()
    )

    results: list[MyContestantEntry] = []
    for contestant in entries:
        contest = check_contest_expiry(db, contestant.contest)
        rank, avg_score, criterion_averages, vote_count = (
            rank_in_bracket(
                db,
                contestant.contest_id,
                contestant.gender_category,
                contestant.id,
            )
            if contestant.status.value == "active"
            else (None, None, {}, 0)
        )

        # Participation counts
        total_contestants = (
            db.query(func.count(Contestant.id))
            .filter(
                Contestant.contest_id == contest.id,
                Contestant.status == ContestantStatus.active,
            )
            .scalar()
            or 0
        )
        total_voters = (
            db.query(func.count(func.distinct(Rating.voter_id)))
            .join(Contestant, Rating.contestant_id == Contestant.id)
            .filter(Contestant.contest_id == contest.id)
            .scalar()
            or 0
        )
        total_ratings = (
            db.query(func.count(Rating.id))
            .join(Contestant, Rating.contestant_id == Contestant.id)
            .filter(Contestant.contest_id == contest.id)
            .scalar()
            or 0
        )

        # Bracket scores distribution & normal curve parameters
        b_stats = _bracket_stats(db, contestant.contest_id, contestant.gender_category)
        bracket_contestants = len(b_stats)
        bracket_scores: list[float] = []
        for s in b_stats:
            c_avgs = s.get("criterion_averages", {})
            if c_avgs:
                s_val = round(sum(c_avgs.values()) / len(c_avgs), 2)
                bracket_scores.append(s_val)

        if bracket_scores:
            mean_score = round(sum(bracket_scores) / len(bracket_scores), 2)
            if len(bracket_scores) > 1:
                variance = sum((x - mean_score) ** 2 for x in bracket_scores) / (
                    len(bracket_scores) - 1
                )
                std_dev = round(max(0.2, variance ** 0.5), 2)
            else:
                std_dev = 1.0
        else:
            mean_score = 5.0
            std_dev = 1.0

        percentile: float | None = None
        if avg_score is not None and bracket_scores:
            count_below = sum(1 for s in bracket_scores if s < avg_score)
            percentile = round((count_below / len(bracket_scores)) * 100, 1)

        results.append(
            MyContestantEntry(
                contestant_id=contestant.id,
                contest_id=contestant.contest_id,
                contest_title=contest.title,
                contest_join_code=contest.join_code,
                contest_status=contest.status,
                name=contestant.name,
                photo_url=contestant.photo_url,
                gender_category=contestant.gender_category,
                age=contestant.age,
                country=contestant.country,
                hobbies=contestant.hobbies,
                fav_things=contestant.fav_things,
                relationship_status=contestant.relationship_status,
                socials_visible=contestant.socials_visible,
                open_to_opportunities=contestant.open_to_opportunities,
                status=contestant.status,
                criterion_averages=criterion_averages,
                vote_count=vote_count,
                avg_score=avg_score,
                rank=rank,
                total_contestants=total_contestants,
                total_voters=total_voters,
                total_ratings=total_ratings,
                bracket_contestants=bracket_contestants,
                bracket_scores=bracket_scores,
                mean_score=mean_score,
                std_dev=std_dev,
                percentile=percentile,
                ends_at=contest.ends_at,
                is_paused=contest.is_paused,
                is_deleted=contest.is_deleted,
                is_hidden=contest.is_hidden,
            )
        )
    return results


@router.get("/me/info-requests", response_model=list[MyInfoRequestItem])
def get_my_info_requests(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[MyInfoRequestItem]:
    requests = (
        db.query(InfoRequest)
        .options(
            joinedload(InfoRequest.report)
            .joinedload(Report.contestant)
            .joinedload(Contestant.contest)
        )
        .filter(InfoRequest.target_user_id == current_user.id)
        .order_by(InfoRequest.id.desc())
        .all()
    )
    # Reporter identity is never part of this payload — only message,
    # status, deadline, and enough contest context to act on it.
    items: list[MyInfoRequestItem] = []
    for ir in requests:
        ir = check_expire(db, ir)
        contestant = ir.report.contestant
        items.append(
            MyInfoRequestItem(
                id=ir.id,
                message=ir.message,
                status=ir.status,
                user_response=ir.user_response,
                deadline_at=ir.deadline_at,
                created_at=ir.created_at,
                responded_at=ir.responded_at,
                contest_title=contestant.contest.title,
                contest_join_code=contestant.contest.join_code,
                contestant_name=contestant.name,
            )
        )
    return items


@router.post(
    "/me/info-requests/{info_request_id}/respond",
    response_model=MyInfoRequestItem,
)
def respond_to_info_request(
    info_request_id: int,
    payload: InfoRequestRespond,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MyInfoRequestItem:
    ir = (
        db.query(InfoRequest)
        .options(
            joinedload(InfoRequest.report)
            .joinedload(Report.contestant)
            .joinedload(Contestant.contest)
        )
        .filter(InfoRequest.id == info_request_id)
        .first()
    )
    if ir is None or ir.target_user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Request not found"
        )

    ir = check_expire(db, ir)
    if ir.status == InfoRequestStatus.expired:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This request has expired and can no longer be answered",
        )
    if ir.status != InfoRequestStatus.pending:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You've already responded to this request",
        )

    ir.user_response = payload.response
    ir.status = InfoRequestStatus.responded
    ir.responded_at = utcnow()
    audit(
        db,
        ir.admin,
        "info_request.respond",
        "info_request",
        ir.id,
        {"report_id": ir.report_id},
    )
    db.commit()
    db.refresh(ir)

    contestant = ir.report.contestant
    return MyInfoRequestItem(
        id=ir.id,
        message=ir.message,
        status=ir.status,
        user_response=ir.user_response,
        deadline_at=ir.deadline_at,
        created_at=ir.created_at,
        responded_at=ir.responded_at,
        contest_title=contestant.contest.title,
        contest_join_code=contestant.contest.join_code,
        contestant_name=contestant.name,
    )


@router.get("/me/payments", response_model=list[UserPaymentItem])
def get_my_payments(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[UserPaymentItem]:
    """Return user's manual payment sessions and review statuses."""
    subs = (
        db.query(Subscription)
        .filter(
            Subscription.user_id == current_user.id,
            Subscription.method == PaymentMethod.manual,
        )
        .order_by(Subscription.id.desc())
        .all()
    )
    eps = (
        db.query(EntryPayment)
        .filter(
            EntryPayment.user_id == current_user.id,
            EntryPayment.method == PaymentMethod.manual,
        )
        .order_by(EntryPayment.id.desc())
        .all()
    )

    items: list[UserPaymentItem] = []
    for s in subs:
        items.append(
            UserPaymentItem(
                id=s.id,
                type="subscription",
                provider_ref=s.provider_ref,
                amount=s.amount,
                currency=s.currency,
                status=s.status.value,
                review_note=s.review_note,
                receipt_url=s.receipt_url,
                created_at=s.created_at,
                reviewed_at=s.reviewed_at,
            )
        )
    for e in eps:
        items.append(
            UserPaymentItem(
                id=e.id,
                type="entry_fee",
                provider_ref=e.provider_ref,
                amount=e.amount_cents,
                currency="MYR",
                status=e.status.value,
                review_note=e.review_note,
                receipt_url=e.receipt_url,
                created_at=e.created_at,
                reviewed_at=e.reviewed_at,
            )
        )

    items.sort(key=lambda x: x.created_at, reverse=True)
    return items


# --- User Partner Introductions ---

def _format_partner_introduction(intro: PartnerIntroduction) -> PartnerIntroductionRead:
    res = PartnerIntroductionRead.model_validate(intro)
    if intro.contestant:
        res.contestant_name = intro.contestant.name
        res.contestant_photo_url = intro.contestant.photo_url
        if intro.contestant.contest:
            res.contest_title = intro.contestant.contest.title
    if intro.inquiry:
        res.company_name = intro.inquiry.company_name
        res.contact_name = intro.inquiry.contact_name
        res.contact_email = intro.inquiry.email
        res.contact_phone = intro.inquiry.phone
        res.inquiry_type = intro.inquiry.inquiry_type.value
        res.inquiry_message = intro.inquiry.message
        res.inquiry_interested_in = intro.inquiry.interested_in
    return res


@router.get("/me/introductions", response_model=list[PartnerIntroductionRead])
def get_my_introductions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[PartnerIntroductionRead]:
    contestant_ids = [
        c.id for c in db.query(Contestant.id).filter(Contestant.user_id == current_user.id).all()
    ]
    if not contestant_ids:
        return []

    intros = (
        db.query(PartnerIntroduction)
        .options(
            joinedload(PartnerIntroduction.contestant).joinedload(Contestant.contest),
            joinedload(PartnerIntroduction.inquiry),
        )
        .filter(PartnerIntroduction.contestant_id.in_(contestant_ids))
        .order_by(PartnerIntroduction.id.desc())
        .all()
    )

    from datetime import timezone
    now = utcnow()
    updated = False
    for intro in intros:
        if intro.status == IntroductionStatus.pending_consent:
            deadline = intro.deadline_at
            if deadline.tzinfo is None:
                deadline = deadline.replace(tzinfo=timezone.utc)
            if now > deadline:
                intro.status = IntroductionStatus.expired
                audit(
                    db,
                    None,
                    "partner_introduction.expire",
                    "partner_introduction",
                    intro.id,
                    {"reason": "deadline_passed"},
                )
                updated = True

    if updated:
        db.commit()

    return [_format_partner_introduction(intro) for intro in intros]


@router.post("/me/introductions/{intro_id}/respond", response_model=PartnerIntroductionRead)
def respond_partner_introduction(
    intro_id: int,
    payload: IntroductionRespond,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PartnerIntroductionRead:
    contestant_ids = [
        c.id for c in db.query(Contestant.id).filter(Contestant.user_id == current_user.id).all()
    ]
    intro = (
        db.query(PartnerIntroduction)
        .options(
            joinedload(PartnerIntroduction.contestant).joinedload(Contestant.contest),
            joinedload(PartnerIntroduction.inquiry),
        )
        .filter(
            PartnerIntroduction.id == intro_id,
            PartnerIntroduction.contestant_id.in_(contestant_ids),
        )
        .first()
    )
    if intro is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Introduction not found or not owned by your contestant profile",
        )

    from datetime import timezone
    now = utcnow()
    deadline = intro.deadline_at
    if deadline.tzinfo is None:
        deadline = deadline.replace(tzinfo=timezone.utc)

    if intro.status == IntroductionStatus.pending_consent and now > deadline:
        intro.status = IntroductionStatus.expired
        audit(
            db,
            None,
            "partner_introduction.expire",
            "partner_introduction",
            intro.id,
            {"reason": "deadline_passed"},
        )
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Introduction proposal has expired",
        )

    if intro.status != IntroductionStatus.pending_consent:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Introduction is no longer pending",
        )

    if payload.action == "accept":
        intro.status = IntroductionStatus.accepted
    else:
        intro.status = IntroductionStatus.declined

    intro.responded_at = now
    audit(
        db,
        None,
        "partner_introduction.respond",
        "partner_introduction",
        intro.id,
        {"action": payload.action, "user_id": current_user.id},
    )
    db.commit()
    db.refresh(intro)

    return _format_partner_introduction(intro)


