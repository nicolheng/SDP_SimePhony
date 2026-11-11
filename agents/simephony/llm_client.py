# agents/simephony/llm_client.py
import ipaddress
import os
from urllib.parse import urlparse

from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()  # this module can be imported before anything else has loaded .env

# 1. Time limits per attempt, in seconds. Vision is longer: the model is bigger and takes longer to load
LLM_TIMEOUT_TEXT = float(os.getenv("LLM_TIMEOUT_TEXT", "45"))
LLM_TIMEOUT_VISION = float(os.getenv("LLM_TIMEOUT_VISION", "90"))
# Stops a model that runs away producing junk instead of finishing its JSON.
# On cloud models that think first (e.g. Gemini 3) the thinking counts too, so give them more room.
LLM_MAX_TOKENS = int(os.getenv("LLM_MAX_TOKENS", "1000"))
# Optional "how hard to think" for cloud models (e.g. low). Left out of the request when empty (Ollama).
LLM_REASONING_EFFORT = os.getenv("LLM_REASONING_EFFORT", "").strip()
# Retries per call. A cloud free tier answers "too many requests" (429) when friends test at once;
# the OpenAI library waits and tries again, so cloud setups use a few more.
LLM_MAX_RETRIES = int(os.getenv("LLM_MAX_RETRIES", "1"))

LLM_BASE_URL = os.getenv("LLM_BASE_URL", "http://localhost:11434/v1")

# 2. Setup the client. Defaults talk to local Ollama's OpenAI-compatible server
client = OpenAI(
    base_url=LLM_BASE_URL,
    api_key=os.getenv("LLM_API_KEY", "ollama"), # Ollama doesn't care about the key, but OpenAI library requires it
    timeout=LLM_TIMEOUT_TEXT,
    max_retries=LLM_MAX_RETRIES,
)


def is_local() -> bool:
    """True when the model server runs on this machine or network (Ollama), False for a cloud provider."""
    host = (urlparse(os.getenv("LLM_BASE_URL", LLM_BASE_URL)).hostname or "").lower()
    try:
        ip = ipaddress.ip_address(host)
        return ip.is_loopback or ip.is_private or ip.is_unspecified
    except ValueError:  # a name, not an address: localhost, a .local machine, or a LAN name like gpu-box
        return host == "localhost" or host.endswith(".local") or "." not in host


def extra_params() -> dict:
    """Settings only some servers accept, added to each model call when they are set in .env."""
    return {"reasoning_effort": LLM_REASONING_EFFORT} if LLM_REASONING_EFFORT else {}

# 3. Define which models to use
MODEL_VL = os.getenv("MODEL_VL", "llava-llama3")   # For looking at photos
MODEL_TEXT = os.getenv("MODEL_TEXT", "qwen2.5:7b")  # For reading text and reasoning

def create_completion(client, **kwargs):
    """One model call with a total time limit of twice its per-try timeout (#81). A stuck cloud call used to cost
    the timeout on every retry (10 s x 4 tries); now the retries stop when the limit is used up, so in
    USE_AI_AGENTS=true the rules take over sooner. Retries only network trouble, timeouts, 429s and 5xx."""
    import time
    from openai import APIConnectionError, APITimeoutError, InternalServerError, RateLimitError
    timeout = kwargs.pop("timeout", LLM_TIMEOUT_TEXT)
    if not isinstance(client, OpenAI):  # test doubles
        return client.chat.completions.create(timeout=timeout, **kwargs)
    deadline = time.monotonic() + 2 * timeout
    tries = (client.max_retries or 0) + 1
    single = client.with_options(max_retries=0)
    for attempt in range(tries):
        left = deadline - time.monotonic()
        try:
            return single.chat.completions.create(timeout=max(0.1, min(timeout, left)), **kwargs)
        except (APIConnectionError, APITimeoutError, InternalServerError, RateLimitError):
            left = deadline - time.monotonic()
            if attempt == tries - 1 or left < 1:
                raise
            time.sleep(min(0.5 * 2 ** attempt, left - 1))


def get_client():
    return client

def get_models():
    return MODEL_VL, MODEL_TEXT

def ai_only():
    """USE_AI_AGENTS=only (for testing): a failed AI step is an error, never a rule-based or fixed-template answer."""
    return os.getenv("USE_AI_AGENTS", "").strip().lower() == "only"