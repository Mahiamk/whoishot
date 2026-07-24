from tests.conftest import API, CONTEST_PASSWORD


def test_create_requires_domain_and_password(client, auth):
    creator = auth(client, "creator@t.dev", "M")
    r = client.post(
        f"{API}/contests",
        json={"title": "Unprotected", "duration_days": 7},
        headers=creator,
    )
    assert r.status_code == 422

    r = client.post(
        f"{API}/contests",
        json={
            "title": "No password",
            "duration_days": 7,
            "allowed_email_domain": "t.dev",
        },
        headers=creator,
    )
    assert r.status_code == 422


def test_contest_payload_never_exposes_password(client, auth, contest):
    creator = auth(client, "creator@t.dev", "M")
    created = contest(client, creator)
    assert "join_password" not in created
    assert "join_password_hash" not in created
    assert created["requires_password"] is True
    assert created["allowed_email_domain"] == "t.dev"

    detail = client.get(
        f"{API}/contests/{created['join_code']}", headers=creator
    ).json()
    assert "join_password" not in detail
    assert "join_password_hash" not in detail
    assert detail["requires_password"] is True


def test_join_rejects_wrong_email_domain(client, auth, contest, join):
    creator = auth(client, "creator@t.dev", "M")
    code = contest(client, creator, allowed_email_domain="sunway.edu.my")[
        "join_code"
    ]

    outsider = auth(client, "outsider@t.dev", "F")
    r = join(client, outsider, code)
    assert r.status_code == 403
    assert "sunway.edu.my" in r.json()["detail"]


def test_join_accepts_subdomain_of_allowed_domain(client, auth, contest, join):
    creator = auth(client, "creator@t.dev", "M")
    code = contest(client, creator)["join_code"]  # allowed domain: t.dev

    student = auth(client, "someone@student.t.dev", "F")
    r = join(client, student, code)
    assert r.status_code == 201


def test_join_rejects_wrong_or_missing_password(client, auth, contest, join):
    creator = auth(client, "creator@t.dev", "M")
    code = contest(client, creator)["join_code"]

    user = auth(client, "user@t.dev", "F")
    r = join(client, user, code, password="wrong-password")
    assert r.status_code == 403
    assert r.json()["detail"] == "Wrong contest password"

    r = client.post(
        f"{API}/contests/{code}/contestants",
        json={"name": "NoPass", "gender_category": "F"},
        headers=user,
    )
    assert r.status_code == 403

    r = join(client, user, code, password=CONTEST_PASSWORD)
    assert r.status_code == 201


def test_grandfathered_contest_joins_without_protection(client, auth, join):
    # Contests created before protection existed have neither a domain nor
    # a password; they must keep working unrestricted.
    creator = auth(client, "creator@t.dev", "M")
    from app.db import SessionLocal
    from app.models import Contest, User

    db = SessionLocal()
    try:
        creator_row = db.query(User).filter(User.email == "creator@t.dev").first()
        legacy = Contest(
            join_code="LEGACY-01",
            title="Legacy Contest",
            creator_id=creator_row.id,
            is_active=True,
        )
        db.add(legacy)
        db.commit()
    finally:
        db.close()

    user = auth(client, "user@t.dev", "F")
    r = client.post(
        f"{API}/contests/LEGACY-01/contestants",
        json={"name": "Free", "gender_category": "F"},
        headers=user,
    )
    assert r.status_code == 201
