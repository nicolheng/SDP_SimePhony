"""How a delivered email looks: subject, plain text and branded HTML (tools._smtp_send sends them).
Pure functions: no DB, no SMTP. The outbox keeps the original subject and body; only the delivered copy changes."""
import html
import re
from typing import Optional

from demo_api import config

BRAND = "#d71920"  # frontend/src/app/globals.css --brand

# Same wording as frontend/src/lib/status.ts STATUS_META: (label for staff and technicians, buyer wording).
STATUS_LABEL = {
    "SUBMITTED": ("Submitted", "Received"),
    "INFO_NEEDED": ("Info needed", "Action needed"),
    "ASSIGNED": ("Assigned", "Technician assigned"),
    "VISIT_SCHEDULED": ("Inspection visit", "Inspection visit booked"),
    "VALID": ("Valid", "Book your repair"),
    "INVALID": ("Invalid", "Not a defect"),
    "REPAIR_BOOKED": ("Repair booked", "Repair booked"),
    "REPAIRED": ("Repaired", "Repaired"),
    "PENDING_SIGNOFF": ("Pending sign-off", "Check & sign off"),
    "CLOSED": ("Closed", "Closed"),
    "REOPENED": ("Reopened", "Reopened"),
    "ESCALATION_PENDING": ("Escalation pending", "Under review"),
    "EXTRA_INSPECTION": ("Extra inspection", "Detailed inspection"),
}

# role -> (button text, page path) of the case in the web app
CASE_LINK = {
    "buyer": ("View your case", "/buyer/cases/{}"),
    "technician": ("Open job", "/technician/jobs/{}"),
    "staff": ("Open in SDP console", "/sdp/defects/{}"),
}

_CASE_PREFIX = re.compile(r"^\[([A-Z]+-\d+)\]\s*(.+)$")
_URL = re.compile(r"(https?://[^\s<]+)")


def subject_line(subject: str) -> str:
    """"[C-0017] Technician confirmed" -> "Technician confirmed: Case C-0017"; other subjects are kept."""
    m = _CASE_PREFIX.match(subject)
    return f"{m.group(2)}: Case {m.group(1)}" if m else subject


def render(subject: str, body: str, *, to: str, name: Optional[str] = None, role: Optional[str] = None,
           case: Optional[dict] = None, redirected: bool = False, app_url: str = config.APP_URL) -> tuple[str, str, str]:
    """The delivered (subject, plain text, html). role: buyer | technician | staff | None (unknown recipient).
    case: the cases row, or None to leave out the details box and the link."""
    greeting = f"Hi {name.split()[0]}," if name and name.strip() else "Hello,"
    signoff = "SimePhony automated alerts" if role == "staff" else config.SDP_STAFF_TITLE

    details: list[tuple[str, str]] = []
    link = None
    if case:
        status = STATUS_LABEL.get(case.get("status") or "")
        details = [("Case", case["case_id"]), ("Defect", case.get("summary") or ""), ("Unit", case.get("unit_id") or ""),
                   ("Status", (status[1] if role == "buyer" else status[0]) if status else case.get("status") or "")]
        details = [(k, v) for k, v in details if v]
        if role in CASE_LINK:
            label, path = CASE_LINK[role]
            link = (label, app_url.rstrip("/") + path.format(case["case_id"]))
    footer = ["Automated message from SimePhony: please do not reply to this email."]
    if redirected:
        footer.append(f"Demo copy: originally addressed to {to}")

    text = "\n\n".join(filter(None, [
        greeting,
        body.strip(),
        "\n".join(f"{k}: {v}" for k, v in details),
        f"{link[0]}: {link[1]}" if link else "",
        f"Regards,\n{signoff}",
        "\n".join(footer),
    ]))
    return subject_line(subject), text, _html(greeting, body, details, link, signoff, footer)


def _paragraph(text: str) -> str:
    """One body paragraph as HTML: escaped, line breaks kept, links clickable."""
    escaped = html.escape(text).replace("\n", "<br>")
    return _URL.sub(lambda m: f'<a href="{m.group(1)}" style="color:{BRAND}">{m.group(1)}</a>', escaped)


def _html(greeting: str, body: str, details: list[tuple[str, str]], link: Optional[tuple[str, str]],
          signoff: str, footer: list[str]) -> str:
    e = html.escape
    paragraphs = "".join(f'<p style="margin:0 0 14px">{_paragraph(p)}</p>' for p in re.split(r"\n\s*\n", body.strip()) if p.strip())
    rows = "".join(
        f'<tr><td style="padding:6px 12px;color:#71717a;width:80px">{e(k)}</td>'
        f'<td style="padding:6px 12px;color:#18181b;font-weight:600">{e(v)}</td></tr>' for k, v in details)
    box = (f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" '
           f'style="margin:6px 0 20px;background:#fafafa;border:1px solid #e4e4e7;border-radius:8px;font-size:14px">{rows}</table>'
           if rows else "")
    button = (f'<p style="margin:0 0 22px"><a href="{e(link[1])}" style="display:inline-block;background:{BRAND};color:#ffffff;'
              f'text-decoration:none;font-weight:600;padding:11px 22px;border-radius:6px">{e(link[0])}</a></p>' if link else "")
    return f"""<!doctype html>
<html><body style="margin:0;padding:0;background:#f4f4f5">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:10px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#27272a">
<tr><td style="background:{BRAND};padding:18px 28px;color:#ffffff">
<span style="font-size:19px;font-weight:700">SimePhony</span>
<span style="font-size:13px;opacity:.85">&nbsp;·&nbsp;{e(config.PROJECT_NAME)}</span></td></tr>
<tr><td style="padding:28px">
<p style="margin:0 0 14px">{e(greeting)}</p>
{paragraphs}{box}{button}
<p style="margin:0">Regards,<br><strong>{e(signoff)}</strong></p></td></tr>
<tr><td style="background:#fafafa;border-top:1px solid #e4e4e7;padding:14px 28px;font-size:12px;color:#71717a">
{"<br>".join(e(f) for f in footer)}</td></tr>
</table></td></tr></table></body></html>"""
