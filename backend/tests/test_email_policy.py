from tests.conftest import API

from app.email_policy import check_email_domain
from app.models import DomainKind, EmailDomain


def test_subdomain_pass(client):
    from app.db import SessionLocal

    db = SessionLocal()
    try:
        allowed, reason = check_email_domain(db, "student@student.sunway.edu.my")
    finally:
        db.close()
    assert allowed is True
    assert reason == "university_ok"


def test_deny_beats_allow(client):
    from app.db import SessionLocal

    db = SessionLocal()
    try:
        db.add(EmailDomain(domain="sunway.edu.my", kind=DomainKind.allow))
        db.add(EmailDomain(domain="spam.sunway.edu.my", kind=DomainKind.deny))
        db.commit()

        # The broader domain is allow-listed and this address is also a
        # subdomain of it, but the more specific deny entry must still win.
        allowed, reason = check_email_domain(db, "user@spam.sunway.edu.my")
    finally:
        db.close()
    assert allowed is False
    assert reason == "denied"


def test_disposable_blocked(client):
    from app.db import SessionLocal

    db = SessionLocal()
    try:
        allowed, reason = check_email_domain(db, "throwaway@mailinator.com")
    finally:
        db.close()
    assert allowed is False
    assert reason == "disposable"


def test_heuristic_pass(client):
    from app.db import SessionLocal

    db = SessionLocal()
    try:
        # Not present in the vendored dataset — must pass via the bare
        # ".edu" TLD heuristic instead.
        allowed, reason = check_email_domain(db, "student@heuristic-test.edu")
    finally:
        db.close()
    assert allowed is True
    assert reason == "university_ok"


def test_enumeration_safe(client, auth):
    # A university-domain address that's already registered...
    auth(client, "taken@heuristic-test.edu", "F")
    r1 = client.get(f"{API}/auth/check-email?email=taken@heuristic-test.edu")
    assert r1.status_code == 200
    body1 = r1.json()

    # ...and one at the same domain that's never been registered must get
    # an identical shape/verdict. No field may leak registration status.
    r2 = client.get(f"{API}/auth/check-email?email=never-seen@heuristic-test.edu")
    assert r2.status_code == 200
    body2 = r2.json()

    assert body1 == {"allowed": True, "reason": "university_ok"}
    assert body2 == {"allowed": True, "reason": "university_ok"}
    assert set(body1.keys()) == {"allowed", "reason"}
