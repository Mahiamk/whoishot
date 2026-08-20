from app.db import SessionLocal
from app.models import AdminAuditLog, Rating, UserRole
from scripts.make_admin import promote
from tests.conftest import API, PASSWORD


def make_admin_headers(client, auth, email="admin@t.dev"):
    """Create a user, promote via the script path (the only way), re-login."""
    auth(client, email, "M")
    db = SessionLocal()
    try:
        user = promote(db, email)
        assert user is not None and user.role == UserRole.admin
    finally:
        db.close()
    r = client.post(f"{API}/auth/login", json={"email": email, "password": PASSWORD})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_non_admin_gets_403(client, auth):
    user = auth(client, "pleb@t.dev", "F")
    for method, path in [
        ("GET", "/admin/metrics"),
        ("GET", "/admin/reports"),
        ("GET", "/admin/users"),
        ("GET", "/admin/contests"),
        ("POST", "/admin/users/1/ban"),
        ("POST", "/admin/users/1/unban"),
        ("POST", "/admin/reports/1/resolve"),
        ("POST", "/admin/contests/1/deactivate"),
    ]:
        r = client.request(
            method, f"{API}{path}", headers=user,
            json={"action": "dismiss"} if "resolve" in path else None,
        )
        assert r.status_code == 403, f"{method} {path}: {r.status_code}"
    # Unauthenticated gets 401.
    assert client.get(f"{API}/admin/metrics").status_code == 401


def test_ban_hides_profiles_and_excludes_ratings(client, auth, contest, join):
    admin = make_admin_headers(client, auth)
    creator = auth(client, "creator@t.dev", "M")
    code = contest(client, creator)["join_code"]
    target = auth(client, "target@t.dev", "F")
    contestant_id = join(client, target, code, name="Target").json()["id"]

    voters = []
    for i in range(3):
        v = auth(client, f"voter{i}@t.dev", "M")
        voters.append(v)
        client.put(
            f"{API}/contestants/{contestant_id}/ratings",
            json={"looks": 6},
            headers=v,
        )

    profile = client.get(f"{API}/contestants/{contestant_id}", headers=creator).json()
    assert profile["vote_count"] == 3
    assert profile["avg_score"] == 6.0

    # Ban voter2: their ratings stay in the DB but drop out of averages.
    voter2_id = client.get(f"{API}/auth/me", headers=voters[2]).json()["id"]
    r = client.post(f"{API}/admin/users/{voter2_id}/ban", headers=admin)
    assert r.status_code == 200 and r.json()["is_banned"] is True

    profile = client.get(f"{API}/contestants/{contestant_id}", headers=creator).json()
    assert profile["vote_count"] == 2
    assert profile["avg_score"] is None  # below min-3 again
    board = client.get(
        f"{API}/contests/{code}/leaderboard?gender=F", headers=creator
    ).json()
    assert board["podium"] == []
    db = SessionLocal()
    try:
        kept = db.query(Rating).filter(Rating.voter_id == voter2_id).count()
        assert kept == 1  # rating rows are kept
    finally:
        db.close()

    # Banned voter's login is rejected with a clear message.
    r = client.post(
        f"{API}/auth/login",
        json={"email": "voter2@t.dev", "password": PASSWORD},
    )
    assert r.status_code == 403
    assert "banned" in r.json()["detail"].lower()

    # Ban the contestant's owner: profile hidden everywhere.
    target_id = client.get(f"{API}/auth/me", headers=target).json()["id"]
    client.post(f"{API}/admin/users/{target_id}/ban", headers=admin)
    assert (
        client.get(f"{API}/contestants/{contestant_id}", headers=creator).status_code
        == 404
    )
    listing = client.get(f"{API}/contests/{code}/contestants", headers=creator).json()
    assert listing == []
    showcase = client.get(f"{API}/contests/{code}/showcase").json()
    assert showcase["F"] == []


