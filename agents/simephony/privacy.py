# agents/simephony/privacy.py
# Personal-data filter for prompts sent to a cloud model (issue #83). Before a call leaves this machine, buyer
# names, emails, phone numbers and unit numbers are swapped for placeholders (PERSON_1, EMAIL_1, PHONE_1, UNIT_1);
# after the answer comes back, the placeholders are swapped back, so the app still sees the real values.
# The same value always gets the same placeholder within one call, so the model can still tell
# "same unit" from "a different unit". Photos are sent as they are (see README: text in photos is not filtered).
#
# LLM_PRIVACY_FILTER: auto (default) = on for a cloud model, off for local Ollama; on / off to force it.
import os
import re

from .llm_client import is_local

_EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
# Malaysian numbers (+60 12-345 6789, 012-3456789, 03-1234 5678) and other long international numbers
_PHONE = re.compile(r"(?<![\w-])(?:\+?6?0[\s-]?\d{1,2}[\s-]?\d{3,4}[\s-]?\d{4}|\+\d{1,3}[\s-]?\d{2,4}[\s-]?\d{3,4}[\s-]?\d{3,4})(?![\w-])")
# Block-floor-unit, e.g. A-12-08. Case and record numbers (C-0025, APR-0001) have one dash, so they stay.
_UNIT = re.compile(r"\b[A-Z]-\d{1,3}-\d{1,3}\b")


def enabled() -> bool:
    mode = os.getenv("LLM_PRIVACY_FILTER", "auto").strip().lower()
    if mode in ("on", "true", "1"):
        return True
    if mode in ("off", "false", "0"):
        return False
    return not is_local()


def _buyer_names() -> list[str]:
    """Buyer names from the database, longest first so "Aisyah Rahman" goes before "Aisyah"."""
    try:
        import db  # backend/db.py, on the path when the backend or the tests run
        with db.get_conn() as conn:
            names = [r[0] for r in conn.execute("SELECT DISTINCT name FROM buyers WHERE name IS NOT NULL")]
    except Exception:  # no database (a script, a unit test): emails, phones and units are still filtered
        return []
    # "Resident A-1-01" style demo names are only a unit number, which the unit rule already covers
    return sorted((n for n in names if n.strip() and not n.startswith("Resident ")), key=len, reverse=True)


class Redactor:
    def __init__(self, names: list[str] | None = None):
        self.names = _buyer_names() if names is None else names
        self.real_for: dict[str, str] = {}
        self._placeholder_for: dict[tuple[str, str], str] = {}

    def _placeholder(self, kind: str, value: str) -> str:
        key = (kind, value)
        if key not in self._placeholder_for:
            n = sum(1 for k, _ in self._placeholder_for if k == kind) + 1
            self._placeholder_for[key] = f"{kind}_{n}"
            self.real_for[f"{kind}_{n}"] = value
        return self._placeholder_for[key]

    def redact(self, text: str) -> str:
        text = _EMAIL.sub(lambda m: self._placeholder("EMAIL", m.group()), text)
        text = _PHONE.sub(lambda m: self._placeholder("PHONE", m.group()), text)
        text = _UNIT.sub(lambda m: self._placeholder("UNIT", m.group()), text)
        for name in self.names:
            text = re.sub(rf"\b{re.escape(name)}\b", lambda m, n=name: self._placeholder("PERSON", n), text, flags=re.I)
        return text

    def restore(self, text: str) -> str:
        if not self.real_for:
            return text
        # longest first, so UNIT_12 is put back before UNIT_1
        pattern = re.compile(r"\b(" + "|".join(sorted(map(re.escape, self.real_for), key=len, reverse=True)) + r")\b")
        return pattern.sub(lambda m: self.real_for[m.group()], text)

    def redact_messages(self, messages: list[dict]) -> list[dict]:
        out = []
        for msg in messages:
            content = msg.get("content")
            if isinstance(content, str):
                content = self.redact(content)
            elif isinstance(content, list):  # text and image parts: only the text is changed
                content = [{**part, "text": self.redact(part["text"])} if part.get("type") == "text" and isinstance(part.get("text"), str)
                           else part for part in content]
            out.append({**msg, "content": content})
        return out


def protect(messages: list[dict]) -> tuple[list[dict], "Redactor | None"]:
    """The messages to send, and the Redactor that puts the real values back into the answer (None when off)."""
    if not enabled():
        return messages, None
    redactor = Redactor()
    return redactor.redact_messages(messages), redactor


def restore_response(response, redactor: "Redactor | None"):
    """Put the real values back into an OpenAI-style response's message text, in place."""
    if redactor is None or response is None:
        return response
    for choice in getattr(response, "choices", None) or []:
        message = getattr(choice, "message", None)
        content = getattr(message, "content", None)
        if isinstance(content, str):
            message.content = redactor.restore(content)
    return response
