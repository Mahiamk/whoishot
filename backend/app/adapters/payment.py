"""Payment Provider Adapters Architecture.

Enforces Python Protocol interface:
- create_checkout(amount_cents, currency, metadata) -> CheckoutResult
- verify_webhook(headers, body) -> WebhookResult

Implementations:
- MockAdapter (dev/testing when MOCK_PAYMENT=True)
- CurlecAdapter / TngAdapter (Curlec / Razorpay gateway - MYR)
- BirrAdapter (Chapa / BirrJS - ETB)
"""

import hashlib
import hmac
import json
import logging
from typing import Any, Protocol, TypedDict
import uuid

import razorpay
import requests

from app.config import get_settings

logger = logging.getLogger(__name__)


class CheckoutResult(TypedDict):
    checkout_url: str
    provider_ref: str


class WebhookResult(TypedDict):
    provider_ref: str
    status: str


class PaymentProviderAdapter(Protocol):
    """Protocol defining the interface for payment provider adapters."""

    def create_checkout(
        self, amount_cents: int, currency: str, metadata: dict[str, Any]
    ) -> CheckoutResult:
        ...

    def verify_webhook(
        self, headers: dict[str, str], body: bytes
    ) -> WebhookResult:
        ...

    def is_configured(self) -> bool:
        ...


class MockAdapter:
    """Mock payment provider for development and testing."""

    def is_configured(self) -> bool:
        return get_settings().MOCK_PAYMENT

    def create_checkout(
        self, amount_cents: int, currency: str, metadata: dict[str, Any]
    ) -> CheckoutResult:
        settings = get_settings()
        provider_ref = str(uuid.uuid4())
        frontend_url = settings.FRONTEND_URL.rstrip("/")
        checkout_url = f"{frontend_url}/subscribe/success?ref={provider_ref}&provider=mock"
        return {"checkout_url": checkout_url, "provider_ref": provider_ref}

    def verify_webhook(
        self, headers: dict[str, str], body: bytes
    ) -> WebhookResult:
        try:
            payload = json.loads(body)
            provider_ref = payload["provider_ref"]
        except Exception as err:
            raise ValueError(f"Invalid mock webhook payload: {err}")
        return {"provider_ref": provider_ref, "status": "paid"}


