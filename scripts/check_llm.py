# Checks that the model server in .env works for this app: one JSON text request and one photo request,
# the same way the agents call it. Use it after switching to a cloud model (e.g. Gemini) or a new key.
#   python scripts/check_llm.py          # text + photo check
#   python scripts/check_llm.py --list   # model names this key can use
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from agents.simephony.intake import image_data_url  # noqa: E402
from agents.simephony.llm_client import (  # noqa: E402
    LLM_BASE_URL, LLM_TIMEOUT_TEXT, LLM_TIMEOUT_VISION, get_client, get_models, is_local)
from agents.simephony.structured_output import chat_json  # noqa: E402

PHOTO = ROOT / "data" / "sample_photos" / "sample_ceiling_original.jpg"
SCHEMA = {"type": "object", "required": ["answer"], "properties": {"answer": {"type": "string"}}}


def _try(label, run):
    start = time.perf_counter()
    try:
        answer = run()
        print(f"OK    {label} ({time.perf_counter() - start:.1f}s): {answer}")
        return True
    except Exception as e:  # show the provider's message, e.g. a wrong model name or key
        print(f"FAIL  {label} ({time.perf_counter() - start:.1f}s): {type(e).__name__}: {e}")
        return False


def main():
    client = get_client()
    vision, text = get_models()
    print(f"Server: {LLM_BASE_URL} ({'local' if is_local() else 'cloud'})")
    if "--list" in sys.argv:
        for m in client.models.list():
            print(" ", m.id)
        return 0
    print(f"Text model: {text}\nVision model: {vision}\n")
    ok = _try("text, JSON answer", lambda: chat_json(
        client, text, [{"role": "user", "content": 'Reply with JSON: {"answer": "<one word: what is 2 + 2>"}'}],
        SCHEMA, timeout=LLM_TIMEOUT_TEXT)["parsed"]["answer"])
    ok &= _try("photo, JSON answer", lambda: chat_json(
        client, vision, [{"role": "user", "content": [
            {"type": "text", "text": 'Reply with JSON: {"answer": "<what is in this photo, in under 10 words>"}'},
            {"type": "image_url", "image_url": {"url": image_data_url(str(PHOTO))}}]}],
        SCHEMA, timeout=LLM_TIMEOUT_VISION)["parsed"]["answer"])
    print("\nAll good: the agents can use this model." if ok else "\nFix the FAIL lines above, then run this again.")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
