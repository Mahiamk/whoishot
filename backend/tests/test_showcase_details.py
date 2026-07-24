from tests.conftest import API


def test_showcase_includes_details_and_countdown_fields(client, auth, contest, join):
    creator = auth(client, "creator@t.dev", "M")
    code = contest(
        client,
        creator,
        title="Sunway Search Test",
        description="The friendliest contest on campus",
        duration_days=7,
    )["join_code"]

    woman = auth(client, "woman@t.dev", "F")
    man = auth(client, "man@t.dev", "M")
    join(client, woman, code, name="Alice", gender="F")
    join(client, man, code, name="Bob", gender="M")

    r = client.get(f"{API}/contests/{code}/showcase")
    assert r.status_code == 200
    body = r.json()
    assert body["title"] == "Sunway Search Test"
    assert body["description"] == "The friendliest contest on campus"
    assert body["contestant_count"] == 2
    assert body["female_count"] == 1
    assert body["male_count"] == 1
    assert body["status"] == "active"
    assert "ends_at" in body

    # The added aggregate fields must not leak per-contestant data: real
    # entries still carry no name/photo.
    for bracket in ("F", "M"):
        for entry in body[bracket]:
            if not entry["is_demo"]:
                assert entry["name"] is None
                assert entry["photo_url"] is None
