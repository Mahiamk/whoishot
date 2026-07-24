from tests.conftest import API


def test_general_leaderboard_combines_both_brackets(client, auth, contest, join):
    creator = auth(client, "creator@t.dev", "M")
    code = contest(client, creator)["join_code"]

    # One high-scoring man, one lower-scoring woman — both ranked, mixed.
    woman = auth(client, "woman@t.dev", "F")
    man = auth(client, "man@t.dev", "M")
    woman_id = join(client, woman, code, name="Alice", gender="F").json()["id"]
    man_id = join(client, man, code, name="Bob", gender="M").json()["id"]

    voters = [auth(client, f"voter{i}@t.dev", "M") for i in range(3)]
    for v in voters:
        client.put(
            f"{API}/contestants/{man_id}/ratings", json={"looks": 9}, headers=v
        )
        client.put(
            f"{API}/contestants/{woman_id}/ratings", json={"looks": 5}, headers=v
        )

    # Per-bracket views still work and are still separated.
    r = client.get(f"{API}/contests/{code}/leaderboard?gender=F", headers=creator)
    assert r.status_code == 200
    f_board = r.json()
    assert f_board["gender"] == "F"
    assert [e["contestant_id"] for e in f_board["podium"]] == [woman_id]

    r = client.get(f"{API}/contests/{code}/leaderboard?gender=M", headers=creator)
    m_board = r.json()
    assert m_board["gender"] == "M"
    assert [e["contestant_id"] for e in m_board["podium"]] == [man_id]

    # General (no gender) mixes both brackets, ranked purely by score.
    r = client.get(f"{API}/contests/{code}/leaderboard", headers=creator)
    assert r.status_code == 200
    general = r.json()
    assert general["gender"] is None
    podium_ids = [e["contestant_id"] for e in general["podium"]]
    assert podium_ids == [man_id, woman_id]  # Bob (9) ranks above Alice (5)
    assert general["podium"][0]["avg_score"] > general["podium"][1]["avg_score"]


def test_general_leaderboard_respects_podium_privacy(client, auth, contest, join):
    creator = auth(client, "creator@t.dev", "M")
    code = contest(client, creator)["join_code"]

    contestants = []
    for i in range(4):
        gender = "F" if i % 2 == 0 else "M"
        u = auth(client, f"c{i}@t.dev", gender)
        cid = join(client, u, code, name=f"Contestant{i}", gender=gender).json()["id"]
        contestants.append(cid)

    voters = [auth(client, f"voter{i}@t.dev", "M") for i in range(3)]
    for cid in contestants:
        for v in voters:
            client.put(
                f"{API}/contestants/{cid}/ratings", json={"looks": 5}, headers=v
            )

    r = client.get(f"{API}/contests/{code}/leaderboard", headers=creator)
    assert r.status_code == 200
    body = r.json()
    assert len(body["podium"]) == 3
    assert len(body["others"]) == 1
    # "others" carries no scores, only name/photo.
    assert set(body["others"][0].keys()) == {"contestant_id", "name", "photo_url"}


def test_general_leaderboard_includes_ends_at_and_status(client, auth, contest):
    creator = auth(client, "creator@t.dev", "M")
    code = contest(client, creator, duration_days=7)["join_code"]

    r = client.get(f"{API}/contests/{code}/leaderboard", headers=creator)
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "active"
    assert "ends_at" in body
