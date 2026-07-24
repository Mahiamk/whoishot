"""Subscription checkout endpoint.

Step 22 will wire real payment providers (TNG, Birr).  For now the only
supported provider is 'mock', which is available when MOCK_PAYMENT=True in
settings and immediately redirects to a success URL without charging anything.
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.deps import get_current_user
from app.adapters.payment import get_adapter_for_provider, resolve_provider_for_country

from app.models import PaymentMethod, Subscription, SubscriptionStatus, User, as_aware, utcnow
from app.schemas import CheckoutRequest, CheckoutResponse, SubscriptionRead
from app.services.payment_service import verify_manual_payment


router = APIRouter(prefix="/subscriptions", tags=["subscriptions"])


@router.post("/checkout", response_model=CheckoutResponse, status_code=status.HTTP_201_CREATED)

def checkout(
    payload: CheckoutRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CheckoutResponse:
    """Create a checkout session for the social-links subscription.

    Supports both online payment providers and manual bank/TnG transfer.
    """
    settings = get_settings()

    provider_name = payload.provider
    if not provider_name or provider_name == "auto":
        _, provider_name, currency = resolve_provider_for_country(current_user.country)
    elif provider_name == "tng":
        currency = "MYR"
    elif provider_name in ("birr", "chapa"):
        currency = "ETB"
    else:
        currency = settings.SUBSCRIPTION_CURRENCY

    # If Ethiopian receipt link / image / provider is supplied for manual payment, set currency to ETB
    if (payload.method == "manual" or payload.provider == "manual") and (
        payload.receipt_input_type
        or payload.receipt_url_submitted
        or (payload.receipt_url and any(k in payload.receipt_url.lower() for k in ("telebirr", "cbe", "zemen", "boa", "awash")))
        or current_user.country == "ET"
    ):
        currency = "ETB"

    # Manual payment flow
    if payload.method == "manual" or payload.provider == "manual":
        # Check if user already has an existing non-paid manual subscription submission
        existing_sub = (
            db.query(Subscription)
            .filter(
                Subscription.user_id == current_user.id,
                Subscription.status.in_([
                    SubscriptionStatus.awaiting_review,
                    SubscriptionStatus.rejected,
                    SubscriptionStatus.failed,
                    SubscriptionStatus.pending,
                ]),
            )
            .order_by(Subscription.id.desc())
            .first()
        )

        if existing_sub:
            sub = existing_sub
            ref_code = sub.provider_ref
            sub.receipt_url = payload.receipt_url
            sub.receipt_url_submitted = payload.receipt_url_submitted or payload.receipt_url
            sub.receipt_input_type = payload.receipt_input_type or ("url" if payload.receipt_url else None)
            sub.receipt_hash = payload.receipt_hash
            sub.review_note = payload.note
            sub.status = SubscriptionStatus.awaiting_review
            sub.currency = currency
            sub.verify_status = None
            sub.verify_provider_key = None
            sub.verify_reference = None
            sub.verify_amount = None
            sub.verify_payer_name = None
            sub.verify_raw_response = None
            sub.verified_at = None
        else:
            ref_code = f"CC-SUB-{current_user.id}-{int(utcnow().timestamp())}-{uuid.uuid4().hex[:6]}"
            sub = Subscription(
                user_id=current_user.id,
                provider="manual",
                provider_ref=ref_code,
                amount=settings.SUBSCRIPTION_PRICE_CENTS,
                currency=currency,
                method=PaymentMethod.manual,
                receipt_url=payload.receipt_url,
                receipt_url_submitted=payload.receipt_url_submitted or payload.receipt_url,
                receipt_input_type=payload.receipt_input_type or ("url" if payload.receipt_url else None),
                receipt_hash=payload.receipt_hash,
                review_note=payload.note,
                status=SubscriptionStatus.awaiting_review,
            )
            db.add(sub)

        db.commit()
        db.refresh(sub)

        verify_manual_payment(
            db,
            sub,
            expected_cents=settings.SUBSCRIPTION_PRICE_CENTS,
            currency=currency,
            country=current_user.country,
            input_type=payload.receipt_input_type or ("url" if payload.receipt_url else None),
            url_or_ref=payload.receipt_url_submitted or payload.receipt_url,
        )
        db.refresh(sub)
        return CheckoutResponse(
            checkout_url="",
            session_id=ref_code,
            status=sub.status.value if hasattr(sub.status, "value") else str(sub.status),
            review_note=sub.review_note,
        )



    adapter = get_adapter_for_provider(provider_name)
    res = adapter.create_checkout(
        settings.SUBSCRIPTION_PRICE_CENTS,
        currency,
        {"user_id": current_user.id, "type": "subscription"},
    )

    sub = Subscription(
        user_id=current_user.id,
        provider=provider_name,
        provider_ref=res["provider_ref"],
        amount=settings.SUBSCRIPTION_PRICE_CENTS,
        currency=currency,
        method=PaymentMethod.provider,
        status=SubscriptionStatus.pending,
    )
    db.add(sub)
    db.commit()
    db.refresh(sub)

    return CheckoutResponse(checkout_url=res["checkout_url"], session_id=res["provider_ref"])



@router.get("/me", response_model=SubscriptionRead | None)
def get_my_subscription(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SubscriptionRead | None:
    """Return the user's most recent paid subscription, or None."""
    sub = (
        db.query(Subscription)
        .filter(
            Subscription.user_id == current_user.id,
            Subscription.status == SubscriptionStatus.paid,
        )
        .order_by(Subscription.id.desc())
        .first()
    )
    if sub is None:
        return None
    return SubscriptionRead(
        id=sub.id,
        provider=sub.provider,
        provider_ref=sub.provider_ref,
        amount=sub.amount,
        currency=sub.currency,
        status=sub.status,
        created_at=sub.created_at,
    )


@router.get("/status")
def subscription_status(
    current_user: User = Depends(get_current_user),
) -> dict:
    """Convenience endpoint: is the current user's subscription active?"""
    active = current_user.has_socials_subscription and (
        current_user.subscription_expires_at is None
        or as_aware(current_user.subscription_expires_at) > utcnow()
    )
    return {
        "has_socials_subscription": current_user.has_socials_subscription,
        "subscription_expires_at": current_user.subscription_expires_at,
        "active": active,
    }
