import json

from fastapi.testclient import TestClient

from .conftest import failure, full_run_events, gz, play, register


def test_health(client: TestClient) -> None:
    assert client.get("/health").json() == {"status": "ok"}
    assert client.get("/health/ready").json() == {"status": "ok"}


def test_full_run_is_saved_scored_and_ranked(client: TestClient) -> None:
    headers = register(client, "Alice")
    events = full_run_events(failures=[failure(5_000, "dural_opening", "vessel_nick", "rupture")])
    res = play(client, headers, events)

    assert res["status"] == "finished"
    assert res["summary"]["steps_completed"] == 6
    assert res["summary"]["ruptures"] == 1
    assert res["summary"]["blood_loss_ml"] == 500
    assert res["flagged"] is False
    assert res["rank"] == 1
    assert res["ml_skill"] is None
    assert sum(res["breakdown"].values()) == res["score"]

    d = client.get(f"/v1/sessions/{res['session_id']}/debrief", headers=headers)
    assert d.status_code == 200 and d.json()["score"] == res["score"]

    lb = client.get("/v1/leaderboard").json()
    assert [e["display_name"] for e in lb["entries"]] == ["Alice"]
    assert lb["entries"][0]["score"] == res["score"]
    assert lb["entries"][0]["run_id"] == res["session_id"]


def test_leaderboard_orders_filters_and_updates_after_cache(client: TestClient) -> None:
    a, b = register(client, "Alice"), register(client, "Bob")
    assert client.get("/v1/leaderboard").json()["entries"] == []
    play(client, a, full_run_events())
    play(client, b, full_run_events(failures=[failure(4_000, "dural_opening", "vessel_nick", "rupture")]))
    play(client, b, full_run_events(), mode="expert")
    lb = client.get("/v1/leaderboard").json()["entries"]
    assert [e["rank"] for e in lb] == [1, 2, 3]
    assert lb[0]["score"] >= lb[1]["score"] >= lb[2]["score"]
    only_expert = client.get("/v1/leaderboard", params={"mode": "expert"}).json()["entries"]
    assert len(only_expert) == 1 and only_expert[0]["mode"] == "expert"


def test_finish_is_idempotent_and_blocks_more_telemetry(client: TestClient) -> None:
    h = register(client)
    res = play(client, h, full_run_events())
    again = client.post(f"/v1/sessions/{res['session_id']}/finish", headers=h)
    assert again.json()["score"] == res["score"]
    body, hdr = gz({"offset": 100, "events": full_run_events()[:1]})
    r = client.post(f"/v1/sessions/{res['session_id']}/telemetry", content=body, headers={**h, **hdr})
    assert r.status_code == 409


def test_chunked_upload_and_plain_json(client: TestClient) -> None:
    h = register(client)
    sid = client.post("/v1/sessions", json={"mode": "guided"}, headers=h).json()["session_id"]
    events = full_run_events()
    half = len(events) // 2
    r1 = client.post(f"/v1/sessions/{sid}/telemetry", json={"offset": 0, "events": events[:half]}, headers=h)
    assert r1.json() == {"accepted": half, "next_offset": half}
    body, hdr = gz({"offset": half, "events": events[half:]})
    r2 = client.post(f"/v1/sessions/{sid}/telemetry", content=body, headers={**h, **hdr})
    assert r2.json()["next_offset"] == len(events)
    fin = client.post(f"/v1/sessions/{sid}/finish", headers=h).json()
    assert fin["summary"]["steps_completed"] == 6


def test_debrief_requires_finished(client: TestClient) -> None:
    h = register(client)
    sid = client.post("/v1/sessions", json={"mode": "guided"}, headers=h).json()["session_id"]
    assert client.get(f"/v1/sessions/{sid}/debrief", headers=h).status_code == 409


def test_empty_run_scores_zero(client: TestClient) -> None:
    h = register(client)
    sid = client.post("/v1/sessions", json={"mode": "guided"}, headers=h).json()["session_id"]
    fin = client.post(f"/v1/sessions/{sid}/finish", headers=h).json()
    assert fin["score"] == 0
    assert fin["summary"]["steps_completed"] == 0
    assert json.dumps(fin)
