"""Payment Activation Service.

Shared activation logic for both provider webhooks and admin manual payment approval.
"""
from datetime import timedelta
from sqlalchemy.orm import Session

from app.models import (
    EntryPayment,
    EntryPaymentStatus,
    Subscription,
    SubscriptionStatus,
    User,
    utcnow,
)

SUBSCRIPTION_DAYS = 30


def activate_subscription(db: Session, sub: Subscription) -> None:
    """Flip subscription to paid and grant 30 days access to the user."""
    sub.status = SubscriptionStatus.paid
    user: User = sub.user
    if user is not None:
        user.has_socials_subscription = True
        user.subscription_expires_at = utcnow() + timedelta(days=SUBSCRIPTION_DAYS)
    db.commit()


def activate_entry_payment(db: Session, ep: EntryPayment) -> None:
    """Flip contest entry payment to paid."""
    ep.status = EntryPaymentStatus.paid
    db.commit()


def verify_manual_payment(
    db: Session,
    record: Subscription | EntryPayment,
    expected_cents: int,
    currency: str,
    country: str | None = None,
    input_type: str | None = "url",
    url_or_ref: str | None = None,
    image_bytes: bytes | None = None,
    filename: str | None = None,
) -> None:
    """Run v.odit.et receipt verification, duplicate pre-check, and amount reconciliation for Ethiopian payments."""
    from app.services.voditet_service import (
        VoditetClient,
        check_duplicate_payment,
        parse_voditet_response,
    )

    record.receipt_input_type = input_type
    if url_or_ref:
        record.receipt_url_submitted = url_or_ref

    # Pre-check: If user already has an active pending payment awaiting review or duplicate hash/URL
    if check_duplicate_payment(db, record):
        if isinstance(record, Subscription):
            record.status = SubscriptionStatus.rejected
        else:
            record.status = EntryPaymentStatus.rejected
        record.review_note = "duplicate_receipt"
        record.verify_status = "error"
        db.commit()
        return

    # Rule: MY payments never call v.odit.et
    if currency == "MYR" or country == "MY" or getattr(record, "provider", None) == "tng":
        db.commit()
        return

    # Call v.odit.et
    client = VoditetClient()
    rec_type = "sub" if isinstance(record, Subscription) else "entry"
    idem_key = f"payment-{rec_type}-{record.id}"

    if input_type == "image" and image_bytes:
        env = client.verify_image(image_bytes, filename or "receipt.png", idem_key, expected_cents)
    elif url_or_ref:
        env = client.verify_url(url_or_ref, idem_key, expected_cents)
    else:
        db.commit()
        return

    parsed = parse_voditet_response(env)
    record.verify_provider_key = parsed.get("verify_provider_key")
    record.verify_source = parsed.get("verify_source")
    record.verify_reference = parsed.get("verify_reference")
    record.verify_amount = parsed.get("verify_amount")
    record.verify_currency = parsed.get("verify_currency")
    record.verify_payer_name = parsed.get("verify_payer_name")
    record.verify_status = parsed.get("verify_status")
    record.verify_raw_response = parsed.get("verify_raw_response")
    record.verified_at = utcnow()

    # CampusCrown Duplicate Check: same (provider_key, reference) pair twice auto-rejects
    if check_duplicate_payment(db, record, record.verify_provider_key, record.verify_reference):
        if isinstance(record, Subscription):
            record.status = SubscriptionStatus.rejected
        else:
            record.status = EntryPaymentStatus.rejected
        record.review_note = "duplicate_receipt"
        record.verify_status = "error"
        db.commit()
        return

    # Amount Reconciliation: amount mismatch queued, not auto-rejected
    v_amt = parsed.get("verify_amount")
    if v_amt is not None and abs(v_amt - expected_cents) > 100:
        record.verify_status = "amount_mismatch"

    db.commit()


