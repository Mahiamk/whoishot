"""Tests for partner inquiries & opportunities feature."""

from datetime import datetime, timedelta, timezone
import pytest
from fastapi.testclient import TestClient

from app.db import SessionLocal
from app.models import (
    AdminAuditLog,
    Contest,
    Contestant,
    Gender,
    InquiryStatus,
    InquiryType,
    IntroductionStatus,
    PartnerInquiry,
    PartnerIntroduction,
    User,
    UserRole,
)


@pytest.fixture
def test_admin() -> User:
    db = SessionLocal()
    try:
        admin = User(
            email="admin_partner@t.dev",
            password_hash="hash",
            display_name="Admin Partner",
            gender=Gender.M,
            role=UserRole.admin,
        )
        db.add(admin)
        db.commit()
        db.refresh(admin)
        return admin
    finally:
        db.close()


@pytest.fixture
def admin_headers(test_admin: User) -> dict[str, str]:
    from app.security import create_access_token

    token = create_access_token(test_admin.id)
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def test_user() -> User:
    db = SessionLocal()
    try:
        user = User(
            email="contestant_user@t.dev",
            password_hash="hash",
            display_name="Contestant User",
            gender=Gender.F,
            role=UserRole.user,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        return user
    finally:
        db.close()


@pytest.fixture
def user_headers(test_user: User) -> dict[str, str]:
    from app.security import create_access_token

    token = create_access_token(test_user.id)
    return {"Authorization": f"Bearer {token}"}



@pytest.fixture
def test_contest(test_user: User) -> Contest:
    db = SessionLocal()
    try:
        contest = Contest(
            join_code="PARTNER1",
            title="Partner Opportunity Contest",
            creator_id=test_user.id,
        )
        db.add(contest)
        db.commit()
        db.refresh(contest)
        return contest
    finally:
        db.close()


@pytest.fixture
def opted_in_contestant(test_user: User, test_contest: Contest) -> Contestant:
    db = SessionLocal()
    try:
        contestant = Contestant(
            user_id=test_user.id,
            contest_id=test_contest.id,
            name="Opted In Model",
            gender_category=Gender.F,
            open_to_opportunities=True,
        )
        db.add(contestant)
        db.commit()
        db.refresh(contestant)
        return contestant
    finally:
        db.close()


@pytest.fixture
def non_opted_in_contestant(test_contest: Contest) -> Contestant:
    db = SessionLocal()
    try:
        other_user = User(
            email="other_user@t.dev",
            password_hash="hash",
            display_name="Other User",
            gender=Gender.F,
            role=UserRole.user,
        )
        db.add(other_user)
        db.flush()

        contestant = Contestant(
            user_id=other_user.id,
            contest_id=test_contest.id,
            name="Non Opted In Model",
            gender_category=Gender.F,
            open_to_opportunities=False,  # NOT opted in
        )
        db.add(contestant)
        db.commit()
        db.refresh(contestant)
        return contestant
    finally:
        db.close()


def test_public_partner_inquiry_submission(client: TestClient):
    payload = {
        "company_name": "Elite Modeling Agency",
        "contact_name": "Sarah Connor",
        "email": "sarah@elitemodels.com",
        "phone": "+1234567890",
        "inquiry_type": "modeling_school",
        "message": "We are seeking new faces for our summer campaign.",
        "interested_in": "Female contestants 18-25",
    }
    response = client.post("/api/v1/partner-inquiries", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["status"] == "submitted"
    assert data["id"] > 0

    db = SessionLocal()
    try:
        inquiry = db.get(PartnerInquiry, data["id"])
        assert inquiry is not None
        assert inquiry.company_name == "Elite Modeling Agency"
        assert inquiry.status == InquiryStatus.new
    finally:
        db.close()


def test_public_partner_inquiry_honeypot(client: TestClient):
    payload = {
        "company_name": "Spam Agency",
        "contact_name": "Spambot",
        "email": "bot@spam.com",
        "inquiry_type": "other",
        "message": "Click this link now",
        "website_hp": "http://spam-link.com",  # Honeypot filled
    }
    response = client.post("/api/v1/partner-inquiries", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["id"] == 0  # Fake response, not saved

    db = SessionLocal()
    try:
        inquiries = db.query(PartnerInquiry).filter(PartnerInquiry.company_name == "Spam Agency").all()
        assert len(inquiries) == 0
    finally:
        db.close()


def test_propose_introduction_blocked_if_not_opted_in(
    client: TestClient,
    admin_headers: dict[str, str],
    non_opted_in_contestant: Contestant,
):
    db = SessionLocal()
    try:
        inquiry = PartnerInquiry(
            company_name="Vogue Stylists",
            contact_name="Anna",
            email="anna@vogue.com",
            inquiry_type=InquiryType.stylist,
            message="Looking for stylists",
        )
        db.add(inquiry)
        db.commit()
        inquiry_id = inquiry.id
    finally:
        db.close()

    # Attempt to propose introduction to non-opted-in contestant -> Must be 403 Forbidden
    response = client.post(
        f"/api/v1/admin/partner-inquiries/{inquiry_id}/propose-introduction",
        headers=admin_headers,
        json={"contestant_id": non_opted_in_contestant.id, "admin_note": "Great fit"},
    )
    assert response.status_code == 403
    assert "not opted in" in response.json()["detail"].lower()


def test_propose_introduction_succeeds_if_opted_in(
    client: TestClient,
    admin_headers: dict[str, str],
    opted_in_contestant: Contestant,
):
    db = SessionLocal()
    try:
        inquiry = PartnerInquiry(
            company_name="Fashion Week Org",
            contact_name="John",
            email="john@fashionweek.com",
            inquiry_type=InquiryType.fashion_show,
            message="Catwalk recruitment",
        )
        db.add(inquiry)
        db.commit()
        inquiry_id = inquiry.id
    finally:
        db.close()

    response = client.post(
        f"/api/v1/admin/partner-inquiries/{inquiry_id}/propose-introduction",
        headers=admin_headers,
        json={"contestant_id": opted_in_contestant.id, "admin_note": "High average score"},
    )
    assert response.status_code == 201
    data = response.json()
    assert data["status"] == "pending_consent"
    assert data["contact_info_shared"] is False

    db = SessionLocal()
    try:
        audit_row = (
            db.query(AdminAuditLog)
            .filter(AdminAuditLog.action == "partner_introduction.propose")
            .first()
        )
        assert audit_row is not None
    finally:
        db.close()


def test_user_accepts_introduction_contact_never_auto_released(
    client: TestClient,
    user_headers: dict[str, str],
    admin_headers: dict[str, str],
    opted_in_contestant: Contestant,
    test_admin: User,
):
    db = SessionLocal()
    try:
        inquiry = PartnerInquiry(
            company_name="Milan Academy",
            contact_name="Marco",
            email="marco@milan.com",
            inquiry_type=InquiryType.modeling_school,
            message="Scholarship opportunity",
        )
        db.add(inquiry)
        db.commit()

        intro = PartnerIntroduction(
            inquiry_id=inquiry.id,
            contestant_id=opted_in_contestant.id,
            admin_id=test_admin.id,
            status=IntroductionStatus.pending_consent,
            deadline_at=datetime.now(timezone.utc) + timedelta(days=14),
        )
        db.add(intro)
        db.commit()
        intro_id = intro.id
    finally:
        db.close()

    # User fetches introductions on /me/introductions
    get_resp = client.get("/api/v1/users/me/introductions", headers=user_headers)
    assert get_resp.status_code == 200
    intros_data = get_resp.json()
    assert len(intros_data) == 1
    assert intros_data[0]["id"] == intro_id

    # User responds: accept
    resp = client.post(
        f"/api/v1/users/me/introductions/{intro_id}/respond",
        headers=user_headers,
        json={"action": "accept"},
    )
    assert resp.status_code == 200
    res_data = resp.json()
    assert res_data["status"] == "accepted"

    # CRITICAL SPEC REQUIREMENT: contact_info_shared MUST STILL BE FALSE
    assert res_data["contact_info_shared"] is False

    db = SessionLocal()
    try:
        db_intro = db.get(PartnerIntroduction, intro_id)
        assert db_intro.contact_info_shared is False
    finally:
        db.close()

    # Admin performs manual "Mark as shared" action
    shared_resp = client.post(
        f"/api/v1/admin/partner-introductions/{intro_id}/mark-shared",
        headers=admin_headers,
    )
    assert shared_resp.status_code == 200
    shared_data = shared_resp.json()
    assert shared_data["contact_info_shared"] is True
    assert shared_data["shared_at"] is not None

    db = SessionLocal()
    try:
        audit_shared = (
            db.query(AdminAuditLog)
            .filter(AdminAuditLog.action == "partner_introduction.mark_shared")
            .first()
        )
        assert audit_shared is not None
    finally:
        db.close()


def test_introduction_expiry(
    client: TestClient,
    user_headers: dict[str, str],
    opted_in_contestant: Contestant,
    test_admin: User,
):
    db = SessionLocal()
    try:
        inquiry = PartnerInquiry(
            company_name="Expired Co",
            contact_name="Bob",
            email="bob@expired.com",
            inquiry_type=InquiryType.other,
            message="Past opportunity",
        )
        db.add(inquiry)
        db.commit()

        # Expired 2 days ago
        past_deadline = datetime.now(timezone.utc) - timedelta(days=2)
        intro = PartnerIntroduction(
            inquiry_id=inquiry.id,
            contestant_id=opted_in_contestant.id,
            admin_id=test_admin.id,
            status=IntroductionStatus.pending_consent,
            deadline_at=past_deadline,
        )
        db.add(intro)
        db.commit()
        intro_id = intro.id
    finally:
        db.close()

    # Fetch on read -> status converted to expired
    get_resp = client.get("/api/v1/users/me/introductions", headers=user_headers)
    assert get_resp.status_code == 200
    intros_data = get_resp.json()
    assert len(intros_data) == 1
    assert intros_data[0]["status"] == "expired"

    # Trying to accept an expired proposal returns 400 Bad Request
    resp = client.post(
        f"/api/v1/users/me/introductions/{intro_id}/respond",
        headers=user_headers,
        json={"action": "accept"},
    )
    assert resp.status_code == 400

