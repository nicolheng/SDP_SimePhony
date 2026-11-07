import json
from datetime import timedelta

import pytest

pytestmark = pytest.mark.usefixtures("seed_db")


def test_ics_defaults_to_one_hour_and_escapes_text():
    from calendar_utils import generate_ics

    content = generate_ics(
        "C-TEST",
        "SDP Inspection Visit - Case C-TEST",
        "2026-01-02T03:04:05Z",
        description="First, line; second\nline",
    )
    assert "DTSTART:20260102T030405Z\r\n" in content
    assert "DTEND:20260102T040405Z\r\n" in content
    assert r"DESCRIPTION:First\, line\; second\nline" in content


def _schedule(case_id="C-0009", *, hours=12, kind="visit"):
    import db
    import tools
    from demo_api.timeutil import norm, parse

    tools.get_clock()
    with db.get_conn() as conn:
        case = conn.execute("SELECT * FROM cases WHERE case_id = ?", (case_id,)).fetchone()
        assert case is not None
        start = norm((parse(tools._now(conn)) + timedelta(hours=hours)).isoformat())
        end = norm((parse(start) + timedelta(hours=1)).isoformat())
        status = "REPAIR_BOOKED" if kind == "repair" else "VISIT_SCHEDULED"
        conn.execute(
            "UPDATE cases SET status = ?, technician_id = 'T-01', booking_status = 'PENDING' WHERE case_id = ?",
            (status, case_id),
        )
        conn.execute(
            """INSERT INTO slots (slot_id, technician_id, start_at, end_at, case_id, kind)
               VALUES (?, 'T-01', ?, ?, ?, ?)""",
            (f"CAL-{case_id}-{kind}", start, end, case_id, kind),
        )
    return start, end


def test_calendar_endpoint_downloads_current_booking():
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from calendar_utils import _utc_stamp
    from demo_api.routes import router

    start, end = _schedule()
    app = FastAPI()
    app.include_router(router)
    response = TestClient(app).get("/api/calendar/C-0009.ics")

    assert response.status_code == 200
    assert response.headers["content-type"] == "text/calendar; charset=utf-8"
    assert response.headers["content-disposition"] == 'attachment; filename="C-0009.ics"'
    assert "SUMMARY:SDP Inspection Visit - Case C-0009\r\n" in response.text
    assert f"DTSTART:{_utc_stamp(start)}" in response.text
    assert f"DTEND:{_utc_stamp(end)}" in response.text


def test_booking_emails_include_calendar_link_but_in_app_message_does_not(monkeypatch):
    import db
    import tools

    monkeypatch.setattr(tools, "_smtp_send", lambda *a, **kw: None)
    _schedule()
    monkeypatch.setenv("API_BASE_URL", "https://demo.example.test/")
    tools.notify_buyer("C-0009", "Visit confirmed", "Your visit is confirmed.")
    tools.notify_technician("C-0009", "Visit confirmed", "Your visit is confirmed.")

    with db.get_conn() as conn:
        messages = conn.execute("SELECT body FROM buyer_messages WHERE case_id = 'C-0009' ORDER BY created_at DESC LIMIT 1").fetchone()
        emails = conn.execute("SELECT body FROM outbox WHERE case_id = 'C-0009' ORDER BY email_id DESC LIMIT 2").fetchall()
    assert "calendar/C-0009.ics" not in messages["body"]
    assert len(emails) == 2
    assert all("https://demo.example.test/api/calendar/C-0009.ics" in row["body"] for row in emails)


def test_visit_reminder_sweep_queues_once_for_buyer_and_technician(monkeypatch):
    import db
    import tools

    _schedule()
    monkeypatch.setenv("EMAIL_ENABLED", "true")
    monkeypatch.setenv("GMAIL_ADDRESS", "team@example.com")
    monkeypatch.setenv("GMAIL_APP_PASSWORD", "test-password")

    with db.get_conn() as conn, tools.use_connection(conn):
        reminders = tools.sweep_visit_reminders()
    with db.get_conn() as conn:
        outbox = conn.execute(
            """SELECT to_addr, body, status FROM outbox
               WHERE case_id = 'C-0009' AND subject LIKE '%Upcoming defect visit reminder%'
               ORDER BY email_id"""
        ).fetchall()
        events = conn.execute(
            "SELECT payload FROM case_events WHERE case_id = 'C-0009' AND type = 'reminder.sent'"
        ).fetchall()

    assert len(reminders) == 1
    assert reminders[0]["case_id"] == "C-0009"
    assert reminders[0]["kind"] == "visit"
    assert len(outbox) == 2
    assert {row["status"] for row in outbox} == {"queued"}
    assert all("calendar/C-0009.ics" in row["body"] for row in outbox)
    assert len(events) == 1
    assert json.loads(events[0]["payload"])["kind"] == "visit"

    with db.get_conn() as conn, tools.use_connection(conn):
        assert tools.sweep_visit_reminders() == []
    with db.get_conn() as conn:
        assert conn.execute(
            """SELECT COUNT(*) FROM outbox WHERE case_id = 'C-0009'
               AND subject LIKE '%Upcoming defect visit reminder%'"""
        ).fetchone()[0] == 2


def test_reminder_sweep_ignores_visits_more_than_24_hours_away():
    import tools

    _schedule(hours=25)
    assert tools.sweep_visit_reminders() == []


def test_repair_reminder_sweep_uses_repair_booking():
    import tools

    _schedule(kind="repair")
    reminders = tools.sweep_visit_reminders()
    assert len(reminders) == 1
    assert reminders[0]["kind"] == "repair"
