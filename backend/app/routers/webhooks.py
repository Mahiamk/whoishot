"""Webhook handler for payment provider callbacks.

Architecture
------------
Each POST /api/v1/webhooks/{provider} call:
1. Reads the raw body (needed for HMAC signature verification).
2. For real providers: verify signature header against SUBSCRIPTION_WEBHOOK_SECRET.
   For 'mock': skip verification (only works when MOCK_PAYMENT=True).
3. Extracts provider_ref from the payload.
4. Looks up the Subscription row — if already paid, return 200 immediately
   (idempotency: same webhook twice = one activation).
5. Sets subscription.status = paid, user.has_socials_subscription = True,
   user.subscription_expires_at = now + 30 days.

Step 22 will add real signature verification per provider.
"""
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.models import (
    EntryPayment,
    EntryPaymentStatus,
    Subscription,
    SubscriptionStatus,
    User,
    utcnow,
)

router = APIRouter(prefix="/webhooks", tags=["webhooks"])

from app.services.payment_service import activate_entry_payment, activate_subscription



from app.adapters.payment import get_adapter_for_provider


@router.post("/{provider}", status_code=status.HTTP_200_OK)
async def handle_webhook(
    provider: str,
    request: Request,
    db: Session = Depends(get_db),
) -> dict:
    """Receive a payment confirmation webhook from a provider.

    Delegates signature verification and payload extraction to the
    provider adapter (MockAdapter, TngAdapter, BirrAdapter).
    """
    settings = get_settings()
    raw_body = await request.body()

    if provider == "mock" and not settings.MOCK_PAYMENT:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Mock webhooks are disabled in this environment",
        )

    adapter = get_adapter_for_provider(provider)
    try:
        headers_dict = {k.lower(): v for k, v in request.headers.items()}
        res = adapter.verify_webhook(headers_dict, raw_body)
        provider_ref = res["provider_ref"]
    except ValueError as err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(err),
        )

    # ------------------------------------------------------------------
    # Idempotency: look up subscription or entry payment by provider_ref
    # ------------------------------------------------------------------
    sub = (
        db.query(Subscription)
        .filter(Subscription.provider_ref == provider_ref)
        .first()
    )

    if sub is not None:
        if sub.status == SubscriptionStatus.paid:
            return {"status": "already_activated", "type": "subscription", "provider_ref": provider_ref}
        if sub.status in (SubscriptionStatus.failed, SubscriptionStatus.refunded):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Subscription is in terminal state: {sub.status.value}",
            )
        activate_subscription(db, sub)
        return {"status": "activated", "type": "subscription", "provider_ref": provider_ref}

    ep = (
        db.query(EntryPayment)
        .filter(EntryPayment.provider_ref == provider_ref)
        .first()
    )

    if ep is not None:
        if ep.status == EntryPaymentStatus.paid:
            return {"status": "already_activated", "type": "entry_payment", "provider_ref": provider_ref}
        if ep.status in (EntryPaymentStatus.refund_pending, EntryPaymentStatus.refunded):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Entry payment is in terminal/refund state: {ep.status.value}",
            )
        activate_entry_payment(db, ep)

        return {"status": "activated", "type": "entry_payment", "provider_ref": provider_ref}

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="No subscription or entry payment found for this provider_ref",
    )
