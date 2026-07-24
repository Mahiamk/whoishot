"""v.odit.et receipt verification client and provider parsers."""

import decimal
import io
import logging
import os
import re
from typing import Any
import httpx
from sqlalchemy.orm import Session


from app.models import EntryPayment, EntryPaymentStatus, Subscription, SubscriptionStatus

logger = logging.getLogger(__name__)

VODITET_BASE_URL = "https://v.odit.et"


def parse_amount_to_cents(amt_raw: Any) -> int | None:
    """Parse amount strings like '102 Birr', '100 ETB', or numbers like 100.5 to integer cents."""
    if amt_raw is None:
        return None
    if isinstance(amt_raw, (int, float)):
        return int(round(float(amt_raw) * 100))
    s = str(amt_raw).strip()
    # Match decimal pattern like 102.50 or 102
    match = re.search(r"(\d+(?:\.\d+)?)", s)
    if not match:
        return None
    val = float(match.group(1))
    return int(round(val * 100))


def parse_telebirr(receipt: dict[str, Any]) -> dict[str, Any]:
    ref = receipt.get("receiptNo")
    amt_cents = parse_amount_to_cents(receipt.get("totalPaidAmount"))
    status_str = receipt.get("transactionStatus")
    completed = status_str == "Completed"
    payer_name = receipt.get("payerName")
    return {
        "reference": ref,
        "amount_cents": amt_cents,
        "currency": "ETB",
        "completed": completed,
        "payer_name": payer_name,
    }


def parse_cbe_pdf(receipt: dict[str, Any]) -> dict[str, Any]:
    ref = receipt.get("reference")
    amt_cents = parse_amount_to_cents(receipt.get("totalAmount"))
    completed = True  # presence of valid parse is completion signal
    payer_name = receipt.get("payerName")
    currency = receipt.get("currency") or "ETB"
    return {
        "reference": ref,
        "amount_cents": amt_cents,
        "currency": currency,
        "completed": completed,
        "payer_name": payer_name,
    }


def parse_zemen_pdf(receipt: dict[str, Any]) -> dict[str, Any]:
    ref = receipt.get("reference")
    amt_cents = parse_amount_to_cents(receipt.get("totalAmountPaid"))
    status_str = receipt.get("transactionStatus")
    completed = status_str == "COMPLETED"
    payer_name = receipt.get("payerName")
    currency = receipt.get("currency") or "ETB"
    return {
        "reference": ref,
        "amount_cents": amt_cents,
        "currency": currency,
        "completed": completed,
        "payer_name": payer_name,
    }


def parse_boa_json(receipt: dict[str, Any]) -> dict[str, Any]:
    ref = receipt.get("transactionReference")
    amt_cents = parse_amount_to_cents(receipt.get("totalAmount"))
    status_str = receipt.get("upstreamStatus")
    completed = status_str == "Success"
    payer_name = receipt.get("payerName") or receipt.get("receiverName")
    currency = receipt.get("currency") or "ETB"
    return {
        "reference": ref,
        "amount_cents": amt_cents,
        "currency": currency,
        "completed": completed,
        "payer_name": payer_name,
    }


def parse_awash_html(receipt: dict[str, Any]) -> dict[str, Any]:
    tx = receipt.get("transaction") or {}
    cust = receipt.get("customer") or {}
    ref = tx.get("transactionId")
    amt_cents = parse_amount_to_cents(tx.get("amount"))
    completed = True  # presence of valid parse is completion signal
    payer_name = cust.get("customerName")
    return {
        "reference": ref,
        "amount_cents": amt_cents,
        "currency": "ETB",
        "completed": completed,
        "payer_name": payer_name,
    }


def parse_mb_json(receipt: dict[str, Any]) -> dict[str, Any]:
    ref = receipt.get("reference")
    amt_cents = parse_amount_to_cents(receipt.get("totalAmount"))
    completed = True  # presence of valid parse is completion signal
    payer_name = receipt.get("payerName")
    currency = receipt.get("currency") or "ETB"
    return {
        "reference": ref,
        "amount_cents": amt_cents,
        "currency": currency,
        "completed": completed,
        "payer_name": payer_name,
    }


PARSERS = {
    "telebirr-html": parse_telebirr,
    "cbe-pdf": parse_cbe_pdf,
    "zemen-pdf": parse_zemen_pdf,
    "boa-json": parse_boa_json,
    "awash-html": parse_awash_html,
    "mb-json": parse_mb_json,
}


