"""Admin payouts and refunds router."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.audit import audit
from app.db import get_db
from app.deps import require_admin
from app.models import (
    Contest,
    Contestant,
    EntryPayment,
    EntryPaymentStatus,
    Payout,
    PayoutRowStatus,
    PayoutStatus,
    User,
    utcnow,
)
from app.schemas import (
    PayoutMarkSentRequest,
    PayoutRead,
    RefundMarkDoneRequest,
    RefundRead,
)

router = APIRouter(prefix="/admin", tags=["admin-payouts"])


@router.get("/payouts", response_model=dict[str, list])
def list_pending_payouts_and_refunds(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> dict:
    """List pending payouts and pending refunds for super admin."""
    payouts = (
        db.query(Payout)
        .order_by(Payout.created_at.desc())
        .all()
    )

    payout_items = []
    for p in payouts:
        contestant_name = p.contestant.name if p.contestant else None
        user_email = p.contestant.user.email if (p.contestant and p.contestant.user) else None
        
        # Look up payment handle from contestant's entry payment if available
        payment_handle = None
        if p.contestant:
            ep = (
                db.query(EntryPayment)
                .filter(
                    EntryPayment.contest_id == p.contest_id,
                    EntryPayment.contestant_id == p.contestant_id,
                )
                .first()
            )
            if ep:
                payment_handle = ep.payment_handle

        payout_items.append(
            PayoutRead(
                id=p.id,
                contest_id=p.contest_id,
                contest_title=p.contest.title,
                contestant_id=p.contestant_id,
                contestant_name=contestant_name,
                user_email=user_email,
                payment_handle=payment_handle,
                rank=p.rank,
                amount_cents=p.amount_cents,
                status=p.status,
                created_at=p.created_at,
                sent_at=p.sent_at,
                provider_ref=p.provider_ref,
            )
        )

    refunds = (
        db.query(EntryPayment)
        .filter(
            EntryPayment.status.in_([EntryPaymentStatus.refund_pending, EntryPaymentStatus.refunded])
        )
        .order_by(EntryPayment.created_at.desc())
        .all()
    )

    refund_items = [
        RefundRead(
            id=ep.id,
            contest_id=ep.contest_id,
            contest_title=ep.contest.title,
            user_email=ep.user.email,
            payment_handle=ep.payment_handle,
            amount_cents=ep.amount_cents,
            status=ep.status,
            created_at=ep.created_at,
            provider_ref=ep.provider_ref,
        )
        for ep in refunds
    ]

    return {
        "payouts": payout_items,
        "refunds": refund_items,
    }


@router.post("/payouts/{payout_id}/mark-sent", response_model=PayoutRead)
def mark_payout_sent(
    payout_id: int,
    payload: PayoutMarkSentRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> PayoutRead:
    payout = db.get(Payout, payout_id)
    if payout is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Payout not found"
        )
    if payout.status == PayoutRowStatus.sent:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Payout already marked as sent"
        )

    payout.status = PayoutRowStatus.sent
    payout.provider_ref = payload.provider_ref
    payout.sent_at = utcnow()

    audit(
        db,
        admin.id,
        "payout.mark_sent",
        "payout",
        payout.id,
        {
            "contest_id": payout.contest_id,
            "amount_cents": payout.amount_cents,
            "provider_ref": payload.provider_ref,
        },
    )

    # Check if all payouts for this contest are now sent
    all_payouts = (
        db.query(Payout)
        .filter(Payout.contest_id == payout.contest_id)
        .all()
    )
    if all(p.status == PayoutRowStatus.sent for p in all_payouts):
        payout.contest.payout_status = PayoutStatus.paid

    db.commit()
    db.refresh(payout)

    contestant_name = payout.contestant.name if payout.contestant else None
    user_email = payout.contestant.user.email if (payout.contestant and payout.contestant.user) else None
    payment_handle = None
    if payout.contestant:
        ep = (
            db.query(EntryPayment)
            .filter(
                EntryPayment.contest_id == payout.contest_id,
                EntryPayment.contestant_id == payout.contestant_id,
            )
            .first()
        )
        if ep:
            payment_handle = ep.payment_handle

    return PayoutRead(
        id=payout.id,
        contest_id=payout.contest_id,
        contest_title=payout.contest.title,
        contestant_id=payout.contestant_id,
        contestant_name=contestant_name,
        user_email=user_email,
        payment_handle=payment_handle,
        rank=payout.rank,
        amount_cents=payout.amount_cents,
        status=payout.status,
        created_at=payout.created_at,
        sent_at=payout.sent_at,
        provider_ref=payout.provider_ref,
    )


@router.post("/refunds/{entry_payment_id}/mark-refunded", response_model=RefundRead)
def mark_refund_done(
    entry_payment_id: int,
    payload: RefundMarkDoneRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> RefundRead:
    ep = db.get(EntryPayment, entry_payment_id)
    if ep is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Entry payment not found"
        )
    if ep.status == EntryPaymentStatus.refunded:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Entry payment already marked as refunded"
        )

    ep.status = EntryPaymentStatus.refunded
    ep.provider_ref = payload.provider_ref

    audit(
        db,
        admin.id,
        "refund.mark_done",
        "entries_payments",
        ep.id,
        {
            "contest_id": ep.contest_id,
            "user_id": ep.user_id,
            "amount_cents": ep.amount_cents,
            "provider_ref": payload.provider_ref,
        },
    )

    db.commit()
    db.refresh(ep)

    return RefundRead(
        id=ep.id,
        contest_id=ep.contest_id,
        contest_title=ep.contest.title,
        user_email=ep.user.email,
        payment_handle=ep.payment_handle,
        amount_cents=ep.amount_cents,
        status=ep.status,
        created_at=ep.created_at,
        provider_ref=ep.provider_ref,
    )
