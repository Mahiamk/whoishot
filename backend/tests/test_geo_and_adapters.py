"""Tests for Payment Adapters and Geo Detection router."""

import hashlib
import hmac
import json
import pytest

from app.adapters.payment import (
    BirrAdapter,
    CurlecAdapter,
    MockAdapter,
    TngAdapter,
    get_adapter_for_provider,
    resolve_provider_for_country,
)
from app.config import get_settings


def test_resolve_provider_for_country():
    adapter, provider, currency = resolve_provider_for_country("MY")
    assert isinstance(adapter, CurlecAdapter)
    assert provider == "tng"
    assert currency == "MYR"

    adapter_et, provider_et, currency_et = resolve_provider_for_country("ET")
    assert isinstance(adapter_et, BirrAdapter)
    assert provider_et == "birr"
    assert currency_et == "ETB"

    adapter_def, provider_def, _ = resolve_provider_for_country("US")
    assert isinstance(adapter_def, MockAdapter)
    assert provider_def == "mock"


def test_mock_adapter_checkout_and_webhook():
    adapter = MockAdapter()
    assert adapter.is_configured() is True
    checkout = adapter.create_checkout(1000, "MYR", {"user_id": 1})
    assert "subscribe/success" in checkout["checkout_url"]
    assert checkout["provider_ref"] is not None

    body = json.dumps({"provider_ref": checkout["provider_ref"]}).encode()
    webhook = adapter.verify_webhook({}, body)
    assert webhook["provider_ref"] == checkout["provider_ref"]
    assert webhook["status"] == "paid"


def test_curlec_adapter_checkout_and_webhook(monkeypatch):
    adapter = CurlecAdapter()
    
    # Test dev/sandbox fallback checkout
    checkout = adapter.create_checkout(900, "MYR", {"type": "subscription"})
    assert "subscribe/success" in checkout["checkout_url"]
    assert checkout["provider_ref"].startswith("ord_")

    # Test webhook signature validation
    secret = "test-curlec-secret"
    monkeypatch.setattr(get_settings(), "CURLEC_WEBHOOK_SECRET", secret)

    payload_data = {"payload": {"payment": {"entity": {"order_id": "ord_123456"}}}}
    body = json.dumps(payload_data).encode("utf-8")
    sig = hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()

    headers = {"X-Razorpay-Signature": sig}
    result = adapter.verify_webhook(headers, body)
    assert result["provider_ref"] == "ord_123456"
    assert result["status"] == "paid"

    # Test invalid signature
    with pytest.raises(ValueError, match="Invalid Curlec webhook signature"):
        adapter.verify_webhook({"X-Razorpay-Signature": "invalid"}, body)


def test_birr_adapter_checkout_and_webhook(monkeypatch):
    adapter = BirrAdapter()

    # Test dev/sandbox fallback checkout
    checkout = adapter.create_checkout(1500, "ETB", {"type": "entry_fee"})
    assert "subscribe/success" in checkout["checkout_url"]
    assert checkout["provider_ref"].startswith("tx-")

    # Test webhook signature validation
    secret = "test-chapa-secret"
    monkeypatch.setattr(get_settings(), "CHAPA_WEBHOOK_SECRET", secret)

    payload_data = {"tx_ref": "tx_987654", "status": "success"}
    body = json.dumps(payload_data).encode("utf-8")
    sig = hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()

    headers = {"X-Chapa-Signature": sig}
    result = adapter.verify_webhook(headers, body)
    assert result["provider_ref"] == "tx_987654"
    assert result["status"] == "paid"

    # Test invalid signature
    with pytest.raises(ValueError, match="Invalid Chapa/Birr webhook signature"):
        adapter.verify_webhook({"X-Chapa-Signature": "invalid"}, body)


def test_get_adapter_factory():
    assert isinstance(get_adapter_for_provider("tng"), CurlecAdapter)
    assert isinstance(get_adapter_for_provider("curlec"), CurlecAdapter)
    assert isinstance(get_adapter_for_provider("birr"), BirrAdapter)
    assert isinstance(get_adapter_for_provider("chapa"), BirrAdapter)
    assert isinstance(get_adapter_for_provider("mock"), MockAdapter)


def test_geo_detect_endpoint(client):
    res = client.get("/api/v1/geo/detect")
    assert res.status_code == 200
    data = res.json()
    assert "country_code" in data
    assert "suggested_provider" in data
    assert "suggested_currency" in data
    assert data["country_code"] == "MY"
    assert data["suggested_provider"] == "tng"


from tests.test_admin import make_admin_headers


def test_admin_payment_providers_endpoint(client, auth):
    headers = make_admin_headers(client, auth)
    res = client.get("/api/v1/admin/payment-providers", headers=headers)
    assert res.status_code == 200
    providers = res.json()
    assert len(providers) >= 3
    p_ids = [p["provider_id"] for p in providers]
    assert "tng" in p_ids
    assert "birr" in p_ids
    assert "mock" in p_ids