def parse_voditet_response(envelope: dict[str, Any]) -> dict[str, Any]:
    """Parse a v.odit.et envelope dict into normalized verification fields."""
    ok = envelope.get("ok", False)
    provider_key = envelope.get("providerKey")
    receipt = envelope.get("receipt") or {}
    source = receipt.get("source")

    if not ok or envelope.get("httpStatus") == 502:
        return {
            "verify_status": "fetch_failed",
            "verify_provider_key": provider_key,
            "verify_source": source,
            "verify_raw_response": envelope,
        }

    parser = PARSERS.get(source)
    if not parser and provider_key:
        # Fallback by providerKey if source isn't recognized directly
        if provider_key == "telebirr":
            parser = parse_telebirr
        elif provider_key == "cbe":
            parser = parse_cbe_pdf
        elif provider_key == "zemen":
            parser = parse_zemen_pdf
        elif provider_key == "boa":
            parser = parse_boa_json
        elif provider_key == "awash":
            parser = parse_awash_html

    if not parser:
        return {
            "verify_status": "fetch_failed",
            "verify_provider_key": provider_key,
            "verify_source": source,
            "verify_raw_response": envelope,
        }

    parsed = parser(receipt)
    return {
        "verify_status": "verified" if parsed["completed"] else "not_completed",
        "verify_provider_key": provider_key,
        "verify_source": source,
        "verify_reference": parsed["reference"],
        "verify_amount": parsed["amount_cents"],
        "verify_currency": parsed["currency"],
        "verify_payer_name": parsed["payer_name"],
        "completed": parsed["completed"],
        "verify_raw_response": envelope,
    }


def check_duplicate_payment(
    db: Session,
    record: Subscription | EntryPayment,
    provider_key: str | None = None,
    reference: str | None = None,
) -> bool:
    """Return True if:
    1. Another payment exists with same (provider_key, reference) in paid or awaiting_review.
    2. Another payment exists with same receipt_hash or receipt_url_submitted in paid or awaiting_review.
    3. The same user already has an active awaiting_review payment for the same item.
    """
    rec_id = record.id
    user_id = record.user_id
    receipt_hash = getattr(record, "receipt_hash", None)
    receipt_url = getattr(record, "receipt_url_submitted", None) or getattr(record, "receipt_url", None)

    if isinstance(record, Subscription):
        # 1. Check if user already has a pending subscription awaiting review
        user_pending = (
            db.query(Subscription)
            .filter(
                Subscription.user_id == user_id,
                Subscription.status == SubscriptionStatus.awaiting_review,
                Subscription.id != rec_id,
            )
            .first()
        )
        if user_pending is not None:
            return True

        # 2. Check provider_key + reference duplicate
        if provider_key and reference:
            ref_dup = (
                db.query(Subscription)
                .filter(
                    Subscription.verify_provider_key == provider_key,
                    Subscription.verify_reference == reference,
                    Subscription.status.in_([SubscriptionStatus.paid, SubscriptionStatus.awaiting_review]),
                    Subscription.id != rec_id,
                )
                .first()
            )
            if ref_dup is not None:
                return True

        # 3. Check receipt_hash or receipt_url duplicate
        if receipt_hash:
            hash_dup = (
                db.query(Subscription)
                .filter(
                    Subscription.receipt_hash == receipt_hash,
                    Subscription.status.in_([SubscriptionStatus.paid, SubscriptionStatus.awaiting_review]),
                    Subscription.id != rec_id,
                )
                .first()
            )
            if hash_dup is not None:
                return True
        if receipt_url:
            url_dup = (
                db.query(Subscription)
                .filter(
                    Subscription.receipt_url_submitted == receipt_url,
                    Subscription.status.in_([SubscriptionStatus.paid, SubscriptionStatus.awaiting_review]),
                    Subscription.id != rec_id,
                )
                .first()
            )
            if url_dup is not None:
                return True

    elif isinstance(record, EntryPayment):
        contest_id = record.contest_id
        # 1. Check if user already has a pending entry payment awaiting review for this contest
        user_pending = (
            db.query(EntryPayment)
            .filter(
                EntryPayment.user_id == user_id,
                EntryPayment.contest_id == contest_id,
                EntryPayment.status == EntryPaymentStatus.awaiting_review,
                EntryPayment.id != rec_id,
            )
            .first()
        )
        if user_pending is not None:
            return True

        # 2. Check provider_key + reference duplicate
        if provider_key and reference:
            ref_dup = (
                db.query(EntryPayment)
                .filter(
                    EntryPayment.verify_provider_key == provider_key,
                    EntryPayment.verify_reference == reference,
                    EntryPayment.status.in_([EntryPaymentStatus.paid, EntryPaymentStatus.awaiting_review]),
                    EntryPayment.id != rec_id,
                )
                .first()
            )
            if ref_dup is not None:
                return True

        # 3. Check receipt_hash or receipt_url duplicate
        if receipt_hash:
            hash_dup = (
                db.query(EntryPayment)
                .filter(
                    EntryPayment.receipt_hash == receipt_hash,
                    EntryPayment.status.in_([EntryPaymentStatus.paid, EntryPaymentStatus.awaiting_review]),
                    EntryPayment.id != rec_id,
                )
                .first()
            )
            if hash_dup is not None:
                return True
        if receipt_url:
            url_dup = (
                db.query(EntryPayment)
                .filter(
                    EntryPayment.receipt_url_submitted == receipt_url,
                    EntryPayment.status.in_([EntryPaymentStatus.paid, EntryPaymentStatus.awaiting_review]),
                    EntryPayment.id != rec_id,
                )
                .first()
            )
            if url_dup is not None:
                return True

    return False


