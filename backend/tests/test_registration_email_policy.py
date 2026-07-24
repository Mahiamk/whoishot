from tests.conftest import API, PASSWORD


def test_register_rejects_non_university_email(client):
    r = client.post(
        f"{API}/auth/register",
        json={
            "email": "someone@gmail.com",
            "password": PASSWORD,
            "display_name": "Someone",
            "gender": "F",
        },
    )
    assert r.status_code == 422
    assert "university email" in r.json()["detail"].lower()


def test_register_accepts_university_email(client):
    r = client.post(
        f"{API}/auth/register",
        json={
            "email": "student@sunway.edu.my",
            "password": PASSWORD,
            "display_name": "Someone",
            "gender": "F",
        },
    )
    assert r.status_code == 201


def test_register_rejects_disposable_email(client):
    r = client.post(
        f"{API}/auth/register",
        json={
            "email": "someone@mailinator.com",
            "password": PASSWORD,
            "display_name": "Someone",
            "gender": "F",
        },
    )
    assert r.status_code == 422


def test_check_email_endpoint_reasons(client):
    r = client.get(f"{API}/auth/check-email?email=student@sunway.edu.my")
    assert r.json() == {"allowed": True, "reason": "university_ok"}

    r = client.get(f"{API}/auth/check-email?email=someone@gmail.com")
    assert r.json() == {"allowed": False, "reason": "not_university"}

    r = client.get(f"{API}/auth/check-email?email=someone@mailinator.com")
    assert r.json() == {"allowed": False, "reason": "disposable"}


def test_domain_request_is_idempotent_while_open(client):
    r = client.post(
        f"{API}/auth/domain-requests", json={"email": "student@my-custom-campus.example"}
    )
    assert r.status_code == 201
    body = r.json()
    assert body["requested_domain"] == "my-custom-campus.example"
    assert body["status"] == "open"
    report_id = body["id"]

    # Duplicate submission for the same still-open domain is idempotent.
    r2 = client.post(
        f"{API}/auth/domain-requests", json={"email": "other@my-custom-campus.example"}
    )
    assert r2.status_code == 201
    assert r2.json()["id"] == report_id


def test_domain_request_approval_adds_to_allow_list(client, auth):
    admin_headers = auth(client, "admin2@t.dev", "M")
    from app.db import SessionLocal
    from app.models import User, UserRole

    db = SessionLocal()
    try:
        admin = db.query(User).filter(User.email == "admin2@t.dev").first()
        admin.role = UserRole.admin
        db.commit()
    finally:
        db.close()

    # A domain that fails every existing rule (not disposable, not in the
    # vendored dataset, no matching TLD heuristic).
    domain_email = "student@my-custom-campus.example"
    r = client.get(f"{API}/auth/check-email?email={domain_email}")
    assert r.json()["allowed"] is False

    r = client.post(f"{API}/auth/domain-requests", json={"email": domain_email})
    assert r.status_code == 201
    report_id = r.json()["id"]

    r = client.get(
        f"{API}/admin/domain-requests?status=open", headers=admin_headers
    )
    assert r.status_code == 200
    assert any(item["id"] == report_id for item in r.json())

    r = client.post(
        f"{API}/admin/domain-requests/{report_id}/approve", headers=admin_headers
    )
    assert r.status_code == 200
    assert r.json()["status"] == "resolved"

    # Now allowed, via the freshly-created allow-list entry.
    r = client.get(f"{API}/auth/check-email?email={domain_email}")
    assert r.json() == {"allowed": True, "reason": "allow_listed"}

    # And no longer appears in the open queue.
    r = client.get(
        f"{API}/admin/domain-requests?status=open", headers=admin_headers
    )
    assert all(item["id"] != report_id for item in r.json())


def test_admin_email_domains_crud(client, auth):
    admin_headers = auth(client, "admin3@t.dev", "M")
    from app.db import SessionLocal
    from app.models import User, UserRole

    db = SessionLocal()
    try:
        admin = db.query(User).filter(User.email == "admin3@t.dev").first()
        admin.role = UserRole.admin
        db.commit()
    finally:
        db.close()

    r = client.post(
        f"{API}/admin/email-domains",
        json={"domain": "spammers.example", "kind": "deny", "note": "known spam"},
        headers=admin_headers,
    )
    assert r.status_code == 201
    entry_id = r.json()["id"]
    assert r.json()["domain"] == "spammers.example"

    r = client.get(f"{API}/auth/check-email?email=user@spammers.example")
    assert r.json() == {"allowed": False, "reason": "denied"}

    r = client.get(f"{API}/admin/email-domains", headers=admin_headers)
    assert any(e["id"] == entry_id for e in r.json())

    r = client.delete(f"{API}/admin/email-domains/{entry_id}", headers=admin_headers)
    assert r.status_code == 204

    r = client.get(f"{API}/auth/check-email?email=user@spammers.example")
    assert r.json()["allowed"] is False  # falls back to not_university
    assert r.json()["reason"] == "not_university"


def test_non_admin_cannot_manage_email_domains(client, auth):
    headers = auth(client, "user@t.dev", "F")
    r = client.post(
        f"{API}/admin/email-domains",
        json={"domain": "x.example", "kind": "allow"},
        headers=headers,
    )
    assert r.status_code == 403
