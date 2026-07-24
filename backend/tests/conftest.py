import os

# Must be set before any app import: engine and settings load at import time.
os.environ["DATABASE_URL"] = "sqlite:///./test_whoishot.db"
os.environ["JWT_SECRET"] = "test-secret"

import pytest
from fastapi.testclient import TestClient

import app.models  # noqa: F401  (populate Base.metadata)
from app.db import Base, SessionLocal, engine
from app.main import app as fastapi_app
from app.models import DomainKind, EmailDomain
from app.routers.contests import _leaderboard_cache

API = "/api/v1"
PASSWORD = "testpass123"
CONTEST_PASSWORD = "letmein"


@pytest.fixture(autouse=True)
def fresh_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    _leaderboard_cache.clear()
    # Every test fixture registers @t.dev addresses — allow-list that
    # domain so the registration email policy doesn't need to be threaded
    # through every unrelated test's fixtures.
    db = SessionLocal()
    try:
        db.add(EmailDomain(domain="t.dev", kind=DomainKind.allow))
        db.commit()
    finally:
        db.close()
    yield


@pytest.fixture
def client():
    with TestClient(fastapi_app) as c:
        yield c


@pytest.fixture
def auth():
    """Factory: register a user and return their auth headers."""

    def _auth(client: TestClient, email: str, gender: str = "F") -> dict[str, str]:
        r = client.post(
            f"{API}/auth/register",
            json={
                "email": email,
                "password": PASSWORD,
                "display_name": email.split("@")[0],
                "gender": gender,
            },
        )
        assert r.status_code == 201, r.text
        r = client.post(
            f"{API}/auth/login", json={"email": email, "password": PASSWORD}
        )
        assert r.status_code == 200, r.text
        return {"Authorization": f"Bearer {r.json()['access_token']}"}

    return _auth


@pytest.fixture
def contest():
    """Factory: create a contest, return its JSON."""

    def _contest(client: TestClient, headers: dict, **overrides) -> dict:
        payload = {
            "title": "Test Contest",
            "is_showcase_public": True,
            "duration_days": 14,
            # Participation protection is mandatory at creation; every test
            # user registers @t.dev, so this keeps existing tests passing.
            "allowed_email_domain": "t.dev",
            "join_password": CONTEST_PASSWORD,
            **overrides,
        }
        r = client.post(f"{API}/contests", json=payload, headers=headers)
        assert r.status_code == 201, r.text
        return r.json()

    return _contest


@pytest.fixture
def join():
    """Factory: join a contest as contestant, return the response."""

    def _join(
        client: TestClient,
        headers: dict,
        join_code: str,
        name: str = "Someone",
        gender: str = "F",
        password: str = CONTEST_PASSWORD,
    ):
        return client.post(
            f"{API}/contests/{join_code}/contestants",
            json={"name": name, "gender_category": gender, "password": password},
            headers=headers,
        )

    return _join
