"""Entry payment checkout router.

Handles checkout sessions for paid contest entry fees.
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.adapters.payment import get_adapter_for_provider, resolve_provider_for_country
from app.config import get_settings
from app.db import get_db
from app.deps import get_current_user
from app.models import Contest, ContestStatus, EntryPayment, EntryPaymentStatus, PaymentMethod, User, utcnow
from app.schemas import EntryCheckoutRequest, EntryCheckoutResponse, EntryPaymentStatusRead
from app.services.payment_service import verify_manual_payment

router = APIRouter(prefix="/entries", tags=["entries"])



@router.post("/checkout", response_model=EntryCheckoutResponse, status_code=status.HTTP_201_CREATED)

def checkout_entry(
    payload: EntryCheckoutRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> EntryCheckoutResponse:
    """Create a checkout session for paid contest entry fee."""
    settings = get_settings()

    contest = db.get(Contest, payload.contest_id)
    if contest is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Contest not found"
        )
    if contest.status == ContestStatus.ended:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="This contest has ended"
        )
    if contest.entry_fee_cents <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This contest has no entry fee",
        )

    # Check if user already paid for this contest
    existing_paid = (
        db.query(EntryPayment)
        .filter(
            EntryPayment.user_id == current_user.id,
            EntryPayment.contest_id == contest.id,
            EntryPayment.status == EntryPaymentStatus.paid,
        )
        .first()
    )
    if existing_paid:
        frontend_url = settings.FRONTEND_URL.rstrip("/")
        return EntryCheckoutResponse(
            checkout_url=f"{frontend_url}/subscribe/success?ref={existing_paid.provider_ref}&type=entry",
            session_id=existing_paid.provider_ref,
        )

    # Manual payment flow
    if payload.method == "manual" or payload.provider == "manual":
        existing_ep = (
            db.query(EntryPayment)
            .filter(
                EntryPayment.user_id == current_user.id,
                EntryPayment.contest_id == contest.id,
                EntryPayment.status.in_([
                    EntryPaymentStatus.awaiting_review,
                    EntryPaymentStatus.rejected,
                    EntryPaymentStatus.failed,
                    EntryPaymentStatus.pending,
                ]),
            )
            .order_by(EntryPayment.id.desc())
            .first()
        )

        if existing_ep:
            entry_payment = existing_ep
            ref_code = entry_payment.provider_ref
            entry_payment.receipt_url = payload.receipt_url
            entry_payment.receipt_url_submitted = payload.receipt_url_submitted or payload.receipt_url
            entry_payment.receipt_input_type = payload.receipt_input_type or ("url" if payload.receipt_url else None)
            entry_payment.receipt_hash = payload.receipt_hash
            entry_payment.review_note = payload.note
            entry_payment.status = EntryPaymentStatus.awaiting_review
            entry_payment.verify_status = None
            entry_payment.verify_provider_key = None
            entry_payment.verify_reference = None
            entry_payment.verify_amount = None
            entry_payment.verify_payer_name = None
            entry_payment.verify_raw_response = None
            entry_payment.verified_at = None
        else:
            ref_code = f"CC-ENTRY-{current_user.id}-{int(utcnow().timestamp())}-{uuid.uuid4().hex[:6]}"
            entry_payment = EntryPayment(
                user_id=current_user.id,
                contest_id=contest.id,
                amount_cents=contest.entry_fee_cents,
                payment_handle=payload.payment_handle.strip(),
                provider="manual",
                provider_ref=ref_code,
                method=PaymentMethod.manual,
                receipt_url=payload.receipt_url,
                receipt_url_submitted=payload.receipt_url_submitted or payload.receipt_url,
                receipt_input_type=payload.receipt_input_type or ("url" if payload.receipt_url else None),
                receipt_hash=payload.receipt_hash,
                review_note=payload.note,
                status=EntryPaymentStatus.awaiting_review,
            )
            db.add(entry_payment)

        db.commit()
        db.refresh(entry_payment)

        verify_manual_payment(
            db,
            entry_payment,
            expected_cents=contest.entry_fee_cents,
            currency=contest.currency,
            country=current_user.country,
            input_type=payload.receipt_input_type or ("url" if payload.receipt_url else None),
            url_or_ref=payload.receipt_url_submitted or payload.receipt_url,
        )
        db.refresh(entry_payment)
        return EntryCheckoutResponse(
            checkout_url="",
            session_id=ref_code,
            status=entry_payment.status.value if hasattr(entry_payment.status, "value") else str(entry_payment.status),
            review_note=entry_payment.review_note,
        )



    provider_name = payload.provider
    if not provider_name or provider_name == "auto":
        _, provider_name, _ = resolve_provider_for_country(current_user.country)

    adapter = get_adapter_for_provider(provider_name)
    res = adapter.create_checkout(
        contest.entry_fee_cents,
        contest.currency,
        {
            "user_id": current_user.id,
            "contest_id": contest.id,
            "type": "entry_fee",
            "description": f"Entry Fee for {contest.title}",
        },
    )

    entry_payment = EntryPayment(
        user_id=current_user.id,
        contest_id=contest.id,
        amount_cents=contest.entry_fee_cents,
        payment_handle=payload.payment_handle.strip(),
        provider=provider_name,
        provider_ref=res["provider_ref"],
        method=PaymentMethod.provider,
        status=EntryPaymentStatus.pending,
    )
    db.add(entry_payment)
    db.commit()
    db.refresh(entry_payment)

    return EntryCheckoutResponse(
        checkout_url=res["checkout_url"],
        session_id=res["provider_ref"],
    )



@router.get("/status", response_model=EntryPaymentStatusRead)
def entry_payment_status(
    contest_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> EntryPaymentStatusRead:
    """Check if current user has paid entry fee for the specified contest."""
    payment = (
        db.query(EntryPayment)
        .filter(
            EntryPayment.user_id == current_user.id,
            EntryPayment.contest_id == contest_id,
        )
        .order_by(EntryPayment.id.desc())
        .first()
    )
    if payment is None:
        return EntryPaymentStatusRead(has_paid=False)

    return EntryPaymentStatusRead(
        has_paid=payment.status == EntryPaymentStatus.paid,
        status=payment.status,
        provider_ref=payment.provider_ref,
        payment_handle=payment.payment_handle,
    )
