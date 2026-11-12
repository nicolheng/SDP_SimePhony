"""FastAPI app: REST endpoints for the buyer, technician and SDP apps, plus /uploads static files."""
import asyncio
import logging
import json
import os
import sqlite3
import time
import urllib.error
import urllib.parse
import urllib.request
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

load_dotenv()

import db  # noqa: E402  (after load_dotenv so env paths apply)
from demo_api import config  # noqa: E402
import tools  # noqa: E402
from demo_api import ai_agents  # noqa: E402
from demo_api.migrate import migrate  # noqa: E402
from demo_api.routes import MAX_BODY_BYTES, router as app_router  # noqa: E402

log = logging.getLogger("simephony.startup")
UPLOADS_DIR = Path(__file__).resolve().parent.parent / "uploads"
SAMPLE_PHOTOS_DIR = UPLOADS_DIR.parent / "data" / "sample_photos"
SWEEP_INTERVAL_S = 60


def sweep_signoffs_now() -> list[dict]:
    """Apply the sign-off deadlines (reminder, auto-close, overdue) in one short write transaction."""
    with db.write_conn() as conn, tools.use_connection(conn):
        return tools.sweep_signoffs()


def sweep_visit_reminders_now() -> list[dict]:
    """Queue due visit reminders atomically, then deliver them after the database commit."""
    with db.write_conn() as conn, tools.use_connection(conn):
        reminders = tools.sweep_visit_reminders()
    if reminders:
        tools.deliver_queued_emails()
    return reminders


def _in_session(sid: str | None, func):
    """Run func against one visitor's database (None = the shared one)."""
    token = db.set_session(sid)
    try:
        return func()
    finally:
        db.reset_session(token)


def _sweep_targets() -> list[str | None]:
    return db.list_sessions() if db.SESSIONS_ENABLED else [None]


async def _sweep_loop() -> None:
    """Deadlines pass with real time even when nobody clicks, and GET /api/state no longer applies them."""
    while True:
        for sid in _sweep_targets():
            await _sweep_once(sid)
        if db.SESSIONS_ENABLED:
            await asyncio.to_thread(db.cleanup_sessions)
        await asyncio.sleep(SWEEP_INTERVAL_S)


async def _sweep_once(sid: str | None) -> None:
    try:
        await asyncio.to_thread(_in_session, sid, sweep_signoffs_now)
    except Exception as exc:  # log and keep looping: one failed sweep must not stop the next
        if db.is_busy(exc):
            log.warning("Sign-off sweep skipped, database busy; retrying in %d s", SWEEP_INTERVAL_S)
        else:
            log.exception("Sign-off sweep failed; retrying in %d s", SWEEP_INTERVAL_S)
    try:
        await asyncio.to_thread(_in_session, sid, sweep_visit_reminders_now)
    except Exception as exc:  # a failed reminder pass must not stop later periodic sweeps
        if db.is_busy(exc):
            log.warning("Visit reminder sweep skipped, database busy; retrying in %d s", SWEEP_INTERVAL_S)
        else:
            log.exception("Visit reminder sweep failed; retrying in %d s", SWEEP_INTERVAL_S)


class BodySizeLimit:
    """Reject request bodies over max_bytes with 413 before they are buffered and parsed. Checks Content-Length up
    front and also counts the bytes as they arrive, so a chunked upload without that header is capped too."""

    def __init__(self, app, max_bytes: int):
        self.app = app
        self.max_bytes = max_bytes
        self.detail = f"Request too large (max {max_bytes // (1024 * 1024)} MB)."

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        length = dict(scope["headers"]).get(b"content-length")
        if length is not None and (not length.isdigit() or int(length) > self.max_bytes):
            return await JSONResponse(status_code=413, content={"detail": self.detail})(scope, receive, send)

        received = 0

        async def limited_receive():
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > self.max_bytes:
                    # An HTTPException, because FastAPI turns any other error while reading the body into a 400.
                    raise HTTPException(status_code=413, detail=self.detail)
            return message

        await self.app(scope, limited_receive, send)


