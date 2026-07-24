import json
from datetime import datetime, timedelta, timezone

from tests.conftest import API
from tests.test_admin import make_admin_headers


def _report(client, contestant_id: int, reporter_email: str = "snitch@t.dev") -> int:
    r = client.post(
        f"{API}/contestants/{contestant_id}/reports",
        json={"reason": "impersonation", "reporter_email": reporter_email},
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


def test_expiry_hides_profile_on_read(client, auth, contest, join):
    admin = make_admin_headers(client, auth)
    creator = auth(client, "creator@t.dev", "M")
    code = contest(client, creator)["join_code"]
    target = auth(client, "target@t.dev", "F")
    contestant_id = join(client, target, code, name="Target").json()["id"]
    viewer = auth(client, "viewer@t.dev", "M")

    report_id = _report(client, contestant_id)

    past_deadline = (
        datetime.now(timezone.utc) - timedelta(days=1)
    ).isoformat()
    r = client.post(
        f"{API}/admin/reports/{report_id}/request-info",
        json={"message": "Please confirm this is really you.", "deadline_at": past_deadline},
        headers=admin,
    )
    assert r.status_code == 201, r.text
    assert r.json()["status"] == "pending"

    # Profile still visible before anything reads the (already-overdue) request.
    assert (
        client.get(f"{API}/contestants/{contestant_id}", headers=viewer).status_code
        == 200
    )

    # Any read of the pending request past its deadline flips it — here via
    # the target user's own notices list.
    r = client.get(f"{API}/users/me/info-requests", headers=target)
    assert r.status_code == 200
    assert r.json()[0]["status"] == "expired"

    # The linked contestant profile is now auto-hidden.
    assert (
        client.get(f"{API}/contestants/{contestant_id}", headers=viewer).status_code
        == 404
    )
    listing = client.get(f"{API}/contests/{code}/contestants", headers=viewer).json()
    assert contestant_id not in [c["id"] for c in listing]

    # The admin queue also reflects the flip when read afterwards.
    admin_view = client.get(
        f"{API}/admin/reports?status=open", headers=admin
    ).json()
    row = next(i for i in admin_view["items"] if i["id"] == report_id)
    assert row["info_request"]["status"] == "expired"


def test_double_respond_rejected(client, auth, contest, join):
    admin = make_admin_headers(client, auth)
    creator = auth(client, "creator@t.dev", "M")
    code = contest(client, creator)["join_code"]
    target = auth(client, "target@t.dev", "F")
    contestant_id = join(client, target, code, name="Target").json()["id"]

    report_id = _report(client, contestant_id)
    r = client.post(
        f"{API}/admin/reports/{report_id}/request-info",
        json={"message": "What's going on here?"},
        headers=admin,
    )
    assert r.status_code == 201, r.text
    info_request_id = r.json()["id"]

    r = client.post(
        f"{API}/users/me/info-requests/{info_request_id}/respond",
        json={"response": "It's really me, here's proof."},
        headers=target,
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "responded"

    r = client.post(
        f"{API}/users/me/info-requests/{info_request_id}/respond",
        json={"response": "Again?"},
        headers=target,
    )
    assert r.status_code == 409

    # A second, unrelated request for the same report is fine (only *pending*
    # duplicates are blocked, and this one already resolved).
    r = client.post(
        f"{API}/admin/reports/{report_id}/request-info",
        json={"message": "One more thing."},
        headers=admin,
    )
    assert r.status_code == 201, r.text


def test_pending_duplicate_request_rejected(client, auth, contest, join):
    admin = make_admin_headers(client, auth)
    creator = auth(client, "creator@t.dev", "M")
    code = contest(client, creator)["join_code"]
    target = auth(client, "target@t.dev", "F")
    contestant_id = join(client, target, code, name="Target").json()["id"]

    report_id = _report(client, contestant_id)
    r = client.post(
        f"{API}/admin/reports/{report_id}/request-info",
        json={"message": "First ask."},
        headers=admin,
    )
    assert r.status_code == 201

    r = client.post(
        f"{API}/admin/reports/{report_id}/request-info",
        json={"message": "Second ask while first still pending."},
        headers=admin,
    )
    assert r.status_code == 409


def test_reporter_never_in_user_facing_payload(client, auth, contest, join):
    admin = make_admin_headers(client, auth)
    creator = auth(client, "creator@t.dev", "M")
    code = contest(client, creator)["join_code"]
    target = auth(client, "target@t.dev", "F")
    contestant_id = join(client, target, code, name="Target").json()["id"]

    report_id = _report(client, contestant_id, reporter_email="secret.snitch@t.dev")
    r = client.post(
        f"{API}/admin/reports/{report_id}/request-info",
        json={"message": "Please respond."},
        headers=admin,
    )
    assert r.status_code == 201
    info_request_id = r.json()["id"]

    list_resp = client.get(f"{API}/users/me/info-requests", headers=target)
    assert list_resp.status_code == 200
    assert "secret.snitch" not in json.dumps(list_resp.json())
    assert "reporter" not in json.dumps(list_resp.json()).lower()

    respond_resp = client.post(
        f"{API}/users/me/info-requests/{info_request_id}/respond",
        json={"response": "Here's my explanation."},
        headers=target,
    )
    assert respond_resp.status_code == 200
    assert "secret.snitch" not in json.dumps(respond_resp.json())
    assert "reporter" not in json.dumps(respond_resp.json()).lower()

    # Sanity: the admin-side view is allowed to see it (not a leak — this is
    # the existing, intentional admin-only reporter_email field).
    admin_view = client.get(f"{API}/admin/reports?status=open", headers=admin).json()
    row = next(i for i in admin_view["items"] if i["id"] == report_id)
    assert row["reporter_email"] == "secret.snitch@t.dev"


def test_request_info_requires_admin(client, auth, contest, join):
    creator = auth(client, "creator@t.dev", "M")
    code = contest(client, creator)["join_code"]
    target = auth(client, "target@t.dev", "F")
    contestant_id = join(client, target, code, name="Target").json()["id"]
    pleb = auth(client, "pleb@t.dev", "M")

    report_id = _report(client, contestant_id)
    r = client.post(
        f"{API}/admin/reports/{report_id}/request-info",
        json={"message": "sneaky"},
        headers=pleb,
    )
    assert r.status_code == 403


def test_respond_rejects_other_users_request(client, auth, contest, join):
    admin = make_admin_headers(client, auth)
    creator = auth(client, "creator@t.dev", "M")
    code = contest(client, creator)["join_code"]
    target = auth(client, "target@t.dev", "F")
    contestant_id = join(client, target, code, name="Target").json()["id"]
    stranger = auth(client, "stranger@t.dev", "M")

    report_id = _report(client, contestant_id)
    r = client.post(
        f"{API}/admin/reports/{report_id}/request-info",
        json={"message": "hi"},
        headers=admin,
    )
    info_request_id = r.json()["id"]

    r = client.post(
        f"{API}/users/me/info-requests/{info_request_id}/respond",
        json={"response": "not mine to answer"},
        headers=stranger,
    )
    assert r.status_code == 404