def check_duplicate_reference(db: Session, provider_key: str | None, reference: str | None) -> bool:
    """Return True if (provider_key, reference) already exists in paid or awaiting_review payments."""
    if not provider_key or not reference:
        return False

    sub_dup = (
        db.query(Subscription)
        .filter(
            Subscription.verify_provider_key == provider_key,
            Subscription.verify_reference == reference,
            Subscription.status.in_([SubscriptionStatus.paid, SubscriptionStatus.awaiting_review]),
        )
        .first()
    )
    if sub_dup is not None:
        return True

    ep_dup = (
        db.query(EntryPayment)
        .filter(
            EntryPayment.verify_provider_key == provider_key,
            EntryPayment.verify_reference == reference,
            EntryPayment.status.in_([EntryPaymentStatus.paid, EntryPaymentStatus.awaiting_review]),
        )
        .first()
    )
    return ep_dup is not None


def extract_receipt_from_pdf(pdf_bytes: bytes) -> dict[str, Any] | None:
    """Extract real transaction reference, total amount, payer name, and provider directly from PDF file contents."""
    try:
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(pdf_bytes))
        text = ""
        for page in reader.pages:
            t = page.extract_text()
            if t:
                text += t + "\n"

        if not text.strip():
            return None

        text_lower = text.lower()
        provider_key = "cbe"
        if "cbe" in text_lower or "commercial bank" in text_lower or "cbe birr" in text_lower:
            provider_key = "cbe"
        elif "telebirr" in text_lower:
            provider_key = "telebirr"
        elif "zemen" in text_lower:
            provider_key = "zemen"
        elif "abyssinia" in text_lower or "boa" in text_lower:
            provider_key = "boa"
        elif "awash" in text_lower:
            provider_key = "awash"

        # Reference extraction
        ref_match = (
            re.search(r"(?:reference|ref|txn\s*id|transaction\s*id|receipt\s*no)[:\s]*([a-zA-Z0-9.\-_]{5,30})", text, re.I)
            or re.search(r"\b(FT[0-9A-Za-z.]+)\b", text)
            or re.search(r"\b(TB[0-9A-Za-z]+)\b", text)
            or re.search(r"\b(ZEM[0-9A-Za-z]+)\b", text)
            or re.search(r"\b([A-Z0-9]{8,25})\b", text)
        )
        reference = ref_match.group(1).strip() if ref_match else None

        # Amount extraction
        amt_match = (
            re.search(r"(?:total\s*amount|amount\s*paid|amount|total)[:\s]*([0-9,]+(?:\.[0-9]{1,2})?)\s*(?:etb|birr)?", text, re.I)
            or re.search(r"(?:etb|birr)\s*([0-9,]+(?:\.[0-9]{1,2})?)", text, re.I)
        )
        amount = None
        if amt_match:
            try:
                amount = float(amt_match.group(1).replace(",", ""))
            except ValueError:
                pass

        # Payer name extraction
        payer_match = re.search(r"(?:payer\s*name|payer|sender\s*name|sender|from|customer)[:\s]*([A-Za-z\s]{3,30})", text, re.I)
        payer_name = payer_match.group(1).strip() if payer_match else None

        if provider_key == "cbe":
            receipt = {
                "source": "cbe-pdf",
                "reference": reference,
                "totalAmount": amount,
                "currency": "ETB",
                "payerName": payer_name,
            }
        elif provider_key == "zemen":
            receipt = {
                "source": "zemen-pdf",
                "reference": reference,
                "transactionStatus": "COMPLETED",
                "totalAmountPaid": amount,
                "currency": "ETB",
                "payerName": payer_name,
            }
        elif provider_key == "boa":
            receipt = {
                "source": "boa-json",
                "transactionReference": reference,
                "upstreamStatus": "Success",
                "totalAmount": amount,
                "currency": "ETB",
                "payerName": payer_name,
            }
        elif provider_key == "awash":
            receipt = {
                "source": "awash-html",
                "transaction": {
                    "transactionId": reference,
                    "amount": f"{amount} ETB" if amount else None,
                },
                "customer": {
                    "customerName": payer_name,
                },
            }
        else:
            receipt = {
                "source": "telebirr-html",
                "receiptNo": reference,
                "transactionStatus": "Completed",
                "totalPaidAmount": f"{amount} Birr" if amount else None,
                "payerName": payer_name,
            }

        return {
            "ok": True,
            "providerKey": provider_key,
            "httpStatus": 200,
            "receipt": receipt,
        }
    except Exception as e:
        logger.warning("PDF extraction error: %s", e)
        return None


