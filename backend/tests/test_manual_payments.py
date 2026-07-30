"""Tests for Manual Payment Method, Receipt Upload, and Admin Payment Review Queue."""

import hashlib
import json
import pytest
from app.db import SessionLocal
from app.models import AdminAuditLog, EntryPayment, Subscription


def test_receipt_upload_validation_and_hash(client, auth):
    headers = auth(client, "uploader@t.dev")

    # Invalid file type
    res_bad_type = client.post(
        "/api/v1/payments/upload-receipt",
        headers=headers,
        files={"file": ("test.txt", b"hello world", "text/plain")},
    )
    assert res_bad_type.status_code == 400
    assert "Receipt file must be a JPEG, PNG, WebP image or PDF" in res_bad_type.json()["detail"]

    # Valid PNG image upload
    png_bytes = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4"
    res = client.post(
        "/api/v1/payments/upload-receipt",
        headers=headers,
        files={"file": ("receipt.png", png_bytes, "image/png")},
    )
    assert res.status_code == 201
    data = res.json()
    assert "url" in data
    assert "receipts/" in data["url"]
    assert "hash" in data

    assert len(data["hash"]) == 64


def test_manual_subscription_checkout(client, auth):
    headers = auth(client, "subuser@t.dev")

    res = client.post(
        "/api/v1/subscriptions/checkout",
        headers=headers,
        json={
            "provider": "manual",
            "method": "manual",
            "receipt_url": "/media/receipts/test.png",
            "receipt_hash": "abcd1234hash",
            "note": "Paid via Maybank",
        },
    )
    assert res.status_code == 201
    data = res.json()
    assert data["session_id"].startswith("CC-SUB-")

    db = SessionLocal()
    try:
        sub = db.query(Subscription).filter(Subscription.provider_ref == data["session_id"]).first()
        assert sub is not None
        assert sub.status.value == "awaiting_review"
        assert sub.method.value == "manual"
        assert sub.receipt_url == "/media/receipts/test.png"
        assert sub.receipt_hash == "abcd1234hash"
    finally:
        db.close()


from tests.test_admin import make_admin_headers


def test_admin_approve_subscription_payment(client, auth):
    # 1. User submits manual subscription payment
    user_headers = auth(client, "subapprove@t.dev")
    res_sub = client.post(
        "/api/v1/subscriptions/checkout",
        headers=user_headers,
        json={
            "method": "manual",
            "receipt_url": "/media/receipts/sub.png",
            "receipt_hash": "subhash123",
            "note": "Paid subscription",
        },
    )
    session_id = res_sub.json()["session_id"]

    db = SessionLocal()
    sub_id = None
    try:
        sub = db.query(Subscription).filter(Subscription.provider_ref == session_id).first()
        sub_id = sub.id
    finally:
        db.close()

    # 2. Admin reviews payment queue
    admin_headers = make_admin_headers(client, auth)
    res_list = client.get("/api/v1/admin/payment-reviews", headers=admin_headers)
    assert res_list.status_code == 200
    queue = res_list.json()
    target = next((item for item in queue if item["provider_ref"] == session_id), None)
    assert target is not None
    assert target["status"] == "awaiting_review"

    # 3. Admin approves
    res_approve = client.post(
        f"/api/v1/admin/payment-reviews/subscription/{sub_id}/approve",
        headers=admin_headers,
    )
    assert res_approve.status_code == 200
    assert res_approve.json()["status"] == "approved"

    # Verify activation identical to webhook
    db = SessionLocal()
    try:
        sub = db.query(Subscription).filter(Subscription.id == sub_id).first()
        assert sub.status.value == "paid"
        assert sub.user.has_socials_subscription is True

        audit_entry = (
            db.query(AdminAuditLog)
            .filter(AdminAuditLog.action == "payment.approve", AdminAuditLog.target_id == sub_id)
            .first()
        )
        assert audit_entry is not None
    finally:
        db.close()


def test_admin_reject_payment_with_note(client, auth):
    user_headers = auth(client, "rejectuser@t.dev")
    res_sub = client.post(
        "/api/v1/subscriptions/checkout",
        headers=user_headers,
        json={
            "method": "manual",
            "receipt_url": "/media/receipts/reject.png",
            "receipt_hash": "rejecthash123",
        },
    )
    session_id = res_sub.json()["session_id"]

    db = SessionLocal()
    sub_id = None
    try:
        sub = db.query(Subscription).filter(Subscription.provider_ref == session_id).first()
        sub_id = sub.id
    finally:
        db.close()

    admin_headers = make_admin_headers(client, auth)

    # Missing note should fail
    res_bad = client.post(
        f"/api/v1/admin/payment-reviews/subscription/{sub_id}/reject",
        headers=admin_headers,
        json={"review_note": "  "},
    )
    assert res_bad.status_code == 400

    # Valid reject
    res_reject = client.post(
        f"/api/v1/admin/payment-reviews/subscription/{sub_id}/reject",
        headers=admin_headers,
        json={"review_note": "Receipt unreadable, please re-upload clear image"},
    )
    assert res_reject.status_code == 200
    assert res_reject.json()["status"] == "rejected"

    db = SessionLocal()
    try:
        sub = db.query(Subscription).filter(Subscription.id == sub_id).first()
        assert sub.status.value == "rejected"
        assert sub.review_note == "Receipt unreadable, please re-upload clear image"
        assert sub.user.has_socials_subscription is False
    finally:
        db.close()


def test_duplicate_hash_warning(client, auth):
    # 1. Approved payment with receipt hash
    user1_headers = auth(client, "user1dup@t.dev")
    res1 = client.post(
        "/api/v1/subscriptions/checkout",
        headers=user1_headers,
        json={"method": "manual", "receipt_hash": "samehash999"},
    )
    sub1_ref = res1.json()["session_id"]

    db = SessionLocal()
    sub1_id = None
    try:
        sub1 = db.query(Subscription).filter(Subscription.provider_ref == sub1_ref).first()
        sub1_id = sub1.id
    finally:
        db.close()

    admin_headers = make_admin_headers(client, auth)
    client.post(f"/api/v1/admin/payment-reviews/subscription/{sub1_id}/approve", headers=admin_headers)

    # 2. Second user submits same receipt hash
    user2_headers = auth(client, "user2dup@t.dev")
    res2 = client.post(
        "/api/v1/subscriptions/checkout",
        headers=user2_headers,
        json={"method": "manual", "receipt_hash": "samehash999"},
    )
    sub2_ref = res2.json()["session_id"]

    # 3. Queue check
    res_queue = client.get("/api/v1/admin/payment-reviews", headers=admin_headers)
    assert res_queue.status_code == 200
    queue = res_queue.json()
    item2 = next((i for i in queue if i["provider_ref"] == sub2_ref), None)
    assert item2 is not None
    assert item2["is_duplicate_hash"] is True
