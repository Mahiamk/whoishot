"""Generate blurred showcase thumbnails for contestants that have a photo
but no {id}_blur.jpg yet (e.g. seeded before this feature, or added by
seed.py, which intentionally skips blur generation to stay network-free).

Run from backend/:  .venv/bin/python scripts/backfill_blurred_thumbs.py
Pass --force to regenerate thumbnails that already exist.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.db import SessionLocal
from app.models import Contestant
from app.routers.media import _blur_thumb_path, generate_blurred_thumb


def main() -> None:
    force = "--force" in sys.argv
    db = SessionLocal()
    try:
        contestants = (
            db.query(Contestant).filter(Contestant.photo_url.isnot(None)).all()
        )
        generated = 0
        skipped = 0
        for contestant in contestants:
            if not force and _blur_thumb_path(contestant.id).is_file():
                skipped += 1
                continue
            generate_blurred_thumb(contestant.id, contestant.photo_url)
            if _blur_thumb_path(contestant.id).is_file():
                generated += 1
            else:
                print(f"  warning: could not generate thumb for contestant {contestant.id}")
        print(f"Generated {generated} blurred thumbnail(s), skipped {skipped} existing.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
