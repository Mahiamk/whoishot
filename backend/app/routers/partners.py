"""Partner opportunities router for public inquiry submission."""

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import InquiryStatus, PartnerInquiry
from app.ratelimit import limiter
from app.schemas import PartnerInquiryCreate

router = APIRouter(tags=["partners"])


@router.post("/partner-inquiries", status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
def submit_partner_inquiry(
    request: Request,
    payload: PartnerInquiryCreate,
    db: Session = Depends(get_db),
) -> dict:
    """Public endpoint for agencies, modeling schools, fashion shows, and stylists
    to submit partnership inquiries. Includes basic honeypot anti-spam + rate limiting."""

    # Honeypot anti-spam check: honeypot field 'website_hp' must be empty.
    # If filled by a bot, silently return fake 201 success without saving to DB.
    if payload.website_hp and payload.website_hp.strip():
        return {"status": "submitted", "id": 0}

    inquiry = PartnerInquiry(
        company_name=payload.company_name.strip(),
        contact_name=payload.contact_name.strip(),
        email=payload.email.strip().lower(),
        phone=payload.phone.strip() if payload.phone else None,
        inquiry_type=payload.inquiry_type,
        message=payload.message.strip(),
        interested_in=payload.interested_in.strip() if payload.interested_in else None,
        status=InquiryStatus.new,
    )
    db.add(inquiry)
    db.commit()
    db.refresh(inquiry)

    return {"status": "submitted", "id": inquiry.id}
