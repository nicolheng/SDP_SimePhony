# backend/email_render.py: how a delivered email looks (subject, greeting, case box, button, footer).
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

import email_render  # noqa: E402

CASE = {"case_id": "C-0017", "summary": "Crack in living room", "unit_id": "A-12-08", "status": "VISIT_SCHEDULED"}


def _render(**kw):
    args = {"to": "aisyah.demo@example.com", "name": "Aisyah Rahman", "role": "buyer", "case": CASE,
            "app_url": "http://localhost:3000"} | kw
    return email_render.render("[C-0017] Technician confirmed", "Nurul Izzah confirmed your visit.", **args)


def test_case_subject_puts_the_case_number_last():
    assert email_render.subject_line("[C-0017] Technician confirmed") == "Technician confirmed: Case C-0017"
    assert email_render.subject_line("[Approval needed] Extra inspection for C-0017 (SI-002)") == \
        "[Approval needed] Extra inspection for C-0017 (SI-002)"


def test_buyer_email_has_greeting_case_box_and_case_link():
    subject, text, html = _render()
    assert subject == "Technician confirmed: Case C-0017"
    assert text.startswith("Hi Aisyah,\n\nNurul Izzah confirmed your visit.")
    assert "Status: Inspection visit booked" in text  # buyer wording
    assert "Hi Aisyah," in html and "Crack in living room" in html
    assert 'href="http://localhost:3000/buyer/cases/C-0017"' in html and "View your case" in html


def test_each_role_links_to_its_own_page():
    _, tech_text, tech = _render(role="technician", name="Nurul Izzah")
    _, _, staff = _render(role="staff", name="Farah Lee")
    assert "/technician/jobs/C-0017" in tech and "Open job" in tech
    assert "Status: Inspection visit\n" in tech_text  # staff wording, not the buyer's
    assert "/sdp/defects/C-0017" in staff and "SimePhony automated alerts" in staff


def test_unknown_recipient_and_no_case_leave_out_greeting_name_box_and_button():
    _, text, html = _render(name=None, role=None, case=None)
    assert text.startswith("Hello,")
    assert "Case:" not in text and "<a href" not in html


def test_body_is_escaped_and_links_are_clickable():
    _, _, html = email_render.render("[C-0001] Update", "<script>x</script>\nSee http://localhost:3000/sdp/approvals#APR-1",
                                     to="sdp.staff@example.com", role="staff")
    assert "<script>" not in html and "&lt;script&gt;" in html
    assert '<a href="http://localhost:3000/sdp/approvals#APR-1"' in html


def test_demo_footer_only_when_redirected():
    _, text, _ = _render()
    assert "originally addressed" not in text
    _, text, html = _render(redirected=True)
    assert "Demo copy: originally addressed to aisyah.demo@example.com" in text and "aisyah.demo@example.com" in html
