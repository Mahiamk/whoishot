"""Unified Storage Client Wrapper for Cloudflare R2 / S3 Storage.

Uses existing R2 environment variables from settings:
- R2_ENDPOINT
- R2_BUCKET
- R2_ACCESS_KEY
- R2_SECRET_KEY
- R2_PUBLIC_URL (optional custom domain)

Falls back gracefully to local media storage when R2 credentials are missing or
in local offline environments.
"""

import io
import logging
from pathlib import Path
import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)

MEDIA_DIR = Path(__file__).resolve().parent.parent.parent / "media"


def get_r2_client():
    """Initialize boto3 S3 client for Cloudflare R2 if credentials exist."""
    settings = get_settings()
    if not (settings.R2_ENDPOINT and settings.R2_ACCESS_KEY and settings.R2_SECRET_KEY and settings.R2_BUCKET):
        return None
    try:
        import boto3
        from botocore.config import Config

        client = boto3.client(
            "s3",
            endpoint_url=settings.R2_ENDPOINT,
            aws_access_key_id=settings.R2_ACCESS_KEY,
            aws_secret_access_key=settings.R2_SECRET_KEY,
            region_name="auto",
            config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
        )
        return client
    except Exception as err:
        logger.warning("Could not initialize Cloudflare R2 boto3 client: %s", err)
        return None


def upload_file(file_bytes: bytes, filename: str, content_type: str = "application/octet-stream") -> str:
    """Upload a file to Cloudflare R2 (or fallback to local disk).

    Returns the public object URL.
    """
    settings = get_settings()
    client = get_r2_client()

    clean_key = filename.lstrip("/")

    if client and settings.R2_BUCKET:
        try:
            client.put_object(
                Bucket=settings.R2_BUCKET,
                Key=clean_key,
                Body=file_bytes,
                ContentType=content_type,
            )
            if settings.R2_PUBLIC_URL:
                return f"{settings.R2_PUBLIC_URL.rstrip('/')}/{clean_key}"
            # Also save to local cache if possible
            try:
                dest_path = MEDIA_DIR / clean_key
                dest_path.parent.mkdir(parents=True, exist_ok=True)
                dest_path.write_bytes(file_bytes)
            except Exception:
                pass
            return f"/media/{clean_key}"
        except Exception as err:
            logger.warning("R2 upload failed for %s, falling back to local storage: %s", clean_key, err)

    # Local fallback
    dest_path = MEDIA_DIR / clean_key
    dest_path.parent.mkdir(parents=True, exist_ok=True)
    dest_path.write_bytes(file_bytes)
    return f"/media/{clean_key}"


def fetch_file_bytes(url_or_path: str) -> bytes | None:
    """Read bytes for a file URL or path.

    Reads straight off local disk for local files, or fetches from R2 client or HTTP.
    """
    if not url_or_path:
        return None

    clean_key = url_or_path
    if "/media/" in url_or_path:
        clean_key = url_or_path.split("/media/", 1)[-1].lstrip("/")
    elif "r2.cloudflarestorage.com" in url_or_path:
        parts = url_or_path.split("r2.cloudflarestorage.com/", 1)[-1].split("/", 1)
        clean_key = parts[-1].lstrip("/")

    # Check local disk
    local_file = MEDIA_DIR / clean_key
    if local_file.is_file():
        return local_file.read_bytes()

    # Check R2 client
    client = get_r2_client()
    settings = get_settings()
    if client and settings.R2_BUCKET:
        try:
            resp = client.get_object(Bucket=settings.R2_BUCKET, Key=clean_key)
            return resp["Body"].read()
        except Exception:
            pass

    if url_or_path.startswith("http://") or url_or_path.startswith("https://"):
        try:
            resp = httpx.get(url_or_path, timeout=6.0, follow_redirects=True)
            resp.raise_for_status()
            return resp.content
        except Exception as err:
            logger.warning("Could not fetch remote photo bytes from %s: %s", url_or_path, err)
            return None

    return None
