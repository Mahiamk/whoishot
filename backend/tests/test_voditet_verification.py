"""Unit tests for v.odit.et parsers, verification workflow, duplicate detection, and degradation."""

import pytest
from app.db import SessionLocal
from app.models import Subscription, SubscriptionStatus, EntryPayment, EntryPaymentStatus
from app.services.voditet_service import (
    parse_voditet_response,
    check_duplicate_reference,
    VoditetClient,
)
from tests.test_admin import make_admin_headers


# Literal example payloads for all 6 provider shapes + 502 case
PAYLOAD_TELEBIRR = {
    "ok": True,
    "providerKey": "telebirr",
    "httpStatus": 200,
    "receipt": {
        "source": "telebirr-html",
        "receiptNo": "TB123456789",
        "transactionStatus": "Completed",
        "totalPaidAmount": "102 Birr",
        "settledAmount": "100 Birr",
        "paymentDate": "2026-07-24",
        "payerName": "Abebe Bikila",
    },
}

PAYLOAD_CBE_PDF = {
    "ok": True,
    "providerKey": "cbe",
    "httpStatus": 200,
    "receipt": {
        "source": "cbe-pdf",
        "reference": "FT26206ABCDE",
        "totalAmount": 150.0,
        "currency": "ETB",
        "paymentDate": "2026-07-24",
        "payerName": "Kebede Tassew",
    },
}

PAYLOAD_ZEMEN_PDF = {
    "ok": True,
    "providerKey": "zemen",
    "httpStatus": 200,
    "receipt": {
        "source": "zemen-pdf",
        "reference": "ZEM9876543210123",
        "transactionStatus": "COMPLETED",
        "totalAmountPaid": 200.0,
        "currency": "ETB",
        "payerName": "Tigist Alemu",
    },
}

PAYLOAD_BOA_JSON = {
    "ok": True,
    "providerKey": "boa",
    "httpStatus": 200,
    "receipt": {
        "source": "boa-json",
        "transactionReference": "BOA-REF-777",
        "upstreamStatus": "Success",
        "totalAmount": 90.0,
        "currency": "ETB",
        "receiverName": "WhoIsHot Platform",

    },
}

PAYLOAD_AWASH_HTML = {
    "ok": True,
    "providerKey": "awash",
    "httpStatus": 200,
    "receipt": {
        "source": "awash-html",
        "transaction": {
            "transactionId": "AWASH-TX-555",
            "amount": "100 ETB",
        },
        "customer": {
            "customerName": "Haile Gebrselassie",
        },
    },
}

PAYLOAD_MB_JSON = {
    "ok": True,
    "providerKey": "cbe",
    "httpStatus": 200,
    "receipt": {
        "source": "mb-json",
        "reference": "MB-CBE-9999",
        "totalAmount": 110.0,
        "currency": "ETB",
        "payerName": "Derartu Tulu",
    },
}

PAYLOAD_502_CASE = {
    "ok": False,
    "providerKey": "telebirr",
    "httpStatus": 502,
    "error": "Upstream telebirr server connection failed",
    "receipt": {"source": "telebirr-html"},
}


def test_parser_telebirr():
    parsed = parse_voditet_response(PAYLOAD_TELEBIRR)
    assert parsed["verify_status"] == "verified"
    assert parsed["verify_provider_key"] == "telebirr"
    assert parsed["verify_reference"] == "TB123456789"
    assert parsed["verify_amount"] == 10200  # 102 ETB in cents
    assert parsed["verify_currency"] == "ETB"
    assert parsed["verify_payer_name"] == "Abebe Bikila"


def test_parser_cbe_pdf():
    parsed = parse_voditet_response(PAYLOAD_CBE_PDF)
    assert parsed["verify_status"] == "verified"
    assert parsed["verify_provider_key"] == "cbe"
    assert parsed["verify_reference"] == "FT26206ABCDE"
    assert parsed["verify_amount"] == 15000  # 150 ETB in cents
    assert parsed["verify_currency"] == "ETB"
    assert parsed["verify_payer_name"] == "Kebede Tassew"


def test_parser_zemen_pdf():
    parsed = parse_voditet_response(PAYLOAD_ZEMEN_PDF)
    assert parsed["verify_status"] == "verified"
    assert parsed["verify_provider_key"] == "zemen"
    assert parsed["verify_reference"] == "ZEM9876543210123"
    assert parsed["verify_amount"] == 20000  # 200 ETB in cents
    assert parsed["verify_currency"] == "ETB"
    assert parsed["verify_payer_name"] == "Tigist Alemu"


def test_parser_boa_json():
    parsed = parse_voditet_response(PAYLOAD_BOA_JSON)
    assert parsed["verify_status"] == "verified"
    assert parsed["verify_provider_key"] == "boa"
    assert parsed["verify_reference"] == "BOA-REF-777"
    assert parsed["verify_amount"] == 9000  # 90 ETB in cents
    assert parsed["verify_currency"] == "ETB"


def test_parser_awash_html():
    parsed = parse_voditet_response(PAYLOAD_AWASH_HTML)
    assert parsed["verify_status"] == "verified"
    assert parsed["verify_provider_key"] == "awash"
    assert parsed["verify_reference"] == "AWASH-TX-555"
    assert parsed["verify_amount"] == 10000  # 100 ETB in cents
    assert parsed["verify_payer_name"] == "Haile Gebrselassie"


def test_parser_mb_json():
    parsed = parse_voditet_response(PAYLOAD_MB_JSON)
    assert parsed["verify_status"] == "verified"
    assert parsed["verify_reference"] == "MB-CBE-9999"
    assert parsed["verify_amount"] == 11000
    assert parsed["verify_payer_name"] == "Derartu Tulu"


