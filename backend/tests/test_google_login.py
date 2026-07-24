import pytest

from app.routers import auth as auth_module
from tests.conftest import API


@pytest.fixture
def google_claims(monkeypatch):
    """Stub Google credential verification. Tests set .claims to control
    what a 'verified' Google token contains; configure a client ID so the
    endpoint doesn't 503."""
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "GOOGLE_CLIENT_ID", "test-client-id")

    holder = type("Holder", (), {"claims": {}})()

    def fake_verify(credential: str, client_id: str) -> dict:
        if credential == "bad-token":
            raise ValueError("bad token")
        return holder.claims

    monkeypatch.setattr(auth_module, "verify_google_credential", fake_verify)
    return holder


def test_google_login_unconfigured_returns_503(client, monkeypatch):
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "GOOGLE_CLIENT_ID", None)
    r = client.post(f"{API}/auth/google", json={"credential": "whatever"})
    assert r.status_code == 503


def test_google_login_invalid_credential(client, google_claims):
    r = client.post(f"{API}/auth/google", json={"credential": "bad-token"})
    assert r.status_code == 401


def test_google_login_new_user_needs_gender_then_creates(client, google_claims):
    google_claims.claims = {
        "email": "newbie@sunway.edu.my",
        "email_verified": True,
        "name": "New Student",
    }

    # First call: credential is fine but no account exists and no gender
    # was sent — the client is asked to collect one.
    r = client.post(f"{API}/auth/google", json={"credential": "good"})
    assert r.status_code == 200
    assert r.json() == {
        "access_token": None,
        "token_type": "bearer",
        "needs_gender": True,
    }

    # Retry with a bracket: account is created and a token issued.
    r = client.post(
        f"{API}/auth/google", json={"credential": "good", "gender": "M"}
    )
    assert r.status_code == 200
    body = r.json()
    assert body["needs_gender"] is False
    assert body["access_token"]

    me = client.get(
        f"{API}/auth/me",
        headers={"Authorization": f"Bearer {body['access_token']}"},
    ).json()
    assert me["email"] == "newbie@sunway.edu.my"
    assert me["display_name"] == "New Student"
    assert me["gender"] == "M"
    assert me["is_verified"] is True


def test_google_login_existing_user_signs_straight_in(client, auth, google_claims):
    auth(client, "existing@t.dev", "F")  # normal password account
    google_claims.claims = {"email": "existing@t.dev", "email_verified": True}

    r = client.post(f"{API}/auth/google", json={"credential": "good"})
    assert r.status_code == 200
    body = r.json()
    assert body["needs_gender"] is False
    assert body["access_token"]


def test_google_login_enforces_email_policy(client, google_claims):
    google_claims.claims = {"email": "someone@gmail.com", "email_verified": True}
    r = client.post(
        f"{API}/auth/google", json={"credential": "good", "gender": "F"}
    )
    assert r.status_code == 422
    assert "university email" in r.json()["detail"].lower()


def test_google_login_rejects_unverified_email(client, google_claims):
    google_claims.claims = {"email": "shady@sunway.edu.my", "email_verified": False}
    r = client.post(f"{API}/auth/google", json={"credential": "good"})
    assert r.status_code == 401


def test_google_login_banned_user_rejected(client, auth, google_claims):
    auth(client, "banned@t.dev", "M")
    from app.db import SessionLocal
    from app.models import User

    db = SessionLocal()
    try:
        u = db.query(User).filter(User.email == "banned@t.dev").first()
        u.is_banned = True
        db.commit()
    finally:
        db.close()

    google_claims.claims = {"email": "banned@t.dev", "email_verified": True}
    r = client.post(f"{API}/auth/google", json={"credential": "good"})
    assert r.status_code == 403
