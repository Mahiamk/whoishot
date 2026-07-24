"""Tests for custom approval amount received and Total Income dashboard endpoint."""

import pytest
from app.db import SessionLocal
from app.models import Subscription, SubscriptionStatus, EntryPayment, EntryPaymentStatus
from tests.test_admin import make_admin_headers


def test_approve_payment_with_custom_amount(client, auth):
    user_headers = auth(client, "customamt@t.dev")
    res_sub = client.post(
        "/api/v1/subscriptions/checkout",
        headers=user_headers,
        json={"method": "manual", "receipt_hash": "hashamt123"},
    )
    session_id = res_sub.json()["session_id"]

    db = SessionLocal()
    sub_id = None
    try:
        sub = db.query(Subscription).filter(Subscription.provider_ref == session_id).first()
        sub_id = sub.id
        assert sub.amount == 900  # Default RM 9.00
    finally:
        db.close()

    admin_headers = make_admin_headers(client, auth)

    # Approve with custom specified amount received: RM 12.00 (1200 cents)
    res_approve = client.post(
        f"/api/v1/admin/payment-reviews/subscription/{sub_id}/approve",
        headers=admin_headers,
        json={"amount_received": 1200},
    )
    assert res_approve.status_code == 200
    assert res_approve.json()["status"] == "approved"
    assert res_approve.json()["amount"] == 1200

    db = SessionLocal()
    try:
        sub = db.query(Subscription).filter(Subscription.id == sub_id).first()
        assert sub.status.value == "paid"
        assert sub.amount == 1200
    finally:
        db.close()


def test_income_dashboard_summary_and_ledger(client, auth):
    admin_headers = make_admin_headers(client, auth)

    # Initial income check
    res_init = client.get("/api/v1/admin/income", headers=admin_headers)
    assert res_init.status_code == 200
    init_data = res_init.json()
    assert "summary" in init_data
    assert "items" in init_data

    init_total = init_data["summary"]["total_income_cents"]

    # Add approved subscription payment (RM 15.00)
    user_headers = auth(client, "incometester@t.dev")
    res_sub = client.post(
        "/api/v1/subscriptions/checkout",
        headers=user_headers,
        json={"method": "manual", "receipt_hash": "incomehash123"},
    )
    session_id = res_sub.json()["session_id"]

    db = SessionLocal()
    sub_id = None
    try:
        sub = db.query(Subscription).filter(Subscription.provider_ref == session_id).first()
        sub_id = sub.id
    finally:
        db.close()

    client.post(
        f"/api/v1/admin/payment-reviews/subscription/{sub_id}/approve",
        headers=admin_headers,
        json={"amount_received": 1500},
    )

    # Check updated income dashboard
    res_income = client.get("/api/v1/admin/income", headers=admin_headers)
    assert res_income.status_code == 200
    data = res_income.json()
    summary = data["summary"]

    assert summary["total_income_cents"] == init_total + 1500
    assert summary["manual_income_cents"] >= 1500

    item = next((i for i in data["items"] if i["provider_ref"] == session_id), None)
    assert item is not None
    assert item["amount_cents"] == 1500
    assert item["type"] == "subscription"
