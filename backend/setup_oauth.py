"""Run the one-time Installed App OAuth flow and save the Calendar refresh token."""
from pathlib import Path

from google_auth_oauthlib.flow import InstalledAppFlow

SCOPES = ["https://www.googleapis.com/auth/calendar.events"]
BACKEND_DIR = Path(__file__).resolve().parent
CLIENT_SECRETS_FILE = BACKEND_DIR / "oauth-credentials.json"
TOKEN_FILE = BACKEND_DIR / "token.json"


def main() -> None:
    if not CLIENT_SECRETS_FILE.is_file():
        raise FileNotFoundError(
            f"Download an OAuth Desktop app client JSON and save it as {CLIENT_SECRETS_FILE}"
        )
    flow = InstalledAppFlow.from_client_secrets_file(str(CLIENT_SECRETS_FILE), scopes=SCOPES)
    credentials = flow.run_local_server(port=0)
    TOKEN_FILE.write_text(credentials.to_json(), encoding="utf-8")
    print(f"Google Calendar OAuth token saved to {TOKEN_FILE}")


if __name__ == "__main__":
    main()
