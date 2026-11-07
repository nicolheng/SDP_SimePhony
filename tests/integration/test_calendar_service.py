import pytest

pytestmark = pytest.mark.usefixtures("seed_db")


def _request():
    from starlette.requests import Request

    return Request({
        "type": "http",
        "method": "POST",
        "scheme": "http",
        "server": ("testserver", 80),
        "client": ("testclient", 123),
        "root_path": "",
        "path": "/api/cases/C-0009/booking",
        "query_string": b"",
        "headers": [],
    })


def test_google_event_uses_local_timezone_and_sends_attendee_updates(monkeypatch):
    import calendar_service

    captured = {}

    class Request:
        def execute(self):
            return {"id": "google-event-1"}

    class Events:
        def insert(self, **kwargs):
            captured.update(kwargs)
            return Request()

    class Service:
        def events(self):
            return Events()

    monkeypatch.setattr(calendar_service, "_build_service", lambda: Service())
    monkeypatch.delenv("EMAIL_REDIRECT_TO", raising=False)
    event = {
        "summary": "SDP Inspection Visit - Case C-0009",
        "description": "Case C-0009, Unit C-8-06",
        "start": "2026-11-06T02:00:00.000Z",
        "end": "2026-11-06T03:00:00.000Z",
        "buyer": {"email": "buyer@example.com"},
        "technicians": [{"email": "technician@example.com"}],
    }

    result = calendar_service.create_event("C-0009", event)

    assert result["id"] == "google-event-1"
    assert captured["sendUpdates"] in ("all", "none")
    assert captured["body"]["start"]["timeZone"] == "Asia/Kuala_Lumpur"
    assert captured["body"]["end"]["timeZone"] == "Asia/Kuala_Lumpur"
    assert captured["body"]["start"]["dateTime"].endswith("+08:00")
    assert {attendee["email"] for attendee in captured["body"]["attendees"]} == {
        "buyer@example.com",
        "technician@example.com",
    }


def test_expired_oauth_token_refreshes_with_client_secret_and_is_saved(tmp_path, monkeypatch):
    from datetime import datetime, timedelta, timezone

    from google.auth.transport import requests as auth_requests
    from google.oauth2.credentials import Credentials

    import calendar_service

    token_file = tmp_path / "token.json"
    client_file = tmp_path / "oauth-credentials.json"
    credentials = Credentials(
        token="expired-token",
        refresh_token="refresh-token",
        token_uri="https://oauth2.googleapis.com/token",
        client_id="old-client-id",
        client_secret="old-client-secret",
        scopes=calendar_service.CALENDAR_SCOPE,
        expiry=datetime(2000, 1, 1),
    )
    token_file.write_text(credentials.to_json(), encoding="utf-8")
    client_file.write_text(
        '{"installed":{"client_id":"client-from-file","client_secret":"secret-from-file",'
        '"token_uri":"https://oauth2.googleapis.com/token"}}',
        encoding="utf-8",
    )
    monkeypatch.setattr(calendar_service, "TOKEN_FILE", token_file)
    monkeypatch.setattr(calendar_service, "OAUTH_CREDENTIALS_FILE", client_file)
    monkeypatch.setattr(auth_requests, "Request", lambda: object())
    refreshed = []

    def refresh(instance, request):
        refreshed.append((request, instance.client_id, instance.client_secret))
        instance.token = "refreshed-token"
        instance.expiry = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(hours=1)

    monkeypatch.setattr(Credentials, "refresh", refresh)

    result = calendar_service._load_credentials()

    assert result.token == "refreshed-token"
    assert refreshed[0][1:] == ("client-from-file", "secret-from-file")
    saved = Credentials.from_authorized_user_file(str(token_file), scopes=calendar_service.CALENDAR_SCOPE)
    assert saved.token == "refreshed-token"


def test_setup_oauth_runs_local_flow_and_saves_token(tmp_path, monkeypatch):
    import setup_oauth

    client_file = tmp_path / "oauth-credentials.json"
    token_file = tmp_path / "token.json"
    client_file.write_text("{}", encoding="utf-8")
    monkeypatch.setattr(setup_oauth, "CLIENT_SECRETS_FILE", client_file)
    monkeypatch.setattr(setup_oauth, "TOKEN_FILE", token_file)
    captured = {}

    class Credentials:
        def to_json(self):
            return '{"refresh_token":"saved"}'

    class Flow:
        @classmethod
        def from_client_secrets_file(cls, filename, scopes):
            captured["filename"] = filename
            captured["scopes"] = scopes
            return cls()

        def run_local_server(self, *, port):
            captured["port"] = port
            return Credentials()

    monkeypatch.setattr(setup_oauth, "InstalledAppFlow", Flow)

    setup_oauth.main()

    assert captured["filename"] == str(client_file)
    assert captured["scopes"] == ["https://www.googleapis.com/auth/calendar.events"]
    assert captured["port"] == 0
    assert token_file.read_text(encoding="utf-8") == '{"refresh_token":"saved"}'


