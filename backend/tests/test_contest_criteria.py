import pytest
from datetime import datetime, timezone
from app.constants import SEED_DEFAULT_CRITERIA
from app.db import SessionLocal
from app.models import Contest, ContestCriterion, Contestant, Gender, Rating, User
from app.security import hash_password
from tests.conftest import API, CONTEST_PASSWORD, PASSWORD


def test_contest_creation_default_criteria(client, auth):
    headers = auth(client, "creator_default@t.dev")

    res = client.post(
        f"{API}/contests",
        json={
            "title": "Default Criteria Contest",
            "allowed_email_domain": "t.dev",
            "join_password": CONTEST_PASSWORD,
            "duration_days": 7,
        },
        headers=headers,
    )
    assert res.status_code == 201, res.text
    data = res.json()
    assert "criteria" in data
    assert len(data["criteria"]) == 10
    keys = [c["key"] for c in data["criteria"]]
    expected_keys = [c["key"] for c in SEED_DEFAULT_CRITERIA]
    assert keys == expected_keys


def test_contest_creation_min_max_bounds(client, auth):
    headers = auth(client, "creator_bounds@t.dev")

    # Less than 3 criteria -> 422
    res_too_few = client.post(
        f"{API}/contests",
        json={
            "title": "Too Few Criteria Contest",
            "allowed_email_domain": "t.dev",
            "join_password": CONTEST_PASSWORD,
            "duration_days": 7,
            "criteria": [
                {"label": "One"},
                {"label": "Two"},
            ],
        },
        headers=headers,
    )
    assert res_too_few.status_code == 422

    # More than 15 criteria -> 422
    res_too_many = client.post(
        f"{API}/contests",
        json={
            "title": "Too Many Criteria Contest",
            "allowed_email_domain": "t.dev",
            "join_password": CONTEST_PASSWORD,
            "duration_days": 7,
            "criteria": [{"label": f"Crit {i}"} for i in range(16)],
        },
        headers=headers,
    )
    assert res_too_many.status_code == 422

    # Custom valid 4 criteria -> 201
    res_valid = client.post(
        f"{API}/contests",
        json={
            "title": "Custom 4 Criteria Contest",
            "allowed_email_domain": "t.dev",
            "join_password": CONTEST_PASSWORD,
            "duration_days": 7,
            "criteria": [
                {"label": "Coding", "emoji": "💻"},
                {"label": "Gaming", "emoji": "🎮"},
                {"label": "Design", "emoji": "🎨"},
                {"label": "Leadership", "emoji": "👑"},
            ],
        },
        headers=headers,
    )
    assert res_valid.status_code == 201, res_valid.text
    data = res_valid.json()
    assert len(data["criteria"]) == 4
    labels = [c["label"] for c in data["criteria"]]
    assert labels == ["Coding", "Gaming", "Design", "Leadership"]


def test_edit_criteria_pre_vote_and_lock_after_first_vote(client, auth, join):
    headers = auth(client, "creator_patch@t.dev")

    res = client.post(
        f"{API}/contests",
        json={
            "title": "Patch Contest",
            "allowed_email_domain": "t.dev",
            "join_password": CONTEST_PASSWORD,
            "duration_days": 7,
        },
        headers=headers,
    )
    contest_data = res.json()
    join_code = contest_data["join_code"]

    # Pre-first-vote edit -> 200 OK
    new_criteria = [
        {"label": "Vibes", "emoji": "✨"},
        {"label": "Charisma", "emoji": "🌟"},
        {"label": "Style", "emoji": "💅"},
    ]
    res_patch = client.patch(
        f"{API}/contests/{join_code}/criteria",
        json=new_criteria,
        headers=headers,
    )
    assert res_patch.status_code == 200, res_patch.text
    patched_data = res_patch.json()
    assert len(patched_data) == 3
    assert [c["label"] for c in patched_data] == ["Vibes", "Charisma", "Style"]

    # Add contestant & cast a vote
    voter_headers = auth(client, "voter_patch@t.dev")
    contestant_headers = auth(client, "contestant_patch@t.dev")

    res_join = join(client, contestant_headers, join_code, name="Alice", gender="F")
    contestant_id = res_join.json()["id"]

    # Cast vote
    res_vote = client.put(
        f"{API}/contestants/{contestant_id}/ratings",
        json={"vibes": 9, "charisma": 8, "style": 10},
        headers=voter_headers,
    )
    assert res_vote.status_code == 200, res_vote.text

    # Try editing criteria after first vote -> 403 Forbidden
    res_patch_after_vote = client.patch(
        f"{API}/contests/{join_code}/criteria",
        json=[
            {"label": "Vibes", "emoji": "✨"},
            {"label": "Charisma", "emoji": "🌟"},
            {"label": "Style", "emoji": "💅"},
            {"label": "New Criteria", "emoji": "🔥"},
        ],
        headers=headers,
    )
    assert res_patch_after_vote.status_code == 403
    assert "Criteria are locked once voting starts" in res_patch_after_vote.json()["detail"]


def test_backfill_preserves_ratings_meaning(client, auth, join):
    headers = auth(client, "creator_bf@t.dev")
    res = client.post(
        f"{API}/contests",
        json={
            "title": "Backfill Test Contest",
            "allowed_email_domain": "t.dev",
            "join_password": CONTEST_PASSWORD,
            "duration_days": 7,
        },
        headers=headers,
    )
    contest_id = res.json()["id"]
    join_code = res.json()["join_code"]

    voter_headers = auth(client, "voter_bf@t.dev")
    contestant_headers = auth(client, "contestant_bf@t.dev")

    res_join = join(client, contestant_headers, join_code, name="Bob", gender="M")
    contestant_id = res_join.json()["id"]

    res_vote = client.put(
        f"{API}/contestants/{contestant_id}/ratings",
        json={"looks": 9},
        headers=voter_headers,
    )
    assert res_vote.status_code == 200, res_vote.text

    db = SessionLocal()
    try:
        ratings = db.query(Rating).join(Contestant).filter(Contestant.id == contestant_id).all()
        assert len(ratings) == 1
        assert ratings[0].criterion.key == "looks"
        assert ratings[0].score == 9
    finally:
        db.close()
