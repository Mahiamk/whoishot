#!/usr/bin/env python3
"""Migrate existing local media files (photos, blurred thumbnails, receipts) to Cloudflare R2."""

import logging
import os
import sys
from pathlib import Path

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from app.config import get_settings
from app.services.storage_service import MEDIA_DIR, get_r2_client, upload_file

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def migrate_local_media():
    settings = get_settings()
    client = get_r2_client()

    if not client or not settings.R2_BUCKET:
        logger.error("Cloudflare R2 is not properly configured in environment variables. Aborting migration.")
        sys.exit(1)

    if not MEDIA_DIR.exists():
        logger.info("No local media directory found at %s. Nothing to migrate.", MEDIA_DIR)
        return

    migrated_count = 0
    logger.info("Starting local media migration to Cloudflare R2 bucket '%s'...", settings.R2_BUCKET)

    for root, _, files in os.walk(MEDIA_DIR):
        for file_name in files:
            file_path = Path(root) / file_name
            relative_key = str(file_path.relative_to(MEDIA_DIR))

            # Determine MIME type
            ext = file_path.suffix.lower()
            mime_type = "application/octet-stream"
            if ext in (".jpg", ".jpeg"):
                mime_type = "image/jpeg"
            elif ext == ".png":
                mime_type = "image/png"
            elif ext == ".webp":
                mime_type = "image/webp"
            elif ext == ".pdf":
                mime_type = "application/pdf"

            try:
                data = file_path.read_bytes()
                public_url = upload_file(data, relative_key, mime_type)
                logger.info("Migrated '%s' -> %s", relative_key, public_url)
                migrated_count += 1
            except Exception as err:
                logger.error("Failed to migrate '%s': %s", relative_key, err)

    logger.info("Migration finished. Successfully uploaded %d files to Cloudflare R2.", migrated_count)


if __name__ == "__main__":
    migrate_local_media()
