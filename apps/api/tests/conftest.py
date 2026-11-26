import gzip
import json
from collections.abc import Callable

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.scoring import STEPS

CreateClient = Callable[..., TestClient]


@pytest.fixture
def make_client(tmp_path) -> CreateClient:
    def make(**overrides) -> TestClient:
        defaults = {
            "database_url": f"sqlite+pysqlite:///{tmp_path / 'test.db'}",
            "auto_create_tables": True,
            "rate_limit_per_minute": 10_000,
            "rate_limit_players_per_hour": 10_000,
            "rate_limit_mentor_per_minute": 10_000,
            "anthropic_api_key": "",
        }
        settings = Settings(_env_file=None, **{**defaults, **overrides})
        return TestClient(create_app(settings))

    return make


@pytest.fixture
def client(make_client: CreateClient) -> TestClient:
    return make_client()


def full_run_events(step_ms: int = 30_000, vol_floor: float = 0.9, failures: list[dict] | None = None) -> list[dict]:
    events: list[dict] = []
    t = 0
    for step in STEPS:
        events.append({"t": t, "step": step, "tool": None, "kind": "step_enter", "data": None})
        for k in range(1, 4):
            vol = 1 - (1 - vol_floor) * k / 3
            events.append(
                {"t": t + k * step_ms // 4, "step": step, "tool": None, "kind": "vitals",
                 "data": {"hr": 75, "sbp": 115, "dbp": 70, "spo2": 99, "icp": 11, "vol": vol}}
            )
        t += step_ms
        events.append({"t": t, "step": step, "tool": None, "kind": "step_exit", "data": None})
    for f in failures or []:
        events.append(f)
    events.sort(key=lambda e: e["t"])
    return events


def failure(t: int, step: str, code: str, severity: str, tool: str = "suction") -> dict:
    return {"t": t, "step": step, "tool": tool, "kind": "failure",
            "data": {"code": code, "severity": severity}}


def gz(payload: dict) -> tuple[bytes, dict[str, str]]:
    return gzip.compress(json.dumps(payload).encode()), {
        "Content-Encoding": "gzip",
        "Content-Type": "application/json",
    }


def register(client: TestClient, name: str = "Dr Test") -> dict[str, str]:
    r = client.post("/v1/players", json={"display_name": name})
    assert r.status_code == 201, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def play(client: TestClient, headers: dict[str, str], events: list[dict], mode: str = "guided") -> dict:
    sid = client.post("/v1/sessions", json={"mode": mode, "seed": 3}, headers=headers).json()["session_id"]
    body, h = gz({"offset": 0, "events": events})
    r = client.post(f"/v1/sessions/{sid}/telemetry", content=body, headers={**headers, **h})
    assert r.status_code == 200, r.text
    fin = client.post(f"/v1/sessions/{sid}/finish", headers=headers)
    assert fin.status_code == 200, fin.text
    return {"session_id": sid, **fin.json()}