class DemoSession:
    """Hosted demo: pick the visitor's own database from the X-Demo-Session header, creating it from seed.db on
    first use. Also a small per-IP limit on writes, so one visitor cannot use up the shared AI quota."""

    WRITES_PER_MINUTE = int(os.getenv("RATE_LIMIT_WRITES_PER_MIN", "40"))
    _hits: dict[str, list[float]] = {}

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or not scope["path"].startswith("/api") or not db.SESSIONS_ENABLED:
            return await self.app(scope, receive, send)
        headers = dict(scope["headers"])
        sid = headers.get(b"x-demo-session", b"").decode("latin-1") or "public-shared-demo"
        if not db.SESSION_ID_RE.match(sid):
            return await JSONResponse(status_code=400, content={"detail": "Invalid demo session id."})(scope, receive, send)
        if scope["method"] not in ("GET", "HEAD", "OPTIONS") and self._limited(headers, scope):
            return await JSONResponse(status_code=429, headers={"Retry-After": "30"},
                                      content={"detail": "Too many actions in a minute. Please slow down."})(scope, receive, send)
        token = db.set_session(sid)
        try:
            await asyncio.to_thread(self._prepare, sid)
            await self.app(scope, receive, send)
        finally:
            db.reset_session(token)

    def _limited(self, headers: dict, scope) -> bool:
        forwarded = headers.get(b"x-forwarded-for", b"").decode("latin-1").split(",")[0].strip()
        ip = forwarded or (scope["client"][0] if scope.get("client") else "?")
        now = time.monotonic()
        hits = [t for t in self._hits.get(ip, []) if now - t < 60]
        hits.append(now)
        self._hits[ip] = hits
        if len(self._hits) > 5000:  # forget idle addresses
            self._hits = {k: v for k, v in self._hits.items() if v and now - v[-1] < 60}
        return len(hits) > self.WRITES_PER_MINUTE

    @staticmethod
    def _prepare(sid: str) -> None:
        if db.session_ready(sid):
            return
        db.ensure_db()
        with db.get_conn() as conn:
            migrate(conn)
        db.mark_session_ready(sid)


@asynccontextmanager
async def lifespan(app: FastAPI):
    if config.write_rules_snapshot():
        print(f"Updated {config.RULES_SNAPSHOT_PATH.relative_to(config.ROOT)} from rules.yaml")
    if not db.SESSIONS_ENABLED:  # the hosted demo makes each visitor's database on their first request
        db.ensure_db()
        # An existing but empty live DB (schema only) is refilled from seed.db.
        with db.get_conn() as conn:
            empty = conn.execute("SELECT COUNT(*) FROM units").fetchone()[0] == 0
        if empty:
            db.reset_db()
        with db.get_conn() as conn:
            migrate(conn)
    UPLOADS_DIR.mkdir(exist_ok=True)
    # The models load in the background (about 10 s for the embedder), so the server answers straight away.
    # A request that needs a model before then waits for it, as on a cold start.
    warmup = asyncio.create_task(asyncio.to_thread(warmup_models))
    sweeper = asyncio.create_task(_sweep_loop())
    yield
    sweeper.cancel()
    warmup.cancel()


def warmup_models() -> None:
    log.info("Warming up AI models (embedder/Ollama)...")
    warmup_started = time.perf_counter()
    embedder_ready = tools.warmup_ai_models()
    ollama_enabled = any(ai_agents.enabled(name) for name in ai_agents.AGENTS)
    ollama_ready = not ollama_enabled
    try:
        ai_agents.warmup_ollama_models()
        ollama_ready = True
    except Exception as exc:
        log.warning("Ollama not reachable at startup, will attempt lazy load on first request: %s", exc)
    elapsed = time.perf_counter() - warmup_started
    if embedder_ready and ollama_ready:
        log.info("AI models warmed up successfully in %.2f seconds", elapsed)
    else:
        log.info("AI model warmup completed in %.2f seconds (embedder ready: %s; Ollama ready: %s)",
                 elapsed, embedder_ready, ollama_ready)


# The hosted demo hides the interactive API docs.
app = FastAPI(title="SimePhony API", lifespan=lifespan,
              **({"docs_url": None, "redoc_url": None, "openapi_url": None} if db.SESSIONS_ENABLED else {}))
