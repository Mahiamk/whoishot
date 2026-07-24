from datetime import datetime, timedelta, timezone

from app.db import SessionLocal
from app.models import Contest, ContestStatus
from tests.conftest import API


def _parse(iso_str: str) -> datetime:
    dt = datetime.fromisoformat(iso_str)
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)


def _force_past_deadline(join_code: str) -> None:
    """Simulate an active contest whose ends_at has already passed, without
    going through ContestCreate's validation (which forbids past dates)."""
    db = SessionLocal()
    try:
        contest = db.query(Contest).filter(Contest.join_code == join_code).first()
        contest.ends_at = datetime.now(timezone.utc) - timedelta(days=1)
        contest.status = ContestStatus.active
        db.commit()
    finally:
        db.close()


def test_create_contest_requires_duration_or_ends_at(client, auth):
    creator = auth(client, "creator@t.dev", "M")
    r = client.post(
        f"{API}/contests",
        json={"title": "No duration given"},
        headers=creator,
    )
    assert r.status_code == 422

    r = client.post(
        f"{API}/contests",
        json={"title": "Bad duration", "duration_days": 5},
        headers=creator,
    )
    assert r.status_code == 422


def test_create_contest_computes_ends_at(client, auth):
    creator = auth(client, "creator@t.dev", "M")
    r = client.post(
        f"{API}/contests",
        json={
            "title": "Week Contest",
            "duration_days": 7,
            "allowed_email_domain": "t.dev",
            "join_password": "letmein",
        },
        headers=creator,
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["status"] == "active"
    ends_at = _parse(body["ends_at"])
    expected = datetime.now(timezone.utc) + timedelta(days=7)
    assert abs((ends_at - expected).total_seconds()) < 60


def test_expired_join_403(client, auth, contest, join):
    creator = auth(client, "creator@t.dev", "M")
    code = contest(client, creator)["join_code"]
    _force_past_deadline(code)

    joiner = auth(client, "joiner@t.dev", "F")
    r = join(client, joiner, code, name="Too Late")
    assert r.status_code == 403
    assert "ended" in r.json()["detail"].lower()

    # The flip is visible on subsequent reads too.
    r = client.get(f"{API}/contests/{code}", headers=creator)
    assert r.status_code == 200
    assert r.json()["status"] == "ended"


def test_rating_after_end_403(client, auth, contest, join):
    creator = auth(client, "creator@t.dev", "M")
    code = contest(client, creator)["join_code"]
    target = auth(client, "target@t.dev", "F")
    contestant_id = join(client, target, code, name="Target").json()["id"]
    voter = auth(client, "voter@t.dev", "M")

    # Rate once while active — must succeed.
    r = client.put(
        f"{API}/contestants/{contestant_id}/ratings",
        json={"looks": 7},
        headers=voter,
    )
    assert r.status_code == 200

    _force_past_deadline(code)

    r = client.put(
        f"{API}/contestants/{contestant_id}/ratings",
        json={"looks": 9},
        headers=voter,
    )
    assert r.status_code == 403
    assert "ended" in r.json()["detail"].lower()


def test_extend_contest_once(client, auth, contest):
    creator = auth(client, "creator@t.dev", "M")
    created = contest(client, creator, duration_days=3)
    before = _parse(created["ends_at"])

    r = client.post(
        f"{API}/contests/{created['id']}/extend",
        json={"additional_days": 10},
        headers=creator,
    )
    assert r.status_code == 200, r.text
    after = _parse(r.json()["ends_at"])
    assert abs((after - before).total_seconds() - 10 * 86400) < 60


def test_extend_twice_rejected(client, auth, contest):
    creator = auth(client, "creator@t.dev", "M")
    created = contest(client, creator, duration_days=3)

    r = client.post(
        f"{API}/contests/{created['id']}/extend",
        json={"additional_days": 5},
        headers=creator,
    )
    assert r.status_code == 200, r.text

    r = client.post(
        f"{API}/contests/{created['id']}/extend",
        json={"additional_days": 5},
        headers=creator,
    )
    assert r.status_code == 409


def test_extend_requires_creator(client, auth, contest):
    creator = auth(client, "creator@t.dev", "M")
    created = contest(client, creator, duration_days=3)
    stranger = auth(client, "stranger@t.dev", "F")

    r = client.post(
        f"{API}/contests/{created['id']}/extend",
        json={"additional_days": 5},
        headers=stranger,
    )
    assert r.status_code == 403


def test_extend_rejects_over_30_days(client, auth, contest):
    creator = auth(client, "creator@t.dev", "M")
    created = contest(client, creator, duration_days=3)

    r = client.post(
        f"{API}/contests/{created['id']}/extend",
        json={"additional_days": 31},
        headers=creator,
    )
    assert r.status_code == 422


def test_extend_ended_contest_rejected(client, auth, contest):
    creator = auth(client, "creator@t.dev", "M")
    created = contest(client, creator, duration_days=3)
    _force_past_deadline(created["join_code"])

    r = client.post(
        f"{API}/contests/{created['id']}/extend",
        json={"additional_days": 5},
        headers=creator,
    )
    assert r.status_code == 400


def test_reports_and_self_delete_still_work_after_end(client, auth, contest, join):
    creator = auth(client, "creator@t.dev", "M")
    code = contest(client, creator)["join_code"]
    target = auth(client, "target@t.dev", "F")
    contestant_id = join(client, target, code, name="Target").json()["id"]
    _force_past_deadline(code)

    # Reporting still works — safety never expires.
    r = client.post(
        f"{API}/contestants/{contestant_id}/reports",
        json={"reason": "still reportable"},
    )
    assert r.status_code == 201

    # Self-delete still works.
    r = client.delete(f"{API}/contestants/{contestant_id}", headers=target)
    assert r.status_code == 204


def test_showcase_and_leaderboard_include_ends_at_and_status(client, auth, contest):
    creator = auth(client, "creator@t.dev", "M")
    created = contest(client, creator, duration_days=7)
    code = created["join_code"]

    r = client.get(f"{API}/contests/{code}/showcase")
    assert r.status_code == 200
    assert "ends_at" in r.json() and r.json()["status"] == "active"

    r = client.get(f"{API}/contests/{code}/leaderboard?gender=F", headers=creator)
    assert r.status_code == 200
    assert "ends_at" in r.json() and r.json()["status"] == "active"
