import json
from io import StringIO
from pathlib import Path

from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect

from app import mentor
from app.cache import MemoryCache, RedisCache

from .conftest import CreateClient, full_run_events, play, register

API_DIR = Path(__file__).resolve().parent.parent


def parse_sse(text: str) -> list[tuple[str, dict]]:
    out = []
    for block in text.strip().split("\n\n"):
        lines = dict(line.split(": ", 1) for line in block.splitlines())
        out.append((lines["event"], json.loads(lines["data"])))
    return out


def test_mentor_scripted_stream(client: TestClient) -> None:
    r = client.post("/v1/mentor/ask", json={"question": "What if it ruptures?", "step": "clip_placement"})
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/event-stream")
    events = parse_sse(r.text)
    assert events[-1] == ("done", {"source": "scripted"})
    text = "".join(d["text"] for e, d in events if e == "delta")
    assert "suction" in text.lower() and "bipolar" in text.lower()
    assert "not medical advice" in text


def test_mentor_falls_back_to_step_tip(client: TestClient) -> None:
    r = client.post("/v1/mentor/ask", json={"question": "hello?", "step": "dural_opening"})
    text = "".join(d["text"] for e, d in parse_sse(r.text) if e == "delta")
    assert "dura" in text.lower()


def test_mentor_validates_input(client: TestClient) -> None:
    assert client.post("/v1/mentor/ask", json={"question": ""}).status_code == 422
    assert client.post("/v1/mentor/ask", json={"question": "x" * 501}).status_code == 422
    assert client.post("/v1/mentor/ask", json={"question": "hi", "step": "bogus"}).status_code == 422


def test_mentor_uses_llm_when_configured_and_falls_back_on_error(make_client: CreateClient, monkeypatch) -> None:
    client = make_client(anthropic_api_key="test-key")
    monkeypatch.setattr(mentor, "llm_stream", lambda *_a: iter(["Use ", "fine mode."]))
    ev = parse_sse(client.post("/v1/mentor/ask", json={"question": "tip?"}).text)
    assert ev[-1] == ("done", {"source": "llm"})
    assert "".join(d["text"] for e, d in ev if e == "delta") == "Use fine mode."

    def boom(*_a):
        raise RuntimeError("network")
        yield

    monkeypatch.setattr(mentor, "llm_stream", boom)
    ev = parse_sse(client.post("/v1/mentor/ask", json={"question": "rupture?"}).text)
    assert ev[-1] == ("done", {"source": "scripted"})


def test_rate_limits(make_client: CreateClient) -> None:
    client = make_client(rate_limit_players_per_hour=2, rate_limit_mentor_per_minute=2)
    assert client.post("/v1/players", json={"display_name": "a"}).status_code == 201
    assert client.post("/v1/players", json={"display_name": "b"}).status_code == 201
    r = client.post("/v1/players", json={"display_name": "c"})
    assert r.status_code == 429 and "retry-after" in r.headers
    for _ in range(2):
        assert client.post("/v1/mentor/ask", json={"question": "hi"}).status_code == 200
    assert client.post("/v1/mentor/ask", json={"question": "hi"}).status_code == 429


def test_general_rate_limit_is_per_player(make_client: CreateClient) -> None:
    client = make_client(rate_limit_per_minute=3)
    a, b = register(client, "A"), register(client, "B")
    for _ in range(3):
        assert client.post("/v1/sessions", json={"mode": "guided"}, headers=a).status_code == 201
    assert client.post("/v1/sessions", json={"mode": "guided"}, headers=a).status_code == 429
    assert client.post("/v1/sessions", json={"mode": "guided"}, headers=b).status_code == 201


def test_leaderboard_is_cached_until_a_run_finishes(client: TestClient) -> None:
    h = register(client, "A")
    play(client, h, full_run_events())
    first = client.get("/v1/leaderboard").json()
    assert len(first["entries"]) == 1
    assert client.app.state.cache.get("lb:all:10") is not None
    play(client, h, full_run_events(failures=[]))
    assert client.app.state.cache.get("lb:all:10") is None
    assert len(client.get("/v1/leaderboard").json()["entries"]) == 2


def test_memory_cache_ttl_and_counters() -> None:
    c = MemoryCache()
    c.set("a", {"x": 1}, 60)
    assert c.get("a") == {"x": 1}
    c.set("lb:1", 1, 60)
    c.delete_prefix("lb:")
    assert c.get("lb:1") is None and c.get("a") == {"x": 1}
    assert [c.incr("n", 60) for _ in range(3)] == [1, 2, 3]
    c.set("old", 1, -1)
    assert c.get("old") is None


def test_redis_cache_degrades_when_unreachable() -> None:
    c = RedisCache("redis://127.0.0.1:1/0")
    assert c.get("k") is None
    c.set("k", 1, 5)
    c.delete_prefix("k")
    assert c.incr("k", 5) == 0


def alembic_cfg(url: str) -> Config:
    cfg = Config(str(API_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(API_DIR / "migrations"))
    cfg.set_main_option("sqlalchemy.url", url)
    return cfg


def test_migrations_apply_and_revert_on_sqlite(tmp_path) -> None:
    url = f"sqlite+pysqlite:///{tmp_path / 'mig.db'}"
    cfg = alembic_cfg(url)
    command.upgrade(cfg, "head")
    tables = set(inspect(create_engine(url)).get_table_names())
    assert {"players", "runs", "telemetry_chunks", "alembic_version"} <= tables
    command.downgrade(cfg, "base")
    assert "runs" not in set(inspect(create_engine(url)).get_table_names())


def test_postgres_migration_enables_row_level_security() -> None:
    cfg = alembic_cfg("postgresql+psycopg://u:p@localhost/db")
    cfg.output_buffer = StringIO()
    command.upgrade(cfg, "head", sql=True)
    sql = cfg.output_buffer.getvalue()
    for needle in (
        "ALTER TABLE runs ENABLE ROW LEVEL SECURITY",
        "ALTER TABLE runs FORCE ROW LEVEL SECURITY",
        "CREATE POLICY runs_owner",
        "CREATE POLICY runs_public_read",
        "ALTER TABLE telemetry_chunks ENABLE ROW LEVEL SECURITY",
        "CREATE POLICY telemetry_owner",
        "current_setting('app.player_id', true)",
    ):
        assert needle in sql, needle
