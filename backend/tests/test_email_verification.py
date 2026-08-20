"""Tests for mandatory email verification and activation flow."""

import pytest
from fastapi.testclient import TestClient

from app.db import SessionLocal
from app.models import EmailLog, User
from app.security import create_email_verification_token, decode_email_verification_token


def test_verification_token_helpers():
    token = create_email_verification_token(42)
    assert token is not None
    user_id = decode_email_verification_token(token)
    assert user_id == 42

    # Invalid token returns None
    assert decode_email_verification_token("invalid.token.string") is None


def test_registration_requires_verification_and_blocks_login(client: TestClient):
    email = "newstudent@student.upm.edu.my"
    password = "password123"

    # 1. Register new user
    reg_resp = client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": password,
            "display_name": "New Student",
            "gender": "F",
        },
    )
    assert reg_resp.status_code == 201
    user_data = reg_resp.json()
    assert user_data["is_verified"] is False

    # Check email log for verification email
    db = SessionLocal()
    try:
        email_log = db.query(EmailLog).filter(EmailLog.to_email == email).first()
        assert email_log is not None
        assert email_log.template_key == "verify_email"
        assert "verify-email?token=" in email_log.context.get("verification_url", "")
    finally:
        db.close()

    # 2. Login attempt before activation fails with 403
    login_resp = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    assert login_resp.status_code == 403
    assert "verify your email" in login_resp.json()["detail"].lower()

    # 3. Resend verification email
    resend_resp = client.post(
        "/api/v1/auth/resend-verification",
        json={"email": email},
    )
    assert resend_resp.status_code == 200

    # 4. Extract token and activate account via /verify-email
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email).first()
        token = create_email_verification_token(user.id)
    finally:
        db.close()

    verify_resp = client.post(
        "/api/v1/auth/verify-email",
        json={"token": token},
    )
    assert verify_resp.status_code == 200
    assert "access_token" in verify_resp.json()

    # Verify DB flag updated
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email).first()
        assert user.is_verified is True
    finally:
        db.close()

    # 5. Login attempt now succeeds
    login_ok_resp = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    assert login_ok_resp.status_code == 200
    assert "access_token" in login_ok_resp.json()