class CurlecAdapter:
    """Curlec (Razorpay-based gateway) provider for MYR.
    
    Reads CURLEC_KEY_ID, CURLEC_KEY_SECRET, CURLEC_WEBHOOK_SECRET.
    Falls back to TNG_API_KEY/TNG_MERCHANT_ID if legacy credentials are set.
    """

    def is_configured(self) -> bool:
        settings = get_settings()
        has_curlec = bool(settings.CURLEC_KEY_ID and settings.CURLEC_KEY_SECRET and settings.CURLEC_WEBHOOK_SECRET)
        has_legacy = bool(settings.TNG_API_KEY and settings.TNG_MERCHANT_ID)
        return has_curlec or has_legacy

    def create_checkout(
        self, amount_cents: int, currency: str, metadata: dict[str, Any]
    ) -> CheckoutResult:
        settings = get_settings()
        provider_ref = f"ord_{uuid.uuid4().hex[:12]}"

        # Standard Curlec (Razorpay SDK) integration
        key_id = settings.CURLEC_KEY_ID
        key_secret = settings.CURLEC_KEY_SECRET

        if key_id and key_secret:
            try:
                client = razorpay.Client(auth=(key_id, key_secret))
                order_data = {
                    "amount": amount_cents,
                    "currency": currency or "MYR",
                    "receipt": provider_ref,
                    "notes": metadata or {},
                }
                order = client.order.create(data=order_data)
                order_id = order.get("id") or provider_ref
                checkout_url = order.get("short_url") or f"{settings.FRONTEND_URL.rstrip('/')}/subscribe/success?ref={order_id}&provider=curlec"
                return {"checkout_url": checkout_url, "provider_ref": order_id}
            except Exception as err:
                logger.warning(f"Curlec checkout creation failed: {err}")

        # Legacy TNG API fallback if configured
        if settings.TNG_API_KEY and settings.TNG_MERCHANT_ID:
            try:
                res = requests.post(
                    f"{settings.TNG_API_URL.rstrip('/')}/v1/payment/checkout",
                    headers={
                        "Authorization": f"Bearer {settings.TNG_API_KEY}",
                        "X-Merchant-ID": settings.TNG_MERCHANT_ID,
                        "Content-Type": "application/json",
                    },
                    json={
                        "merchant_ref": provider_ref,
                        "amount": amount_cents / 100.0,
                        "currency": currency or "MYR",
                        "redirect_url": f"{settings.FRONTEND_URL.rstrip('/')}/subscribe/success?ref={provider_ref}&provider=tng",
                        "metadata": metadata,
                    },
                    timeout=10,
                )
                if res.status_code == 200 and "checkout_url" in res.json():
                    return {
                        "checkout_url": res.json()["checkout_url"],
                        "provider_ref": provider_ref,
                    }
            except Exception as err:
                logger.warning(f"Legacy TNG checkout creation failed: {err}")

        # Fallback for dev / sandbox
        frontend_url = settings.FRONTEND_URL.rstrip("/")
        return {
            "checkout_url": f"{frontend_url}/subscribe/success?ref={provider_ref}&provider=curlec",
            "provider_ref": provider_ref,
        }

    def verify_webhook(
        self, headers: dict[str, str], body: bytes
    ) -> WebhookResult:
        settings = get_settings()
        headers_lower = {k.lower(): v for k, v in headers.items()}
        sig = headers_lower.get("x-razorpay-signature") or headers_lower.get("x-curlec-signature") or headers_lower.get("x-tng-signature")

        webhook_secret = settings.CURLEC_WEBHOOK_SECRET or settings.SUBSCRIPTION_WEBHOOK_SECRET

        if sig and webhook_secret:
            expected = hmac.new(
                webhook_secret.encode("utf-8"), body, hashlib.sha256
            ).hexdigest()
            if not hmac.compare_digest(sig, expected):
                # Try razorpay SDK utility if available
                key_id = settings.CURLEC_KEY_ID or ""
                key_secret = settings.CURLEC_KEY_SECRET or ""
                verified = False
                if key_id and key_secret:
                    try:
                        client = razorpay.Client(auth=(key_id, key_secret))
                        client.utility.verify_webhook_signature(body.decode("utf-8"), sig, webhook_secret)
                        verified = True
                    except Exception:
                        verified = False
                if not verified:
                    raise ValueError("Invalid Curlec webhook signature")

        try:
            payload = json.loads(body)
            # Razorpay webhook payloads structure: payload -> payment / order -> entity -> order_id / id
            provider_ref = (
                payload.get("payload", {}).get("payment", {}).get("entity", {}).get("order_id")
                or payload.get("payload", {}).get("order", {}).get("entity", {}).get("id")
                or payload.get("order_id")
                or payload.get("provider_ref")
                or payload.get("merchant_ref")
            )
            if not provider_ref:
                raise ValueError("Missing provider_ref/order_id in Curlec webhook body")
        except Exception as err:
            raise ValueError(f"Invalid Curlec webhook payload: {err}")

        return {"provider_ref": provider_ref, "status": "paid"}


# Alias TngAdapter to CurlecAdapter for backward compatibility
TngAdapter = CurlecAdapter


