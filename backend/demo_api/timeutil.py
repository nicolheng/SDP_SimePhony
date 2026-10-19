"""Timestamps: stored and returned as UTC ISO strings ("2026-10-19T01:00:00.000Z"); shown in Malaysia time."""
from datetime import datetime, timedelta, timezone

MYT = timezone(timedelta(hours=8))


def parse(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.") + f"{dt.microsecond // 1000:03d}Z"


def norm(value: str | None) -> str | None:
    """Normalise any stored timestamp (+00:00, +08:00, Z) to the one UTC format the frontend compares as text."""
    return iso(parse(value)) if value else None


def add_days(value: str, days: float) -> str:
    return iso(parse(value) + timedelta(days=days))


def days_between(a: str, b: str) -> float:
    return (parse(b) - parse(a)).total_seconds() / 86400


def local_day(value: str) -> str:
    return parse(value).astimezone(MYT).strftime("%Y-%m-%d")


def slot_iso(day: str, hhmm: str) -> str:
    return iso(datetime.fromisoformat(f"{day}T{hhmm}:00+08:00"))


def fmt_datetime(value: str) -> str:
    """'Fri, 23 Oct, 11:00 am' in Malaysia time (portable: no %-d)."""
    d = parse(value).astimezone(MYT)
    hour = d.hour % 12 or 12
    return f"{d.strftime('%a')}, {d.day} {d.strftime('%b')}, {hour}:{d.minute:02d} {'am' if d.hour < 12 else 'pm'}"


def fmt_date(value: str) -> str:
    d = parse(value).astimezone(MYT)
    return f"{d.day} {d.strftime('%b')} {d.year}"
