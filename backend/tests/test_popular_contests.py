from tests.conftest import API


def test_popular_lists_only_public_active_ordered_by_activity(
    client, auth, contest, join
):
    creator = auth(client, "creator@t.dev", "M")

    quiet = contest(client, creator, title="Quiet Contest")
    busy = contest(client, creator, title="Busy Contest")
    private = contest(
        client, creator, title="Private Contest", is_showcase_public=False
    )

    # Give "busy" a contestant and some ratings so it outranks "quiet".
    star = auth(client, "star@t.dev", "F")
    star_id = join(client, star, busy["join_code"], name="Star").json()["id"]
    for i in range(2):
        voter = auth(client, f"voter{i}@t.dev", "M")
        client.put(
            f"{API}/contestants/{star_id}/ratings",
            json={"looks": 8},
            headers=voter,
        )

    r = client.get(f"{API}/contests/popular")
    assert r.status_code == 200
    items = r.json()
    codes = [i["join_code"] for i in items]

    assert private["join_code"] not in codes  # not showcase-public
    assert codes.index(busy["join_code"]) < codes.index(quiet["join_code"])

    busy_item = next(i for i in items if i["join_code"] == busy["join_code"])
    assert busy_item["contestant_count"] == 1
    assert busy_item["female_count"] == 1
    assert busy_item["rating_count"] == 2
    assert busy_item["status"] == "active"
    assert "ends_at" in busy_item
    assert busy_item["allowed_email_domain"] == "t.dev"
    # Aggregates only — nothing about individual contestants.
    assert "contestants" not in busy_item and "podium" not in busy_item


def test_popular_requires_no_auth_and_handles_empty(client):
    r = client.get(f"{API}/contests/popular")
    assert r.status_code == 200
    assert r.json() == []