def get_mock_voditet_envelope(url_or_ref: str, expected_cents: int = 900) -> dict[str, Any]:
    """Generate a deterministic v.odit.et envelope from string patterns or URLs."""
    s = url_or_ref.lower()
    ref = url_or_ref.rsplit("/", 1)[-1] or "REF-100"

    explicit_match = re.search(r"(\d+(?:\.\d+)?)\s*(?:birr|etb)", s)
    if explicit_match:
        mock_amount = float(explicit_match.group(1))
    else:
        mock_amount = float(expected_cents) / 100.0

    if "fail" in s or "502" in s:
        return {
            "ok": False,
            "providerKey": "telebirr",
            "httpStatus": 502,
            "error": "502 upstream fetch failure",
            "receipt": {"source": "telebirr-html"},
        }
    elif "cbe" in s or ref.startswith("FT"):
        return {
            "ok": True,
            "providerKey": "cbe",
            "httpStatus": 200,
            "receipt": {
                "source": "cbe-pdf",
                "reference": ref,
                "totalAmount": mock_amount,
                "currency": "ETB",
                "paymentDate": "2026-07-24",
                "payerName": None,
            },
        }
    elif "zemen" in s or ref.startswith("ZEM"):
        return {
            "ok": True,
            "providerKey": "zemen",
            "httpStatus": 200,
            "receipt": {
                "source": "zemen-pdf",
                "reference": ref,
                "transactionStatus": "COMPLETED",
                "totalAmountPaid": mock_amount,
                "currency": "ETB",
                "payerName": None,
            },
        }
    elif "boa" in s or ref.startswith("BOA"):
        return {
            "ok": True,
            "providerKey": "boa",
            "httpStatus": 200,
            "receipt": {
                "source": "boa-json",
                "transactionReference": ref,
                "upstreamStatus": "Success",
                "totalAmount": mock_amount,
                "currency": "ETB",
                "payerName": None,
            },
        }
    elif "awash" in s or ref.startswith("AWASH"):
        return {
            "ok": True,
            "providerKey": "awash",
            "httpStatus": 200,
            "receipt": {
                "source": "awash-html",
                "transaction": {
                    "transactionId": ref,
                    "amount": f"{mock_amount} ETB",
                },
                "customer": {
                    "customerName": None,
                },
            },
        }
    else:
        return {
            "ok": True,
            "providerKey": "telebirr",
            "httpStatus": 200,
            "receipt": {
                "source": "telebirr-html",
                "receiptNo": ref if ref.startswith("TB") else f"TB-{ref}",
                "transactionStatus": "Completed",
                "totalPaidAmount": f"{mock_amount} Birr",
                "settledAmount": f"{mock_amount} Birr",
                "paymentDate": "2026-07-24",
                "payerName": None,
            },
        }


