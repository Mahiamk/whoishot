from tests.conftest import API


def test_self_rating_rejected(client, auth, contest, join):
    creator = auth(client, "creator@t.dev", "M")
    code = contest(client, creator)["join_code"]
    me = auth(client, "selfrater@t.dev", "F")
    contestant_id = join(client, me, code, name="Self Rater").json()["id"]

    r = client.put(
        f"{API}/contestants/{contestant_id}/ratings",
        json={"looks": 10},
        headers=me,
    )
    assert r.status_code == 403
    assert "yourself" in r.json()["detail"]


def test_duplicate_contestant_rejected(client, auth, contest, join):
    creator = auth(client, "creator@t.dev", "M")
    code = contest(client, creator)["join_code"]
    me = auth(client, "joiner@t.dev", "F")

    assert join(client, me, code).status_code == 201
    r = join(client, me, code)
    assert r.status_code == 409


def test_rating_upsert(client, auth, contest, join):
    creator = auth(client, "creator@t.dev", "M")
    code = contest(client, creator)["join_code"]
    target = auth(client, "target@t.dev", "F")
    contestant_id = join(client, target, code, name="Target").json()["id"]
    voter = auth(client, "voter@t.dev", "M")

    r = client.put(
        f"{API}/contestants/{contestant_id}/ratings",
        json={"looks": 5, "vibe": 6},
        headers=voter,
    )
    assert r.status_code == 200
    assert r.json() == {"looks": 5, "vibe": 6}

    # Re-submitting updates in place — no duplicate rows, no error.
    r = client.put(
        f"{API}/contestants/{contestant_id}/ratings",
        json={"looks": 9},
        headers=voter,
    )
    assert r.status_code == 200
    assert r.json() == {"looks": 9, "vibe": 6}

    profile = client.get(
        f"{API}/contestants/{contestant_id}", headers=voter
    ).json()
    assert profile["my_ratings"] == {"looks": 9, "vibe": 6}
    assert profile["vote_count"] == 1


def test_leaderboard_min_three_votes(client, auth, contest, join):
    creator = auth(client, "creator@t.dev", "M")
    code = contest(client, creator)["join_code"]
    target = auth(client, "target@t.dev", "F")
    contestant_id = join(client, target, code, name="Target").json()["id"]

    def board():
        r = client.get(
            f"{API}/contests/{code}/leaderboard?gender=F", headers=creator
        )
        assert r.status_code == 200, r.text
        return r.json()

    for i in range(2):
        voter = auth(client, f"voter{i}@t.dev", "M")
        client.put(
            f"{API}/contestants/{contestant_id}/ratings",
            json={"looks": 8},
            headers=voter,
        )
    b = board()
    assert b["podium"] == []
    assert [o["contestant_id"] for o in b["others"]] == [contestant_id]

    third = auth(client, "voter2@t.dev", "M")
    client.put(
        f"{API}/contestants/{contestant_id}/ratings",
        json={"looks": 8},
        headers=third,
    )
    b = board()
    assert len(b["podium"]) == 1
    assert b["podium"][0]["contestant_id"] == contestant_id
    assert b["podium"][0]["avg_score"] == 8.0
    assert b["others"] == []


def test_report_auto_hide(client, auth, contest, join):
    creator = auth(client, "creator@t.dev", "M")
    code = contest(client, creator)["join_code"]
    target = auth(client, "target@t.dev", "F")
    contestant_id = join(client, target, code, name="Target").json()["id"]
    viewer = auth(client, "viewer@t.dev", "M")

    # Reports are anonymous: no auth header.
    for i in range(2):
        r = client.post(
            f"{API}/contestants/{contestant_id}/reports",
            json={"reason": f"report {i}"},
        )
        assert r.status_code == 201

    # Two open reports: still visible.
    assert (
        client.get(f"{API}/contestants/{contestant_id}", headers=viewer).status_code
        == 200
    )

    r = client.post(
        f"{API}/contestants/{contestant_id}/reports", json={"reason": "report 3"}
    )
    assert r.status_code == 201

    # Third open report auto-hides: profile 404s and every list excludes them.
    assert (
        client.get(f"{API}/contestants/{contestant_id}", headers=viewer).status_code
        == 404
    )
    listing = client.get(
        f"{API}/contests/{code}/contestants", headers=viewer
    ).json()
    assert contestant_id not in [c["id"] for c in listing]
    board = client.get(
        f"{API}/contests/{code}/leaderboard?gender=F", headers=viewer
    ).json()
    assert contestant_id not in [e["contestant_id"] for e in board["podium"]]
    assert contestant_id not in [o["contestant_id"] for o in board["others"]]
    showcase = client.get(f"{API}/contests/{code}/showcase").json()
    assert "Target" not in [e["name"] for e in showcase["F"]]

    # Ratings against a hidden contestant are rejected too.
    assert (
        client.put(
            f"{API}/contestants/{contestant_id}/ratings",
            json={"looks": 5},
            headers=viewer,
        ).status_code
        == 404
    )


def test_soft_delete_hides_everywhere(client, auth, contest, join):
    creator = auth(client, "creator@t.dev", "M")
    code = contest(client, creator)["join_code"]
    me = auth(client, "leaver@t.dev", "F")
    contestant_id = join(client, me, code, name="Leaver").json()["id"]
    viewer = auth(client, "viewer@t.dev", "M")

    # Only the owner may delete.
    assert (
        client.delete(f"{API}/contestants/{contestant_id}", headers=viewer).status_code
        == 403
    )
    assert (
        client.delete(f"{API}/contestants/{contestant_id}", headers=me).status_code
        == 204
    )

    assert (
        client.get(f"{API}/contestants/{contestant_id}", headers=viewer).status_code
        == 404
    )
    listing = client.get(f"{API}/contests/{code}/contestants", headers=viewer).json()
    assert listing == []
    # The owner can still see their own (removed) profile.
    r = client.get(f"{API}/contestants/{contestant_id}", headers=me)
    assert r.status_code == 200
    assert r.json()["status"] == "removed"


def test_rating_rate_limit(client, auth, contest, join):
    creator = auth(client, "creator@t.dev", "M")
    code = contest(client, creator)["join_code"]
    target = auth(client, "target@t.dev", "F")
    contestant_id = join(client, target, code, name="Target").json()["id"]
    voter = auth(client, "spammer@t.dev", "M")

    for i in range(30):
        r = client.put(
            f"{API}/contestants/{contestant_id}/ratings",
            json={"looks": (i % 10) + 1},
            headers=voter,
        )
        assert r.status_code == 200, f"request {i + 1}: {r.text}"

    r = client.put(
        f"{API}/contestants/{contestant_id}/ratings",
        json={"looks": 5},
        headers=voter,
    )
    assert r.status_code == 429
