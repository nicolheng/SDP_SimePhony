"""Explicit live smoke test for the saved OAuth token; this module has no import-time side effects."""
import os
from datetime import datetime, timedelta, timezone

from calendar_service import create_event


def main() -> None:
    attendee = os.getenv("GOOGLE_CALENDAR_TEST_ATTENDEE", "").strip()
    if not attendee:
        raise SystemExit("Set GOOGLE_CALENDAR_TEST_ATTENDEE to an address that should receive a test invite.")

    start = datetime.now(timezone.utc) + timedelta(hours=1)
    end = start + timedelta(hours=1)
    event = {
        "summary": "SimePhony OAuth Calendar Test",
        "description": "Manual test of the saved SimePhony Calendar OAuth token.",
        "start": start.isoformat(),
        "end": end.isoformat(),
        "buyer": {"email": attendee},
        "technicians": [],
    }
    result = create_event("OAUTH-TEST", event)
    print(f"Google Calendar event created: {result.get('htmlLink', result.get('id', 'unknown'))}")


if __name__ == "__main__":
    main()
