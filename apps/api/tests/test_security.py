import gzip
import zlib

from fastapi.testclient import TestClient

from .conftest import CreateClient, full_run_events, gz, play, register


def new_session(client: TestClient, headers: dict[str, str]) -> str:
    return client.post("/v1/sessions", json={"mode": "guided"}, headers=headers).json()["session_id"]


def test_requires_valid_bearer_token(client: TestClient) -> None:
    assert client.post("/v1/sessions", json={"mode": "guided"}).status_code == 401
    bad = {"Authorization": "Bearer nope"}
    assert client.post("/v1/sessions", json={"mode": "guided"}, headers=bad).status_code == 401
    assert client.post("/v1/sessions", json={"mode": "guided"}, headers={"Authorization": "Basic abc"}).status_code == 401


def test_players_cannot_touch_each_others_runs(client: TestClient) -> None:
    a, b = register(client, "A"), register(client, "B")
    sid = new_session(client, a)
    ev = full_run_events()[:2]
    assert client.post(f"/v1/sessions/{sid}/telemetry", json={"offset": 0, "events": ev}, headers=b).status_code == 404
    assert client.post(f"/v1/sessions/{sid}/finish", headers=b).status_code == 404
    assert client.get(f"/v1/sessions/{sid}/debrief", headers=b).status_code == 404


def test_client_cannot_submit_a_score(client: TestClient) -> None:
    h = register(client)
    sid = new_session(client, h)
    bad = {"offset": 0, "events": full_run_events()[:1], "score": 1000}
    assert client.post(f"/v1/sessions/{sid}/telemetry", json=bad, headers=h).status_code == 422
    ev = full_run_events()[:1]
    ev[0]["score"] = 1000
    assert client.post(f"/v1/sessions/{sid}/telemetry", json={"offset": 0, "events": ev}, headers=h).status_code == 422
    res = client.post("/v1/sessions", json={"mode": "guided", "score": 1000}, headers=h)
    assert res.status_code == 201
    fin = client.post(f"/v1/sessions/{res.json()['session_id']}/finish", headers=h).json()
    assert fin["score"] == 0


def test_offset_order_and_validation(client: TestClient) -> None:
    h = register(client)
    sid = new_session(client, h)
    ev = full_run_events()
    url = f"/v1/sessions/{sid}/telemetry"
    assert client.post(url, json={"offset": 5, "events": ev[:2]}, headers=h).status_code == 409
    assert client.post(url, json={"offset": 0, "events": [ev[3], ev[0]]}, headers=h).status_code == 422
    assert client.post(url, json={"offset": 0, "events": []}, headers=h).status_code == 422
    bad_step = [{**ev[0], "step": "nope"}]
    assert client.post(url, json={"offset": 0, "events": bad_step}, headers=h).status_code == 422
    bad_t = [{**ev[0], "t": -5}]
    assert client.post(url, json={"offset": 0, "events": bad_t}, headers=h).status_code == 422
    ok = client.post(url, json={"offset": 0, "events": ev[:4]}, headers=h)
    assert ok.status_code == 200
    earlier = [{**ev[0], "t": 0}]
    assert client.post(url, json={"offset": 4, "events": earlier}, headers=h).status_code == 422


def test_body_limits_and_gzip_bomb(make_client: CreateClient) -> None:
    client = make_client(max_body_bytes=2_000)
    h = register(client)
    sid = new_session(client, h)
    url = f"/v1/sessions/{sid}/telemetry"
    big = {"offset": 0, "events": full_run_events()}
    assert client.post(url, json=big, headers=h).status_code == 413
    bomb = gzip.compress(b"[" + b"0," * 5_000_000 + b"0]")
    r = client.post(url, content=bomb, headers={**h, "Content-Encoding": "gzip", "Content-Type": "application/json"})
    assert r.status_code == 413
    garbage = client.post(url, content=b"not gzip", headers={**h, "Content-Encoding": "gzip"})
    assert garbage.status_code == 400
    assert zlib.crc32(b"") == 0


def test_event_count_cap(make_client: CreateClient) -> None:
    client = make_client(max_telemetry_events=10)
    h = register(client)
    sid = new_session(client, h)
    body, hdr = gz({"offset": 0, "events": full_run_events()})
    assert client.post(f"/v1/sessions/{sid}/telemetry", content=body, headers={**h, **hdr}).status_code == 413


def test_flagged_runs_do_not_reach_the_leaderboard(client: TestClient) -> None:
    h = register(client, "Cheater")
    res = play(client, h, full_run_events(step_ms=1000))
    assert res["flagged"] is True and res["rank"] is None
    assert client.get("/v1/leaderboard").json()["entries"] == []


def test_invalid_display_name_and_mode(client: TestClient) -> None:
    assert client.post("/v1/players", json={"display_name": "<script>"}).status_code == 422
    assert client.post("/v1/players", json={"display_name": ""}).status_code == 422
    h = register(client)
    assert client.post("/v1/sessions", json={"mode": "godmode"}, headers=h).status_code == 422
