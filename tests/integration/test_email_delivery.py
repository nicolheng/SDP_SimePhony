# Live email sending (EMAIL_ENABLED with a Gmail login) on a temp seed.db, with SMTP faked: emails from a web
# request are queued in the outbox and sent only after the request commits; agents outside a request send at once.
import pytest

pytestmark = pytest.mark.usefixtures("seed_db")


@pytest.fixture
def smtp(monkeypatch):
    """Turn sending on and record what would have gone to Gmail. Set .error to make every send fail."""
    import tools

    monkeypatch.setenv("EMAIL_ENABLED", "true")
    monkeypatch.setenv("GMAIL_ADDRESS", "team@example.com")
    monkeypatch.setenv("GMAIL_APP_PASSWORD", "app-password")
    monkeypatch.delenv("USE_AI_AGENTS", raising=False)

    class Fake:
        def __init__(self):
            self.sent, self.error = [], None

        def __call__(self, to, subject, body, case_id=None):
            self.sent.append((to, subject))
            return self.error

    fake = Fake()
    monkeypatch.setattr(tools, "_smtp_send", fake)
    tools.get_clock()  # first tools connection applies the web app's migrations
    return fake


def _request():
    from starlette.requests import Request
    return Request({"type": "http", "method": "POST", "scheme": "http", "server": ("testserver", 80),
                    "client": ("testclient", 123), "root_path": "", "path": "/api/cases", "query_string": b"", "headers": []})


def _outbox(case_id):
    import db
    with db.get_conn() as conn:
        return [dict(r) for r in conn.execute("SELECT to_addr, subject, status, error FROM outbox WHERE case_id = ? ORDER BY email_id", (case_id,))]


def _report(tasks):
    from demo_api import routes
    return routes.create_case(routes.NewReport(unit_id="A-1-01", buyer_id="B-0001", slot="",
                                               description="Water dripping from the master bedroom ceiling above the wardrobe."),
                              _request(), tasks)["caseId"]


def test_request_emails_are_sent_after_the_commit(smtp):
    from fastapi import BackgroundTasks

    import tools

    tasks = BackgroundTasks()
    case_id = _report(tasks)
    assert smtp.sent == []  # nothing sent while the request was open
    assert {m["status"] for m in _outbox(case_id)} == {"queued"}
    assert tasks.tasks[-1].func is tools.deliver_queued_emails

    tasks.tasks[-1].func()
    mail = _outbox(case_id)
    assert {m["status"] for m in mail} == {"sent"}
    assert smtp.sent == [(m["to_addr"], m["subject"]) for m in mail]
    assert any("New inspection visit" in subject for _, subject in smtp.sent)  # buyer and technician both emailed


def test_rolled_back_request_sends_nothing(smtp):
    from fastapi import BackgroundTasks, HTTPException

    import db
    import tools
    from demo_api import routes
    from demo_api.workflow import WorkflowError

    def failing_action(ctx):
        with tools.use_connection(ctx.conn):
            tools.send_email("buyer@example.com", "Should never arrive", "body", "C-0007")
        raise WorkflowError("refused")

    tasks = BackgroundTasks()
    with pytest.raises(HTTPException):
        routes._run(_request(), failing_action, background_tasks=tasks)
    with db.get_conn() as conn:
        assert not conn.execute("SELECT 1 FROM outbox WHERE subject = 'Should never arrive'").fetchone()
    assert tools.deliver_queued_emails() == 0
    assert smtp.sent == []


def test_failed_send_is_logged_with_the_error(smtp):
    from fastapi import BackgroundTasks

    smtp.error = "SMTPAuthenticationError: bad password"
    tasks = BackgroundTasks()
    case_id = _report(tasks)
    tasks.tasks[-1].func()
    assert {(m["status"], m["error"]) for m in _outbox(case_id)} == {("logged, not sent", "SMTPAuthenticationError: bad password")}


def test_delivered_email_has_sender_name_clean_subject_and_html(monkeypatch):
    import db
    import tools

    monkeypatch.setenv("GMAIL_ADDRESS", "team@example.com")
    monkeypatch.setenv("EMAIL_REDIRECT_TO", "demo@example.com")
    monkeypatch.delenv("EMAIL_FROM_NAME", raising=False)
    tools.get_clock()
    with db.get_conn() as conn:
        case = conn.execute("SELECT c.case_id, b.email, b.name FROM cases c JOIN buyers b ON b.buyer_id = c.buyer_id LIMIT 1").fetchone()
    sent = []

    class FakeSMTP:
        def __init__(self, *args, **kwargs): pass
        def __enter__(self): return self
        def __exit__(self, *exc): return False
        def login(self, *args): pass
        def send_message(self, msg): sent.append(msg)

    monkeypatch.setattr(tools.smtplib, "SMTP_SSL", FakeSMTP)
    assert tools._smtp_send(case["email"], f"[{case['case_id']}] Technician confirmed", "Your visit is confirmed.", case["case_id"]) is None
    msg = sent[0]
    assert msg["From"] == "SimePhony Defect Care <team@example.com>"
    assert msg["To"] == "demo@example.com"
    assert msg["Subject"] == f"Technician confirmed: Case {case['case_id']}"
    assert msg.get_content_type() == "multipart/alternative"
    html = msg.get_body(("html",)).get_content()
    assert f"Hi {case['name'].split()[0]}," in html and f"/buyer/cases/{case['case_id']}" in html
    assert f"originally addressed to {case['email']}" in html


def test_agents_outside_a_request_send_at_once(smtp):
    import tools

    r = tools.send_email("buyer@example.com", "[C-0007] Update", "body", "C-0007")
    assert r["status"] == "sent" and smtp.sent == [("buyer@example.com", "[C-0007] Update")]


def test_technician_emails_say_what_when_where_and_who(monkeypatch):
    import db
    import tools
    from demo_api import workflow

    monkeypatch.delenv("USE_AI_AGENTS", raising=False)
    tools.get_clock()

    def web(fn, *args):
        with db.get_conn() as conn:
            return fn(workflow.Ctx(conn), *args)

    case_id = web(workflow.submit_report, "A-12-08", "B-0118", "Ceiling leaking again in the master bedroom, third time!", None, None)["caseId"]
    with db.get_conn() as conn:
        approval = conn.execute("SELECT approval_id FROM approvals WHERE case_id = ? AND status = 'pending'", (case_id,)).fetchone()[0]
    web(workflow.decide_approval, approval, True)
    with db.get_conn() as conn:
        mail = {r["subject"].split("] ", 1)[-1]: r["body"] for r in conn.execute("SELECT subject, body FROM outbox WHERE case_id = ?", (case_id,))}

    visit = mail["New inspection visit: please accept"]
    assert visit.startswith("You have a new inspection visit at A-12-08 on ") and f"case {case_id}" in visit
    assert "SDP has also been asked to approve a detailed inspection" in visit

    lead = mail["Extra inspection brief (you lead)"]
    assert lead.startswith("You are leading a detailed inspection at A-12-08 on ") and "together with Kamal Yusof" in lead
    assert "SDP approved this detailed inspection. Water leak reported in A-12-08" in lead and "\n1. " in lead
    assert "reopened 0×" not in lead  # the reopen clause only appears after a reopen

    joint = next(body for subject, body in mail.items() if subject.startswith("Joint extra inspection with "))
    assert "You are joining a detailed inspection at A-12-08" in joint and "who records the result" in joint
