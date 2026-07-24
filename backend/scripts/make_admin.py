"""Promote a user to admin. This and the ADMIN_EMAIL startup hook are the
only ways to grant admin — no API can.

Usage (from backend/):  .venv/bin/python scripts/make_admin.py <email>
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.models import User, UserRole


def promote(db: Session, email: str) -> User | None:
    user = db.query(User).filter(User.email == email.lower()).first()
    if user is None:
        return None
    user.role = UserRole.admin
    db.commit()
    db.refresh(user)
    return user


def main() -> None:
    if len(sys.argv) != 2:
        print("Usage: make_admin.py <email>")
        raise SystemExit(1)
    db = SessionLocal()
    try:
        user = promote(db, sys.argv[1])
        if user is None:
            print(f"No user with email {sys.argv[1]}")
            raise SystemExit(1)
        print(f"{user.email} is now an admin.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
