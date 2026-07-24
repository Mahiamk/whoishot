from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.audit import audit
from app.contest_expiry import check_contest_expiry
from app.db import get_db
from app.deps import get_current_user
from app.info_requests import check_expire

from app.models import (
    Contestant,
    EntryPayment,
    InfoRequest,
    InfoRequestStatus,
    PaymentMethod,
    Report,
    Subscription,
    User,
    utcnow,
)
from app.routers.contests import rank_in_bracket
from app.schemas import (
    InfoRequestRespond,
    MyContestantEntry,
    MyInfoRequestItem,
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
                status=contestant.status,
                criterion_averages=criterion_averages,
                vote_count=vote_count,
                avg_score=avg_score,
                rank=rank,
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

