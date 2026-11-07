"""Small RFC 5545 calendar-file helpers for scheduled case visits and repairs."""
import os
from datetime import datetime, timedelta, timezone
from urllib.parse import quote


def _escape(value: str) -> str:
    return (
        value.replace("\\", "\\\\")
        .replace("\r\n", "\n")
        .replace("\r", "\n")
        .replace("\n", r"\n")
        .replace(",", r"\,")
        .replace(";", r"\;")
    )


def _utc_stamp(value: str) -> str:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def _fold(line: str) -> list[str]:
    """Fold a content line at 75 UTF-8 octets without splitting a code point."""
    chunks: list[str] = []
    current = ""
    octets = 0
    for character in line:
        size = len(character.encode("utf-8"))
        if octets + size > 75:
            chunks.append(current)
            current, octets = " ", 1
        current += character
        octets += size
    chunks.append(current)
    return chunks


def generate_ics(
    case_id: str,
    summary: str,
    start: str,
    *,
    end: str | None = None,
    description: str = "",
    job: str = "Inspection Visit",
    organizer: str | None = None,
    attendees: list[str] | None = None,
) -> str:
    start_dt = datetime.fromisoformat(start.replace("Z", "+00:00"))
    if start_dt.tzinfo is None:
        start_dt = start_dt.replace(tzinfo=timezone.utc)
    if end is None:
        end = (start_dt + timedelta(hours=1)).isoformat()
    now = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    title = summary or f"SDP {job} - Case {case_id}"
    lines = [
        "BEGIN:VCALENDAR",
        "PRODID:-//SimePhony//SDP Calendar//EN",
        "VERSION:2.0",
        "CALSCALE:GREGORIAN",
        "METHOD:REQUEST",
        "BEGIN:VEVENT",
        f"UID:{quote(case_id, safe='')}-{quote(job, safe='')}@simephony",
        f"DTSTAMP:{now}",
        f"DTSTART:{_utc_stamp(start)}",
        f"DTEND:{_utc_stamp(end)}",
        f"SUMMARY:{_escape(title)}",
        f"DESCRIPTION:{_escape(description)}",
    ]
    if organizer:
        lines.append(f"ORGANIZER:{organizer}")
    if attendees:
        for att in attendees:
            lines.append(f"ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:{att}")
    lines.extend([
        "STATUS:CONFIRMED",
        "SEQUENCE:0",
        "END:VEVENT",
        "END:VCALENDAR",
    ])
    return "\r\n".join(part for line in lines for part in _fold(line)) + "\r\n"


def calendar_url(case_id: str) -> str:
    base_url = os.getenv("API_BASE_URL", "http://localhost:8001").rstrip("/")
    return f"{base_url}/api/calendar/{quote(case_id, safe='')}.ics"
