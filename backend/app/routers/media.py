import io
from pathlib import Path
from uuid import uuid4

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, status
from PIL import Image, ImageFilter

from fastapi.responses import FileResponse, Response
from app.config import get_settings
from app.deps import get_current_user
from app.models import User
from app.services.storage_service import MEDIA_DIR, fetch_file_bytes, get_r2_client, upload_file

router = APIRouter(prefix="/media", tags=["media"])

ALLOWED_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}
MAX_BYTES = 5 * 1024 * 1024  # 5 MB

BLUR_THUMB_SIZE = (64, 64)
BLUR_RADIUS = 6


def _blur_thumb_path(contestant_id: int) -> Path:
    return MEDIA_DIR / f"{contestant_id}_blur.jpg"


def _fetch_photo_bytes(photo_url: str) -> bytes | None:
    """Read bytes for a photo_url using storage service (local disk or R2/HTTP)."""
    return fetch_file_bytes(photo_url)


def generate_blurred_thumb(contestant_id: int, photo_url: str | None) -> None:
    """Generate a small blurred JPEG thumbnail for a contestant's photo,
    uploaded via storage client. Best-effort: never raises."""
    if not photo_url:
        return
    data = _fetch_photo_bytes(photo_url)
    if data is None:
        return
    try:
        image = Image.open(io.BytesIO(data)).convert("RGB")
        image.thumbnail(BLUR_THUMB_SIZE)
        image = image.filter(ImageFilter.GaussianBlur(radius=BLUR_RADIUS))
        buf = io.BytesIO()
        image.save(buf, "JPEG", quality=70)
        upload_file(buf.getvalue(), f"{contestant_id}_blur.jpg", "image/jpeg")
    except Exception:
        return


def blurred_thumb_url(request: Request, contestant_id: int) -> str | None:
    if not _blur_thumb_path(contestant_id).is_file():
        return None
    return f"{request.base_url}media/{contestant_id}_blur.jpg"


@router.api_route("/{filename:path}", methods=["GET", "HEAD"])
def get_media_file(filename: str):
    clean_key = filename.lstrip("/")

    # 1. Local disk check
    local_path = MEDIA_DIR / clean_key
    if local_path.is_file():
        ext = local_path.suffix.lower()
        content_type = "image/jpeg"
        if ext == ".png":
            content_type = "image/png"
        elif ext == ".webp":
            content_type = "image/webp"
        return FileResponse(
            local_path,
            media_type=content_type,
            headers={"Cache-Control": "public, max-age=31536000"},
        )

    # 2. Cloudflare R2 check
    client = get_r2_client()
    settings = get_settings()
    if client and settings.R2_BUCKET:
        try:
            resp = client.get_object(Bucket=settings.R2_BUCKET, Key=clean_key)
            content_type = resp.get("ContentType", "image/jpeg")
            body = resp["Body"].read()
            # Save to local disk cache
            try:
                local_path.parent.mkdir(parents=True, exist_ok=True)
                local_path.write_bytes(body)
            except Exception:
                pass
            return Response(
                content=body,
                media_type=content_type,
                headers={"Cache-Control": "public, max-age=31536000"},
            )
        except Exception:
            pass

    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media not found")


@router.post("/photo", status_code=status.HTTP_201_CREATED)
async def upload_photo(
    request: Request,
    file: UploadFile,
    current_user: User = Depends(get_current_user),
) -> dict[str, str]:
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Only JPEG, PNG or WebP images are allowed",
        )
    data = await file.read()
    if len(data) > MAX_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Photo must be 5 MB or smaller",
        )

    filename = uuid4().hex + ALLOWED_TYPES[file.content_type]
    saved_url = upload_file(data, filename, file.content_type)
    return {"url": saved_url}