class BirrAdapter:
    """Chapa / BirrJS provider (ETB - Ethiopia).
    
    Reads CHAPA_SECRET_KEY, CHAPA_PUBLIC_KEY, CHAPA_WEBHOOK_SECRET.
    Direct REST API fallback for one-off charges.
    """

    def is_configured(self) -> bool:
        settings = get_settings()
        return bool(settings.CHAPA_SECRET_KEY and settings.CHAPA_PUBLIC_KEY and settings.CHAPA_WEBHOOK_SECRET)

    def create_checkout(
        self, amount_cents: int, currency: str, metadata: dict[str, Any]
    ) -> CheckoutResult:
        settings = get_settings()
        provider_ref = f"tx-{uuid.uuid4().hex[:12]}"

        secret_key = settings.CHAPA_SECRET_KEY
        if secret_key:
            try:
                res = requests.post(
                    f"{settings.CHAPA_API_URL.rstrip('/')}/transaction/initialize",
                    headers={
                        "Authorization": f"Bearer {secret_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "amount": str(amount_cents / 100.0),
                        "currency": "ETB",
                        "tx_ref": provider_ref,
                        "callback_url": f"{settings.FRONTEND_URL.rstrip('/')}/api/v1/webhooks/birr",
                        "return_url": f"{settings.FRONTEND_URL.rstrip('/')}/subscribe/success?ref={provider_ref}&provider=birr",
                        "customization": {
                            "title": "WhoIsHot",
                            "description": metadata.get("description", "WhoIsHot Payment"),
                        },

                    },
                    timeout=10,
                )
                data = res.json()
                if data.get("status") == "success" and "checkout_url" in data.get("data", {}):
                    return {
                        "checkout_url": data["data"]["checkout_url"],
                        "provider_ref": provider_ref,
                    }
            except Exception as err:
                logger.warning(f"Chapa checkout creation failed: {err}")

        # Fallback for dev / sandbox
        frontend_url = settings.FRONTEND_URL.rstrip("/")
        return {
            "checkout_url": f"{frontend_url}/subscribe/success?ref={provider_ref}&provider=birr",
            "provider_ref": provider_ref,
        }

    def verify_webhook(
        self, headers: dict[str, str], body: bytes
    ) -> WebhookResult:
        settings = get_settings()
        headers_lower = {k.lower(): v for k, v in headers.items()}
        sig = headers_lower.get("x-chapa-signature")

        secret = settings.CHAPA_WEBHOOK_SECRET or settings.CHAPA_SECRET_KEY
        if sig and secret:
            expected = hmac.new(
                secret.encode("utf-8"), body, hashlib.sha256
            ).hexdigest()
            if not hmac.compare_digest(sig, expected):
                raise ValueError("Invalid Chapa/Birr webhook signature")

        try:
            payload = json.loads(body)
            provider_ref = payload.get("tx_ref") or payload.get("provider_ref") or payload.get("trx_ref")
            if not provider_ref:
                raise ValueError("Missing provider_ref in Birr webhook body")
        except Exception as err:
            raise ValueError(f"Invalid Birr webhook payload: {err}")

        return {"provider_ref": provider_ref, "status": "paid"}


def get_adapter_for_provider(provider_name: str) -> PaymentProviderAdapter:
    """Return adapter instance for a named provider."""
    name = (provider_name or "").lower()
    if name in ("tng", "curlec"):
        return CurlecAdapter()
    if name in ("birr", "chapa"):
        return BirrAdapter()
    return MockAdapter()


def resolve_provider_for_country(
    country_code: str | None,
) -> tuple[PaymentProviderAdapter, str, str]:
    """Resolve provider adapter, provider_name, and currency for a country code.

    Rules:
    - MY (Malaysia) -> CurlecAdapter(), 'tng', 'MYR'
    - ET (Ethiopia) -> BirrAdapter(), 'birr', 'ETB'
    - fallback -> MockAdapter(), 'mock', 'MYR' (or default dev behavior)
    """
    settings = get_settings()
    code = (country_code or "").upper().strip()

    if code == "MY":
        return CurlecAdapter(), "tng", "MYR"
    if code == "ET":
        return BirrAdapter(), "birr", "ETB"

    # Default fallback to mock in dev or when MOCK_PAYMENT is enabled
    return MockAdapter(), "mock", settings.SUBSCRIPTION_CURRENCY

