import json
import sqlite3
from contextlib import contextmanager
from types import SimpleNamespace
from unittest.mock import Mock

from fastapi import FastAPI
from fastapi.testclient import TestClient


def _digest_database(monkeypatch, analytics):
    now = "2026-10-31T07:00:00.000Z"
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.executescript(
        """
        CREATE TABLE cases (
            case_id TEXT,
            category TEXT,
            urgency TEXT,
            status TEXT,
            created_at TEXT,
            closed_at TEXT
        );
        CREATE TABLE case_events (
            case_id TEXT,
            type TEXT,
            created_at TEXT
        );
        """
    )
    add_days = analytics.add_days
    conn.executemany(
        "INSERT INTO cases VALUES (?, ?, ?, ?, ?, ?)",
        [
            ("C-1", "water_leak", "high", "SUBMITTED", add_days(now, -1), None),
            ("C-2", "water_leak", "normal", "CLOSED", add_days(now, -6), add_days(now, -1)),
            ("C-3", "electrical", "high", "SUBMITTED", add_days(now, -2), None),
            ("C-4", "paint", "normal", "CLOSED", add_days(now, -20), add_days(now, -2)),
            ("C-5", "other", "high", "SUBMITTED", add_days(now, -10), None),
            ("C-6", "paint", "normal", "SUBMITTED", add_days(now, -3), None),
        ],
    )
    conn.executemany(
        "INSERT INTO case_events VALUES (?, ?, ?)",
        [
            ("C-1", "case.reopened", add_days(now, -1)),
            ("C-1", "case.reopened", add_days(now, -1)),
            ("C-4", "case.reopened", add_days(now, -2)),
            ("C-5", "case.reopened", add_days(now, -10)),
        ],
    )

    @contextmanager
    def get_conn():
        yield conn

    monkeypatch.setattr(analytics.db, "get_conn", get_conn)
    monkeypatch.setattr(analytics, "demo_now", lambda _conn: now)


def test_weekly_digest_computes_figures_before_calling_llm(monkeypatch):
    from agents.simephony import analytics

    _digest_database(monkeypatch, analytics)
    create = Mock(return_value=SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(content=(
            "Incoming reports center on plumbing and electrical concerns. "
            "Management should maintain clear case ownership.\n\n"
            "Review repair quality and continue prioritizing safety-related intake."
        )))]
    ))
    monkeypatch.setattr(analytics.client.chat.completions, "create", create)

    digest = analytics.generate_weekly_digest()

    assert digest.count("\n\n") == 2
    assert "Incoming reports center on plumbing and electrical concerns." in digest
    assert (
        "Computed figures for the past 7 days: 4 new cases; 2 cases closed; "
        "average days to close: 11.50 days; high-urgency cases: 2; "
        "top categories: water leak (2), electrical (1), paint (1); "
        "distinct cases reopened: 2; reopen rate: 100.0%."
    ) in digest
    create.assert_called_once()
    call = create.call_args.kwargs
    assert call["model"] == analytics.MODEL_TEXT
    stats = json.loads(call["messages"][1]["content"].split("\n", 1)[1])
    assert stats == {
        "period_days": 7,
        "total_new_cases": 4,
        "total_cases_closed": 2,
        "average_days_to_close": 11.5,
        "high_urgency_cases": 2,
        "top_categories": [
            {"category": "water_leak", "count": 2},
            {"category": "electrical", "count": 1},
            {"category": "paint", "count": 1},
        ],
        "reopened_cases": 2,
        "reopen_rate_percent": 100.0,
        "reopen_rate_definition": (
            "distinct cases reopened during the period divided by cases closed during the period"
        ),
    }
    assert "Do not include any digits" in call["messages"][0]["content"]


def test_weekly_digest_discards_model_invented_rates(monkeypatch):
    from agents.simephony import analytics

    _digest_database(monkeypatch, analytics)
    monkeypatch.setattr(
        analytics.client.chat.completions,
        "create",
        Mock(return_value=SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(
            content=(
                "The team received four new cases and closed zero cases. "
                "The average close time is unavailable.\n\n"
                "The reopen rate is zero percent, with no reopened cases."
            )
        ))])),
    )

    digest = analytics.generate_weekly_digest()

    assert digest.count("\n\n") == 2
    assert "zero cases" not in digest.lower()
    assert "zero percent" not in digest.lower()
    assert "4 new cases; 2 cases closed" in digest
    assert "reopen rate: 100.0%" in digest


def test_weekly_digest_reports_rate_unavailable_when_nothing_closed(monkeypatch):
    from agents.simephony import analytics

    monkeypatch.setattr(analytics, "_weekly_digest_stats", lambda _days: {
        "period_days": 7,
        "total_new_cases": 4,
        "total_cases_closed": 0,
        "average_days_to_close": None,
        "high_urgency_cases": 0,
        "top_categories": [{"category": "water_leak", "count": 3}],
        "reopened_cases": 0,
        "reopen_rate_percent": None,
    })
    monkeypatch.setattr(
        analytics.client.chat.completions,
        "create",
        Mock(return_value=SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(
            content=(
                "The team received four new cases and closed zero cases. "
                "The average close time is unavailable.\n\n"
                "The reopen rate is zero percent, with no reopened cases."
            )
        ))])),
    )

    digest = analytics.generate_weekly_digest()

    assert "average days to close: unavailable" in digest
    assert "reopen rate: unavailable" in digest
    assert "0%" not in digest
    assert "zero percent" not in digest.lower()


def test_weekly_digest_endpoint_returns_digest(monkeypatch):
    from demo_api import routes

    monkeypatch.setattr(routes, "generate_weekly_digest", lambda: "Management digest.")
    app = FastAPI()
    app.include_router(routes.router)

    response = TestClient(app).get("/api/analytics/weekly-digest")

    assert response.status_code == 200
    assert response.json() == {"digest": "Management digest."}
