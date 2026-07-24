from sqlalchemy.orm import Session

from app.models import AdminAuditLog, User


def audit(
    db: Session,
    admin: User | None,
    action: str,
    target_type: str,
    target_id: int,
    detail: dict | None = None,
) -> None:
    """Record one audit row; committed together with the mutation.
    admin=None marks a system-triggered transition (e.g. check-on-read
    expiry), not an admin action."""
    db.add(
        AdminAuditLog(
            admin_id=admin.id if admin else None,
            action=action,
            target_type=target_type,
            target_id=target_id,
            detail=detail,
        )
    )
