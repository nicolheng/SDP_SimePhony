"""Google Calendar invitations for booked SimePhony visits and repairs."""
import json
import logging
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

from calendar_utils import calendar_url

log = logging.getLogger("simephony.calendar")
CALENDAR_SCOPE = ["https://www.googleapis.com/auth/calendar.events"]
EVENT_TIME_ZONE = "Asia/Kuala_Lumpur"
KUALA_LUMPUR = timezone(timedelta(hours=8))
BACKEND_DIR = Path(__file__).resolve().parent
TOKEN_FILE = BACKEND_DIR / "token.json"
OAUTH_CREDENTIALS_FILE = BACKEND_DIR / "oauth-credentials.json"


def is_configured() -> bool:
    """Whether Google Calendar API event creation is enabled and credentials exist.
    Defaults to False to prevent creating duplicate calendar events alongside the email's native .ics banner."""
    if os.getenv("GOOGLE_CALENDAR_CREATE_EVENT", "false").lower() != "true":
        return False
    return TOKEN_FILE.is_file() or OAUTH_CREDENTIALS_FILE.is_file()


def _client_config() -> dict:
    with OAUTH_CREDENTIALS_FILE.open(encoding="utf-8") as file:
        config = json.load(file)
    client = config.get("installed") or config.get("web")
    if not isinstance(client, dict):
        raise ValueError(f"{OAUTH_CREDENTIALS_FILE.name} must contain an installed or web OAuth client")
    return client


def _save_credentials(credentials) -> None:
    temporary_file = TOKEN_FILE.with_suffix(".tmp")
    temporary_file.write_text(credentials.to_json(), encoding="utf-8")
    temporary_file.replace(TOKEN_FILE)


def _load_credentials():
    """Load the saved user token and refresh it using oauth-credentials.json when expired."""
    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials

    if not TOKEN_FILE.is_file():
        raise FileNotFoundError(f"OAuth token not found: {TOKEN_FILE}")

    credentials = Credentials.from_authorized_user_file(str(TOKEN_FILE), scopes=CALENDAR_SCOPE)
    if credentials.expired or not credentials.valid:
        if not credentials.refresh_token:
            raise RuntimeError("The saved OAuth token is expired and has no refresh token; rerun setup_oauth.py")

        client = None
        if OAUTH_CREDENTIALS_FILE.is_file():
            try:
                client = _client_config()
            except Exception as e:
                log.warning("Could not load OAuth client config from %s: %s", OAUTH_CREDENTIALS_FILE, e)

        token_uri = (client.get("token_uri") if client else None) or credentials.token_uri or "https://oauth2.googleapis.com/token"
        client_id = (client.get("client_id") if client else None) or credentials.client_id
        client_secret = (client.get("client_secret") if client else None) or credentials.client_secret

        credentials = Credentials(
            token=credentials.token,
            refresh_token=credentials.refresh_token,
            id_token=credentials.id_token,
            token_uri=token_uri,
            client_id=client_id,
            client_secret=client_secret,
            scopes=credentials.scopes or CALENDAR_SCOPE,
            expiry=credentials.expiry,
            quota_project_id=credentials.quota_project_id,
            rapt_token=credentials.rapt_token,
        )
        credentials.refresh(Request())
        _save_credentials(credentials)
    return credentials


def _build_service():
    from googleapiclient.discovery import build

    return build("calendar", "v3", credentials=_load_credentials(), cache_discovery=False)


def _local_datetime(value: str) -> str:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(KUALA_LUMPUR).isoformat()


def create_event(case_id: str, event: dict) -> dict:
    """Create the calendar event and ask Google to send attendee updates."""
    attendees = []
    seen = set()

    def add_attendee(email: str):
        if email and email.strip() and email.strip().casefold() not in seen:
            attendees.append({"email": email.strip()})
            seen.add(email.strip().casefold())

    buyer = event.get("buyer")
    if isinstance(buyer, dict):
        add_attendee(buyer.get("email", ""))
    elif isinstance(buyer, str):
        add_attendee(buyer)

    for tech in event.get("technicians") or []:
        if isinstance(tech, dict):
            add_attendee(tech.get("email", ""))
        elif isinstance(tech, str):
            add_attendee(tech)

    redirect = os.getenv("EMAIL_REDIRECT_TO", "").strip()
    if redirect:
        add_attendee(redirect)

    if not attendees:
        raise ValueError(f"No buyer or technician email is available for case {case_id}")

    start = datetime.fromisoformat(event["start"].replace("Z", "+00:00"))
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    end_value = event.get("end")
    if end_value:
        end = datetime.fromisoformat(end_value.replace("Z", "+00:00"))
        if end.tzinfo is None:
            end = end.replace(tzinfo=timezone.utc)
    else:
        end = start + timedelta(hours=1)

    payload = {
        "summary": event["summary"],
        "description": event.get("description", ""),
        "start": {"dateTime": _local_datetime(start.isoformat()), "timeZone": EVENT_TIME_ZONE},
        "end": {"dateTime": _local_datetime(end.isoformat()), "timeZone": EVENT_TIME_ZONE},
        "attendees": attendees,
    }
    calendar_id = os.getenv("GOOGLE_CALENDAR_ID", "primary").strip() or "primary"
    send_updates = os.getenv("GOOGLE_CALENDAR_SEND_UPDATES", "none").strip() or "none"
    result = _build_service().events().insert(
        calendarId=calendar_id,
        body=payload,
        sendUpdates=send_updates,
    ).execute()
    return result if isinstance(result, dict) else {}


def create_booking_invitation(case_id: str) -> dict:
    """Try Google Calendar after commit; the queued booking email always keeps its .ics link."""
    fallback_url = calendar_url(case_id)
    if os.getenv("GOOGLE_CALENDAR_CREATE_EVENT", "false").lower() != "true":
        return {"ok": True, "skipped": True, "fallback_url": fallback_url}
    try:
        if not is_configured():
            raise FileNotFoundError(
                f"OAuth setup is incomplete; expected {TOKEN_FILE.name} and {OAUTH_CREDENTIALS_FILE.name} "
                f"under {BACKEND_DIR}"
            )
        import tools

        event = tools.get_calendar_event(case_id)
        if event is None:
            raise ValueError(f"Case {case_id} no longer has an active scheduled visit or repair")
        result = create_event(case_id, event)
        log.info("Created Google Calendar event for %s (%s)", case_id, result.get("id", "no event id"))
        print("✅ Calendar invite sent to attendees")
        return {"ok": True, "event_id": result.get("id")}
    except Exception as exc:
        log.exception(
            "Google Calendar OAuth/API failed, falling back to .ics email for %s: %s (fallback link: %s)",
            case_id,
            exc,
            fallback_url,
        )
        print(f"⚠️ Calendar API failed, falling back to .ics: {exc}")
        return {"ok": False, "error": str(exc), "fallback_url": fallback_url}


def send_calendar_invite(case_id: str) -> dict:
    """Convenience alias for create_booking_invitation."""
    return create_booking_invitation(case_id)
