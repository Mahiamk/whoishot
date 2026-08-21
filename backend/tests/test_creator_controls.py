import pytest
from fastapi.testclient import TestClient

from app.models import Contest, ContestStatus, Gender, User, UserRole


from tests.conftest import CONTEST_PASSWORD


def test_creator_can_pause_and_resume_contest(client: TestClient, auth, contest, join):
    creator_headers = auth(client, "pausecreator@t.dev")
    c = contest(client, creator_headers)
    join_code = c["join_code"]

    # Pause contest
    pause_res = client.patch(
        f"/api/v1/contests/{join_code}/pause",
        headers=creator_headers,
    )
    assert pause_res.status_code == 200
    assert pause_res.json()["is_paused"] is True

    # Register contestant user & attempt to join paused contest
    user_headers = auth(client, "joiner1@t.dev")
    join_res = join(client, user_headers, join_code, name="Joiner One", gender="M")
    assert join_res.status_code == 400
    assert "paused" in join_res.json()["detail"]

    # Resume contest
    resume_res = client.patch(
        f"/api/v1/contests/{join_code}/pause",
        headers=creator_headers,
    )
    assert resume_res.status_code == 200
    assert resume_res.json()["is_paused"] is False

    # Now join succeeds
    join_res2 = join(client, user_headers, join_code, name="Joiner One", gender="M")
    assert join_res2.status_code == 201


def test_creator_can_hide_and_unhide_contest(client: TestClient, auth, contest):
    creator_headers = auth(client, "hidecreator@t.dev")
    c = contest(client, creator_headers)
    join_code = c["join_code"]

    # Toggle hide
    hide_res = client.patch(
        f"/api/v1/contests/{join_code}/hide",
        headers=creator_headers,
    )
    assert hide_res.status_code == 200
    assert hide_res.json()["is_hidden"] is True

    # Popular contests endpoint excludes hidden contests
    popular_res = client.get("/api/v1/contests/popular")
    assert popular_res.status_code == 200
    popular_codes = [item["join_code"] for item in popular_res.json()]
    assert join_code not in popular_codes

    # Toggle unhide
    unhide_res = client.patch(
        f"/api/v1/contests/{join_code}/hide",
        headers=creator_headers,
    )
    assert unhide_res.status_code == 200
    assert unhide_res.json()["is_hidden"] is False


def test_creator_can_delete_and_persists_in_history(client: TestClient, auth, contest, join):
    creator_headers = auth(client, "delcreator@t.dev")
    c = contest(client, creator_headers)
    join_code = c["join_code"]

    # Join as contestant
    user_headers = auth(client, "contestant_hist@t.dev")
    join_res = join(client, user_headers, join_code, name="History Participant", gender="F")
    assert join_res.status_code == 201

    # Creator deletes the contest
    del_res = client.delete(
        f"/api/v1/contests/{join_code}",
        headers=creator_headers,
    )
    assert del_res.status_code == 200
    assert del_res.json()["ok"] is True

    # Contestant checks history: the deleted contest is still present with full details!
    hist_res = client.get("/api/v1/users/me/contestants", headers=user_headers)
    assert hist_res.status_code == 200
    hist_items = hist_res.json()
    matching = [h for h in hist_items if h["contest_join_code"] == join_code]
    assert len(matching) == 1
    assert matching[0]["is_deleted"] is True

    # Unauthorized users cannot delete or pause
    rand_headers = auth(client, "randomuser@t.dev")
    forbidden_del = client.delete(f"/api/v1/contests/{join_code}", headers=rand_headers)
    assert forbidden_del.status_code == 403
