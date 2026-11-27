"""Hosted demo: every visitor (X-Demo-Session) gets a separate copy of seed.db and their own photos folder."""
import pytest
from fastapi.testclient import TestClient

A, B = "a" * 20, "b" * 20


@pytest.fixture
def client(seed_db, tmp_path, monkeypatch):
    global db, main, tools
    import db, main, tools  # noqa: E401  (backend/ is put on sys.path by the seed_db fixture)
    monkeypatch.setattr(db, "SESSIONS_ENABLED", True)
    monkeypatch.setattr(db, "SESSIONS_DIR", tmp_path / "sessions")
    monkeypatch.setattr(db, "_ready_sessions", set())
    monkeypatch.setattr(tools, "UPLOADS_DIR", tmp_path / "uploads")
    monkeypatch.setattr(tools, "_ready_dbs", set())
    return TestClient(main.app)  # no `with`: the startup tasks are not needed


def _clock(client, sid):
    r = client.get("/api/state", headers={"X-Demo-Session": sid})
    assert r.status_code == 200
    return r.json()["state"]["now"][:10]  # the date: the clock itself ticks in real time


def test_each_visitor_has_own_database(client, tmp_path):
    before_b = _clock(client, B)
    assert client.post("/api/demo/skip-days", json={"days": 5}, headers={"X-Demo-Session": A}).status_code == 200
    after_a, after_b = _clock(client, A), _clock(client, B)
    assert after_a != before_b          # A's clock moved
    assert after_b == before_b          # B's did not
    assert (tmp_path / "sessions" / A / "simephony.db").exists()
    assert (tmp_path / "sessions" / B / "simephony.db").exists()


def test_reset_only_affects_own_session(client):
    client.post("/api/demo/skip-days", json={"days": 5}, headers={"X-Demo-Session": A})
    client.post("/api/demo/skip-days", json={"days": 9}, headers={"X-Demo-Session": B})
    b_before = _clock(client, B)
    client.post("/api/demo/reset", headers={"X-Demo-Session": A})
    assert _clock(client, B) == b_before


def test_bad_session_id_is_rejected(client):
    for bad in ("../../etc", "short", "x" * 65):
        assert client.get("/api/state", headers={"X-Demo-Session": bad}).status_code == 400


def test_cleanup_removes_idle_sessions(client, tmp_path, monkeypatch):
    _clock(client, A)
    monkeypatch.setattr(db, "SESSION_TTL_S", -1)
    db.cleanup_sessions()
    assert not (tmp_path / "sessions" / A).exists()


def test_write_rate_limit(client, monkeypatch):
    monkeypatch.setattr(main.DemoSession, "WRITES_PER_MINUTE", 3)
    monkeypatch.setattr(main.DemoSession, "_hits", {})
    codes = [client.post("/api/demo/skip-days", json={"days": 1}, headers={"X-Demo-Session": A}).status_code for _ in range(5)]
    assert codes[:3] == [200, 200, 200] and codes[3:] == [429, 429]


def test_health_checks_seed_without_shared_db(client, tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "missing" / "simephony.db")
    body = client.get("/health").json()
    assert body["checks"]["database"]["status"] == "ok"
    assert not (tmp_path / "missing").exists()