def test_parser_502_case():
    parsed = parse_voditet_response(PAYLOAD_502_CASE)
    assert parsed["verify_status"] == "fetch_failed"
    assert parsed["verify_provider_key"] == "telebirr"


def test_duplicate_same_pair_twice_auto_rejects(client, auth, monkeypatch):
    # Mock VoditetClient.verify_url to return TELEBIRR payload
    monkeypatch.setattr(VoditetClient, "verify_url", lambda self, url, key, *args, **kwargs: PAYLOAD_TELEBIRR)

    user_headers1 = auth(client, "dupuser1@t.dev")
    user_headers2 = auth(client, "dupuser2@t.dev")

    # Submission 1 by User 1
    res1 = client.post(
        "/api/v1/subscriptions/checkout",
        headers=user_headers1,
        json={
            "method": "manual",
            "receipt_url": "https://telebirr.et/receipt/TB123456789",
            "receipt_input_type": "url",
        },
    )
    assert res1.status_code == 201

    data1 = res1.json()
    assert data1["status"] in ("awaiting_review", "paid")

    # Submission 2 with exact same (provider, reference) pair by User 2 -> auto-rejects immediately
    res2 = client.post(
        "/api/v1/subscriptions/checkout",
        headers=user_headers2,
        json={
            "method": "manual",
            "receipt_url": "https://telebirr.et/receipt/TB123456789",
            "receipt_input_type": "url",
        },
    )
    assert res2.status_code == 201

    data2 = res2.json()
    assert data2["status"] == "rejected"
    assert data2["review_note"] == "duplicate_receipt"


def test_amount_mismatch_queued_not_auto_rejected(client, auth, monkeypatch):
    # Mock payload with amount 50 ETB (expected RM/ETB 9.00 / 900 cents)
    mismatch_payload = {
        "ok": True,
        "providerKey": "telebirr",
        "httpStatus": 200,
        "receipt": {
            "source": "telebirr-html",
            "receiptNo": "MISMATCH-REF-001",
            "transactionStatus": "Completed",
            "totalPaidAmount": "5 Birr",
            "payerName": "Mismatch User",
        },
    }
    monkeypatch.setattr(VoditetClient, "verify_url", lambda self, url, key, *args, **kwargs: mismatch_payload)

    user_headers = auth(client, "mismatchuser@t.dev")
    res = client.post(
        "/api/v1/subscriptions/checkout",
        headers=user_headers,
        json={
            "method": "manual",
            "receipt_url": "https://telebirr.et/receipt/MISMATCH-REF-001",
            "receipt_input_type": "url",
        },
    )
    assert res.status_code == 201

    data = res.json()
    # Mismatch is queued for admin, NOT auto-rejected
    assert data["status"] == "awaiting_review"

    db = SessionLocal()
    try:
        sub = db.query(Subscription).filter(Subscription.provider_ref == data["session_id"]).first()
        assert sub.verify_status == "amount_mismatch"
    finally:
        db.close()


def test_502_fetch_failure_degrades_to_manual_review(client, auth, monkeypatch):
    monkeypatch.setattr(VoditetClient, "verify_url", lambda self, url, key, *args, **kwargs: PAYLOAD_502_CASE)

    user_headers = auth(client, "fail502user@t.dev")
    res = client.post(
        "/api/v1/subscriptions/checkout",
        headers=user_headers,
        json={
            "method": "manual",
            "receipt_url": "https://telebirr.et/receipt/FAIL502-REF",
            "receipt_input_type": "url",
        },
    )
    assert res.status_code == 201

    data = res.json()
    # 502/fetch failure degrades to manual review, does NOT crash or auto-reject
    assert data["status"] == "awaiting_review"

    db = SessionLocal()
    try:
        sub = db.query(Subscription).filter(Subscription.provider_ref == data["session_id"]).first()
        assert sub.verify_status == "fetch_failed"
    finally:
        db.close()


def test_my_payments_never_call_voditet(client, auth, monkeypatch):
    called = []
    monkeypatch.setattr(VoditetClient, "verify_url", lambda self, url, key, *args, **kwargs: called.append(url))

    user_headers = auth(client, "myuser@t.dev")
    # MY payment with currency MYR / TnG provider
    res = client.post(
        "/api/v1/subscriptions/checkout",
        headers=user_headers,
        json={
            "method": "manual",
            "receipt_hash": "myreceipt123",
        },
    )
    assert res.status_code == 201
    assert len(called) == 0  # v.odit.et was NEVER called for MY payment


def test_user_can_update_pending_or_retry_after_rejection(client, auth):
    user_headers = auth(client, "retryuser@t.dev")

    # Submission 1
    res1 = client.post(
        "/api/v1/subscriptions/checkout",
        headers=user_headers,
        json={
            "method": "manual",
            "receipt_url": "https://telebirr.et/receipt/TB-FIRST-PAYMENT",
            "receipt_input_type": "url",
        },
    )
    assert res1.status_code == 201
    assert res1.json()["status"] in ("awaiting_review", "paid")

    # Submission 2 with new receipt updates existing pending request cleanly without duplicate block
    res2 = client.post(
        "/api/v1/subscriptions/checkout",
        headers=user_headers,
        json={
            "method": "manual",
            "receipt_url": "https://telebirr.et/receipt/TB-SECOND-PAYMENT",
            "receipt_input_type": "url",
        },
    )
    assert res2.status_code == 201
    assert res2.json()["status"] == "awaiting_review"

    db = SessionLocal()
    try:
        sub = db.query(Subscription).filter(Subscription.provider_ref == res2.json()["session_id"]).first()
        assert sub.receipt_url_submitted == "https://telebirr.et/receipt/TB-SECOND-PAYMENT"
    finally:
        db.close()