# Added before CORS so it runs inside it: the 413 still carries CORS headers and the browser can show its message.
app.add_middleware(BodySizeLimit, max_bytes=MAX_BODY_BYTES)
app.add_middleware(DemoSession)  # inside CORS, so its 400/429 answers still carry the CORS headers
# CORS_ORIGINS: comma-separated extra web app addresses (the hosted demo's frontend URL).
EXTRA_ORIGINS = [o.strip().rstrip("/") for o in os.getenv("CORS_ORIGINS", "").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", *EXTRA_ORIGINS],
    max_age=600,  # browsers reuse the preflight, so the 3 s poll (with X-Demo-Session) is one request, not two
    allow_methods=["*"],
    allow_headers=["*"],
)
UPLOADS_DIR.mkdir(exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")
SAMPLE_PHOTOS_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/samples", StaticFiles(directory=SAMPLE_PHOTOS_DIR), name="samples")
app.include_router(app_router)


@app.exception_handler(sqlite3.OperationalError)
async def database_busy(request: Request, exc: sqlite3.OperationalError):
    if not db.is_busy(exc):
        raise exc
    return JSONResponse(
        status_code=503,
        headers={"Retry-After": "2"},
        content={"detail": "The system is busy saving another update. Please try again in a moment."},
    )


@app.get("/health")
def health():
    checks = {}
    try:
        if db.SESSIONS_ENABLED:  # no shared DB in the hosted demo: check the seed every visitor's copy is made from
            conn = sqlite3.connect(f"file:{db.SEED_DB_PATH.as_posix()}?mode=ro", uri=True)
            try:
                conn.execute("SELECT 1 FROM cases LIMIT 1").fetchone()
            finally:
                conn.close()
        else:
            with db.get_conn() as conn:
                conn.execute("SELECT 1").fetchone()
                conn.execute("SELECT 1 FROM cases LIMIT 1").fetchone()
        checks["database"] = {"status": "ok", "message": "Connected; schema available"}
    except Exception as exc:
        checks["database"] = {"status": "error", "message": str(exc)}

    from agents.simephony.llm_client import is_local
    if not is_local():
        # A cloud provider has no Ollama /api/tags, and pinging it on every health check would use up the
        # free quota, so only check that a key is set.
        host = urllib.parse.urlparse(os.getenv("LLM_BASE_URL", "")).hostname
        key = os.getenv("LLM_API_KEY", "").strip()
        checks["ollama"] = ({"status": "ok", "message": f"Cloud model at {host}; key set (not pinged)"} if key and key != "ollama"
                            else {"status": "error", "message": f"Cloud model at {host}, but LLM_API_KEY is not set"})
    else:
        _check_ollama(checks)

    try:
        checks["embedder"] = tools.embedder_health()
    except Exception as exc:
        checks["embedder"] = {"status": "error", "message": str(exc)}

    checks["agents_mode"] = {
        "status": "ok",
        "message": os.getenv("USE_AI_AGENTS", "").strip() or "false (default)",
    }

    status = "healthy" if all(
        checks[name]["status"] == "ok" for name in ("database", "ollama", "embedder")
    ) else "degraded"
    if checks["embedder"]["status"] == "disabled" and all(
        checks[name]["status"] == "ok" for name in ("database", "ollama")
    ):
        status = "healthy"
    return {"status": status, "checks": checks}


def _check_ollama(checks: dict) -> None:
    try:
        # /api/tags sits beside the OpenAI-compatible /v1 path, not under it
        server = os.getenv("LLM_BASE_URL", "http://localhost:11434/v1").rstrip("/").removesuffix("/v1")
        request = urllib.request.Request(f"{server}/api/tags")
        with urllib.request.urlopen(request, timeout=5) as response:
            payload = json.loads(response.read().decode("utf-8"))
        models = payload.get("models", []) if isinstance(payload, dict) else []
        if not isinstance(models, list) or not models:
            checks["ollama"] = {"status": "error", "message": "Running, but no models available"}
        else:
            checks["ollama"] = {"status": "ok", "message": f"Running, {len(models)} models available"}
    except (urllib.error.URLError, TimeoutError, OSError, ValueError) as exc:
        checks["ollama"] = {"status": "error", "message": f"Ollama not reachable: {exc}"}
    except Exception as exc:
        checks["ollama"] = {"status": "error", "message": f"Ollama check failed: {exc}"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        port=8001,
        reload=True,
        reload_dirs=[str(config.ROOT)],
        reload_includes=["rules.yaml"],
        reload_excludes=[str(config.ROOT / d) for d in ("frontend", ".venv", "data", "uploads", "tests")],
    )