def test_every_admin_action_writes_audit_row(client, auth, contest, join):
    admin = make_admin_headers(client, auth)
    creator = auth(client, "creator@t.dev", "M")
    contest_data = contest(client, creator)
    code = contest_data["join_code"]
    target = auth(client, "target@t.dev", "F")
    contestant_id = join(client, target, code, name="Target").json()["id"]
    target_id = client.get(f"{API}/auth/me", headers=target).json()["id"]

    report_id = client.post(
        f"{API}/contestants/{contestant_id}/reports", json={"reason": "spam"}
    ).json()["id"]

    assert (
        client.post(f"{API}/admin/users/{target_id}/ban", headers=admin).status_code
        == 200
    )
    assert (
        client.post(f"{API}/admin/users/{target_id}/unban", headers=admin).status_code
        == 200
    )
    assert (
        client.post(
            f"{API}/admin/reports/{report_id}/resolve",
            json={"action": "hide_contestant"},
            headers=admin,
        ).status_code
        == 200
    )
    assert (
        client.post(
            f"{API}/admin/contests/{contest_data['id']}/deactivate", headers=admin
        ).status_code
        == 200
    )

    db = SessionLocal()
    try:
        rows = db.query(AdminAuditLog).order_by(AdminAuditLog.id).all()
        actions = [r.action for r in rows]
        assert actions == [
            "user.ban",
            "user.unban",
            "report.hide_contestant",
            "contest.deactivate",
        ]
        admin_id = client.get(f"{API}/auth/me", headers=admin).json()["id"]
        assert all(r.admin_id == admin_id for r in rows)
        assert all(r.target_type and r.target_id for r in rows)
    finally:
        db.close()


def test_no_public_path_grants_admin(client, auth):
    # Registering with a smuggled role field is ignored.
    r = client.post(
        f"{API}/auth/register",
        json={
            "email": "sneaky@t.dev",
            "password": PASSWORD,
            "display_name": "Sneaky",
            "gender": "M",
            "role": "admin",
            "is_banned": False,
        },
    )
    assert r.status_code == 201
    from app.db import SessionLocal
    from app.models import User
    db = SessionLocal()
    try:
        u = db.query(User).filter(User.email == "sneaky@t.dev").first()
        if u:
            u.is_verified = True
            db.commit()
    finally:
        db.close()
    login = client.post(
        f"{API}/auth/login", json={"email": "sneaky@t.dev", "password": PASSWORD}
    )
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    me = client.get(f"{API}/auth/me", headers=headers).json()
    assert me["role"] == "user"
    assert client.get(f"{API}/admin/metrics", headers=headers).status_code == 403

    # No route under /api/v1 (outside the admin-gated ones) writes user.role.
    from app.main import app as fastapi_app

    public_paths = [
        path
        for r in fastapi_app.routes
        if (path := getattr(r, "path", "")).startswith("/api/v1")
        and not path.startswith("/api/v1/admin")
    ]
    assert not any("role" in p for p in public_paths)


def test_admin_cannot_be_banned(client, auth):
    admin = make_admin_headers(client, auth)
    admin2 = make_admin_headers(client, auth, email="admin2@t.dev")
    admin2_id = client.get(f"{API}/auth/me", headers=admin2).json()["id"]
    r = client.post(f"{API}/admin/users/{admin2_id}/ban", headers=admin)
    assert r.status_code == 400


def test_metrics_shape(client, auth, contest, join):
    admin = make_admin_headers(client, auth)
    creator = auth(client, "creator@t.dev", "M")
    code = contest(client, creator)["join_code"]
    joiner = auth(client, "joiner@t.dev", "F")
    join(client, joiner, code, name="Joiner")

    m = client.get(f"{API}/admin/metrics", headers=admin).json()
    assert m["users_total"] == 3
    assert m["users_by_gender"] == {"M": 2, "F": 1}
    assert m["active_contests"] == 1
    assert m["contestants_by_gender"] == {"F": 1}
    assert m["ratings_total"] == 0
    assert m["open_reports"] == 0