def test_missing_oauth_token_returns_ics_fallback(tmp_path, monkeypatch, caplog):
    import calendar_service
    import tools

    monkeypatch.setenv("GOOGLE_CALENDAR_CREATE_EVENT", "true")
    client_file = tmp_path / "oauth-credentials.json"
    token_file = tmp_path / "token.json"
    client_file.write_text("{}", encoding="utf-8")
    monkeypatch.setattr(calendar_service, "TOKEN_FILE", token_file)
    monkeypatch.setattr(calendar_service, "OAUTH_CREDENTIALS_FILE", client_file)
    monkeypatch.setattr(
        tools,
        "get_calendar_event",
        lambda case_id: {
            "summary": f"SDP Inspection Visit - Case {case_id}",
            "description": f"Case {case_id}",
            "start": "2026-11-06T02:00:00Z",
            "end": "2026-11-06T03:00:00Z",
            "buyer": {"email": "buyer@example.com"},
            "technicians": [],
        },
    )

    result = calendar_service.create_booking_invitation("C-0009")

    assert result["ok"] is False
    assert "OAuth token not found" in result["error"]
    assert result["fallback_url"].endswith("/api/calendar/C-0009.ics")
    assert "Google Calendar OAuth/API failed, falling back to .ics email" in caplog.text


def test_failed_google_api_does_not_skip_queued_booking_emails(tmp_path, monkeypatch, caplog):
    from fastapi import BackgroundTasks

    import calendar_service
    import db
    import tools
    from demo_api import routes, workflow

    tools.get_clock()
    monkeypatch.setenv("GOOGLE_CALENDAR_CREATE_EVENT", "true")
    monkeypatch.setenv("USE_AI_AGENTS", "false")
    monkeypatch.setenv("EMAIL_ENABLED", "true")
    monkeypatch.setenv("GMAIL_ADDRESS", "team@example.com")
    monkeypatch.setenv("GMAIL_APP_PASSWORD", "test-password")
    monkeypatch.setenv("EMAIL_REDIRECT_TO", "demo-inbox@example.com")
    token_file = tmp_path / "token.json"
    client_file = tmp_path / "oauth-credentials.json"
    token_file.write_text("test token", encoding="utf-8")
    client_file.write_text("test client", encoding="utf-8")
    monkeypatch.setattr(calendar_service, "TOKEN_FILE", token_file)
    monkeypatch.setattr(calendar_service, "OAUTH_CREDENTIALS_FILE", client_file)
    monkeypatch.setattr(calendar_service, "_build_service", lambda: (_ for _ in ()).throw(RuntimeError("OAuth token rejected")))

    delivered = []
    monkeypatch.setattr(tools, "_smtp_send", lambda to, subject, body, case_id=None: delivered.append((to, subject)) or None)
    options = tools.get_booking_options("C-0009")
    slot = options["preferred"] or options["alternatives"][0]
    technician_id = slot["technicians"][0]["technician_id"]

    def book_and_notify(ctx):
        workflow._tool(
            ctx,
            tools.assign_technician,
            "C-0009",
            technician_id,
            slot["start"],
            "Qualified technician available",
        )
        workflow.notify_buyer(ctx, "C-0009", "received", slot=slot["start_local"])
        workflow.notify_tech(ctx, "C-0009", "New inspection visit", "Please accept the visit.")

    tasks = BackgroundTasks()
    routes._run(_request(), book_and_notify, background_tasks=tasks)

    with db.get_conn() as conn:
        queued = conn.execute(
            "SELECT to_addr, subject, body, status FROM outbox WHERE case_id = 'C-0009' ORDER BY rowid DESC LIMIT 2"
        ).fetchall()
    assert len(queued) == 2
    assert {row["status"] for row in queued} == {"queued"}
    assert {row["to_addr"] for row in queued} == {"demo-inbox@example.com"}
    assert all("/api/calendar/C-0009.ics" in row["body"] for row in queued)

    assert tasks.tasks[0].func is tools.deliver_queued_emails
    assert tasks.tasks[1].func.__name__ == "create_booking_invitation"
    for task in tasks.tasks:
        task.func(*task.args, **task.kwargs)

    with db.get_conn() as conn:
        rows = conn.execute(
            "SELECT to_addr, status FROM outbox WHERE case_id = 'C-0009' ORDER BY rowid DESC LIMIT 2"
        ).fetchall()
    assert {row["status"] for row in rows} == {"sent"}
    assert delivered and all(address == "demo-inbox@example.com" for address, _ in delivered)
    assert "Google Calendar OAuth/API failed, falling back to .ics email" in caplog.text
