"""Payments router for receipt upload and manual payment info."""

import hashlib
from pathlib import Path
import uuid

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status

from app.config import get_settings
from app.deps import get_current_user
from app.models import User
from app.schemas import ManualPaymentInfoRead
from app.services.storage_service import MEDIA_DIR, upload_file



router = APIRouter(prefix="/payments", tags=["payments"])

RECEIPTS_DIR = MEDIA_DIR / "receipts"
ALLOWED_RECEIPT_TYPES = {"image/jpeg", "image/png", "image/webp", "application/pdf"}
MAX_RECEIPT_BYTES = 5 * 1024 * 1024  # 5 MB


@router.get("/manual-info", response_model=dict)
def get_manual_payment_info() -> dict:
    """Return manual bank/TnG payment info and provider configuration status."""
    settings = get_settings()
    curlec_configured = bool(
        (settings.CURLEC_KEY_ID and settings.CURLEC_KEY_SECRET and settings.CURLEC_WEBHOOK_SECRET)
        or (settings.TNG_API_KEY and settings.TNG_MERCHANT_ID)
    )
    birr_configured = bool(
        settings.CHAPA_SECRET_KEY and settings.CHAPA_PUBLIC_KEY and settings.CHAPA_WEBHOOK_SECRET
    )

    return {
        "manual_info": settings.manual_payment_info_dict,
        "providers": {
            "tng": {"name": "Touch 'n Go / Curlec", "configured": curlec_configured or settings.MOCK_PAYMENT},
            "birr": {"name": "Chapa / BirrJS", "configured": birr_configured or settings.MOCK_PAYMENT},
            "mock": {"name": "Mock Provider", "configured": settings.MOCK_PAYMENT},
        },
    }


@router.post("/upload-receipt", status_code=status.HTTP_201_CREATED)
async def upload_receipt(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
) -> dict[str, str]:
    """Upload a receipt image or PDF (max 5MB), compute SHA-256 hash, and store under /backend/media/receipts."""
    if file.content_type not in ALLOWED_RECEIPT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Receipt file must be a JPEG, PNG, WebP image or PDF document",
        )

    content = await file.read()
    if len(content) > MAX_RECEIPT_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Receipt file must be 5 MB or smaller",
        )

    # Compute SHA256 hash
    receipt_hash = hashlib.sha256(content).hexdigest()

    ext = Path(file.filename or "receipt.png").suffix or ".png"
    if ext.lower() not in {".jpg", ".jpeg", ".png", ".webp", ".pdf"}:
        ext = ".png"

    filename = f"{uuid.uuid4().hex[:16]}{ext}"
    url = upload_file(content, f"receipts/{filename}", file.content_type or "application/octet-stream")

    return {"url": url, "hash": receipt_hash, "file_path": url}



@router.post("/upload-receipt-image", status_code=status.HTTP_201_CREATED)
async def upload_receipt_image(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
) -> dict[str, str]:
    """Upload a screenshot image for v.odit.et verify-image workflow."""
    if file.content_type not in {"image/jpeg", "image/png", "image/webp"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Screenshot must be a JPEG, PNG, or WebP image",
        )
    return await upload_receipt(file=file, current_user=current_user)

