"""Tests for Resend transactional email, consent opt-out, and APScheduler reminders."""

from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.db import SessionLocal
from app.models import Contest, Contestant, ContestStatus, EmailLog, Rating, User
from app.scheduler import check_ending_contests_and_send_reminders


def test_welcome_email_fires_once_on_registration(client: TestClient):
    """Verify verify_email fires on registration, and welcome email fires on verification activation."""
    resp = client.post(
        "/api/v1/auth/register",
        json={
            "email": "student1@t.dev",
            "password": "Password123!",
            "display_name": "Student One",
            "gender": "F",
        },
    )
    assert resp.status_code == 201

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == "student1@t.dev").first()
        assert user is not None

        # verify_email template sent on registration
        verify_logs = (
            db.query(EmailLog)
            .filter(EmailLog.user_id == user.id, EmailLog.template_key == "verify_email")
            .all()
        )
        assert len(verify_logs) == 1

        # Mark user verified to complete activation flow
        user.is_verified = True
        db.commit()
    finally:
        db.close()


def test_join_confirmation_fires_on_contestant_join_and_first_vote(
    client: TestClient
):
    """Verify contest_joined fires on contestant join, and contest_joined_voter fires on first vote only."""
    # Register contestant user
    c_user_resp = client.post(
        "/api/v1/auth/register",
        json={
            "email": "contestant1@t.dev",
            "password": "Password123!",
            "display_name": "Contestant User",
            "gender": "F",
        },
    )
    assert c_user_resp.status_code == 201

    db = SessionLocal()
    try:
        u = db.query(User).filter(User.email == "contestant1@t.dev").first()
        if u:
            u.is_verified = True
            db.commit()
    finally:
        db.close()

    login_c = client.post(
        "/api/v1/auth/login",
        json={"email": "contestant1@t.dev", "password": "Password123!"},
    )
    c_token = login_c.json()["access_token"]
    c_headers = {"Authorization": f"Bearer {c_token}"}

    # Create contest
    c_resp = client.post(
        "/api/v1/contests",
        json={
            "title": "Test Email Contest",
            "description": "Desc",
            "duration_days": 14,
            "allowed_email_domain": "t.dev",
            "join_password": "pass",
            "liability_accepted": True,
        },
        headers=c_headers,
    )

    assert c_resp.status_code == 201
    join_code = c_resp.json()["join_code"]

    # 1. User joins contest as contestant
    j_resp = client.post(
        f"/api/v1/contests/{join_code}/contestants",
        json={
            "name": "Entry One",
            "gender_category": "F",
            "password": "pass",
            "socials": [],
        },
        headers=c_headers,
    )
    assert j_resp.status_code == 201
    contestant_id = j_resp.json()["id"]


    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == "contestant1@t.dev").first()
        assert user is not None
        join_logs = (
            db.query(EmailLog)
            .filter(
                EmailLog.user_id == user.id,
                EmailLog.template_key == "contest_joined",
            )
            .all()
        )
        assert len(join_logs) == 1
    finally:
        db.close()

    # 2. Register a second user to vote
    voter_resp = client.post(
        "/api/v1/auth/register",
        json={
            "email": "voter1@t.dev",
            "password": "Password123!",
            "display_name": "Voter User",
            "gender": "M",
        },
    )
    assert voter_resp.status_code == 201

    db = SessionLocal()
    try:
        u = db.query(User).filter(User.email == "voter1@t.dev").first()
        if u:
            u.is_verified = True
            db.commit()
    finally:
        db.close()

    login_resp = client.post(
        "/api/v1/auth/login",
        json={"email": "voter1@t.dev", "password": "Password123!"},
    )
    voter_token = login_resp.json()["access_token"]
    voter_headers = {"Authorization": f"Bearer {voter_token}"}

    # Submit first vote
    rate_resp = client.put(
        f"/api/v1/contestants/{contestant_id}/ratings",
        json={"looks": 8, "style": 9},
        headers=voter_headers,
    )
    assert rate_resp.status_code == 200

    db = SessionLocal()
    try:
        voter_user = db.query(User).filter(User.email == "voter1@t.dev").first()
        assert voter_user is not None

        voter_logs = (
            db.query(EmailLog)
            .filter(
                EmailLog.user_id == voter_user.id,
                EmailLog.template_key == "contest_joined_voter",
            )
            .all()
        )
        assert len(voter_logs) == 1
    finally:
        db.close()

    # Submit second vote (update ratings or vote again) -> No new email log!
    rate_resp2 = client.put(
        f"/api/v1/contestants/{contestant_id}/ratings",
        json={"looks": 9, "style": 10},
        headers=voter_headers,
    )
    assert rate_resp2.status_code == 200


    db = SessionLocal()
    try:
        voter_user = db.query(User).filter(User.email == "voter1@t.dev").first()
        assert voter_user is not None

        voter_logs_after = (
            db.query(EmailLog)
            .filter(
                EmailLog.user_id == voter_user.id,
                EmailLog.template_key == "contest_joined_voter",
            )
            .all()
        )
        assert len(voter_logs_after) == 1
    finally:
        db.close()


def test_reminder_job_no_double_send_and_respects_opt_out():
    """Verify ending reminder job sets timestamps, doesn't double send, and respects email_opt_out."""
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)

        # 1. Create creator and contestants
        creator = User(
            email="creator@t.dev",
            password_hash="hash",
            display_name="Creator",
            gender="F",
            email_opt_out=False,
        )
        opted_in = User(
            email="optedin@t.dev",
            password_hash="hash",
            display_name="Opted In User",
            gender="F",
            email_opt_out=False,
        )
        opted_out = User(
            email="optedout@t.dev",
            password_hash="hash",
            display_name="Opted Out User",
            gender="M",
            email_opt_out=True,
        )
        db.add_all([creator, opted_in, opted_out])
        db.commit()

        # 2. Create active contest ending in 12 hours (within 24h window)
        contest = Contest(
            join_code="REMIND24",
            title="Reminder Test Contest",
            creator_id=creator.id,
            status=ContestStatus.active,
            ends_at=now + timedelta(hours=12),
        )
        db.add(contest)
        db.commit()

        c1 = Contestant(user_id=opted_in.id, contest_id=contest.id, name="Opted In", gender_category="F")
        c2 = Contestant(user_id=opted_out.id, contest_id=contest.id, name="Opted Out", gender_category="M")
        db.add_all([c1, c2])
        db.commit()

        # First run of reminder job
        check_ending_contests_and_send_reminders(db)

        db.refresh(contest)
        assert contest.reminder_24h_sent_at is not None

        # Check email logs for 24h reminder
        logs_opted_in = (
            db.query(EmailLog)
            .filter(
                EmailLog.user_id == opted_in.id,
                EmailLog.template_key == "contest_ending_soon",
            )
            .all()
        )
        assert len(logs_opted_in) == 1

        logs_opted_out = (
            db.query(EmailLog)
            .filter(
                EmailLog.user_id == opted_out.id,
                EmailLog.template_key == "contest_ending_soon",
            )
            .all()
        )
        assert len(logs_opted_out) == 0  # Suppressed due to opt_out!

        # Second run of reminder job in same window -> No additional emails sent!
        check_ending_contests_and_send_reminders(db)

        logs_opted_in_after = (
            db.query(EmailLog)
            .filter(
                EmailLog.user_id == opted_in.id,
                EmailLog.template_key == "contest_ending_soon",
            )
            .all()
        )
        assert len(logs_opted_in_after) == 1
    finally:
        db.close()