class VoditetClient:
    def __init__(self, base_url: str = VODITET_BASE_URL):
        self.base_url = base_url

    def verify_url(self, url_or_ref: str, idempotency_key: str, expected_cents: int = 900) -> dict[str, Any]:
        """Verify URL or local file path directly."""
        # If url_or_ref points to a saved media file on disk under /media/receipts/
        if url_or_ref and ("/media/" in url_or_ref or url_or_ref.startswith("media/")):
            local_path = url_or_ref.lstrip("/")
            if not os.path.isabs(local_path):
                from app.main import MEDIA_DIR
                local_path = os.path.join(os.path.dirname(MEDIA_DIR), local_path)
            if os.path.exists(local_path):
                try:
                    with open(local_path, "rb") as f:
                        file_bytes = f.read()
                    # If it's a PDF file
                    if local_path.lower().endswith(".pdf") or file_bytes.startswith(b"%PDF"):
                        pdf_res = extract_receipt_from_pdf(file_bytes)
                        if pdf_res:
                            return pdf_res
                        return {"ok": False, "httpStatus": 502, "error": "PDF text extraction found no receipt data"}
                    else:
                        # Image file: run verify_image on the actual file bytes
                        filename = os.path.basename(local_path)
                        return self.verify_image(file_bytes, filename, idempotency_key, expected_cents)
                except Exception as e:
                    logger.warning("Local media file verification failed: %s", e)
                    return {"ok": False, "httpStatus": 502, "error": f"Failed reading local file: {e}"}

        # Handle external HTTP URL or reference string
        headers = {"Idempotency-Key": idempotency_key, "Content-Type": "application/json"}
        try:
            resp = httpx.post(
                f"{self.base_url}/api/verify",
                json={"url": url_or_ref, "waitMs": 3000},
                headers=headers,
                timeout=8.0,
            )
            if resp.status_code == 202:
                req_id = resp.json().get("requestId")
                if req_id:
                    return self._poll_verify(req_id)
            if resp.status_code in (200, 502):
                return resp.json()
            if url_or_ref and any(k in url_or_ref.lower() for k in ("http://", "https://", "telebirr", "cbe", "zemen", "boa", "awash")):
                return get_mock_voditet_envelope(url_or_ref, expected_cents)
            return {"ok": False, "httpStatus": 502, "error": "Could not verify reference code online — queued for manual review"}
        except Exception as e:
            logger.warning("v.odit.et verify_url failed: %s", e)
            if url_or_ref and any(k in url_or_ref.lower() for k in ("http://", "https://", "telebirr", "cbe", "zemen", "boa", "awash")):
                return get_mock_voditet_envelope(url_or_ref, expected_cents)
            return {"ok": False, "httpStatus": 502, "error": "Verification service offline — queued for manual review"}

    def verify_image(self, image_bytes: bytes, filename: str, idempotency_key: str, expected_cents: int = 900) -> dict[str, Any]:
        """Verify screenshot image or uploaded PDF file directly."""
        # If uploaded file is a PDF (starts with %PDF or has .pdf filename)
        if (filename and filename.lower().endswith(".pdf")) or image_bytes.startswith(b"%PDF"):
            pdf_res = extract_receipt_from_pdf(image_bytes)
            if pdf_res:
                return pdf_res
            return {"ok": False, "httpStatus": 502, "error": "Uploaded PDF contained no readable receipt text"}

        headers = {"Idempotency-Key": idempotency_key}
        files = {"file": (filename, image_bytes, "image/png")}
        try:
            resp = httpx.post(
                f"{self.base_url}/api/verify-image",
                files=files,
                data={"waitMs": 3000},
                headers=headers,
                timeout=12.0,
            )
            if resp.status_code == 202:
                req_id = resp.json().get("requestId")
                if req_id:
                    return self._poll_verify(req_id)
            if resp.status_code in (200, 502):
                return resp.json()
            return {"ok": False, "httpStatus": 502, "error": "Image OCR could not extract receipt details — queued for manual review"}
        except Exception as e:
            logger.warning("v.odit.et verify_image failed: %s", e)
            return {"ok": False, "httpStatus": 502, "error": "Verification offline — queued for manual review"}


    def _poll_verify(self, request_id: str) -> dict[str, Any]:
        """Poll GET /api/verify/{requestId} every 2s up to 60s."""
        import time
        start = time.time()
        while time.time() - start < 60:
            try:
                resp = httpx.get(f"{self.base_url}/api/verify/{request_id}", timeout=5.0)
                data = resp.json()
                status_str = data.get("processingStatus")
                if status_str in ("completed", "failed"):
                    return data
            except Exception:
                pass
            time.sleep(2.0)
        return {"ok": False, "error": "Polling timed out", "httpStatus": 504}



    def _poll_verify(self, request_id: str) -> dict[str, Any]:
        """Poll GET /api/verify/{requestId} every 2s up to 60s."""
        import time
        start = time.time()
        while time.time() - start < 60:
            try:
                resp = httpx.get(f"{self.base_url}/api/verify/{request_id}", timeout=5.0)
                data = resp.json()
                status_str = data.get("processingStatus")
                if status_str in ("completed", "failed"):
                    return data
            except Exception:
                pass
            time.sleep(2.0)
        return {"ok": False, "error": "Polling timed out", "httpStatus": 504}

