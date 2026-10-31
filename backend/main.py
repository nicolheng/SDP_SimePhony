"""FastAPI app: REST endpoints for the buyer, technician and SDP apps, plus /uploads static files."""
import logging
import json
import os
import time
import urllib.error
import urllib.request
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

load_dotenv()

import db  # noqa: E402  (after load_dotenv so env paths apply)
from demo_api import config  # noqa: E402
import tools  # noqa: E402
from demo_api import ai_agents  # noqa: E402
from demo_api.migrate import migrate  # noqa: E402
from demo_api.routes import router as app_router  # noqa: E402

log = logging.getLogger("simephony.startup")
UPLOADS_DIR = Path(__file__).resolve().parent.parent / "uploads"
SAMPLE_PHOTOS_DIR = UPLOADS_DIR.parent / "data" / "sample_photos"


@asynccontextmanager
async def lifespan(app: FastAPI):
    if config.write_rules_snapshot():
        print(f"Updated {config.RULES_SNAPSHOT_PATH.relative_to(config.ROOT)} from rules.yaml")
    db.ensure_db()
    # An existing but empty live DB (schema only) is refilled from seed.db.
    with db.get_conn() as conn:
        empty = conn.execute("SELECT COUNT(*) FROM units").fetchone()[0] == 0
    if empty:
        db.reset_db()
    with db.get_conn() as conn:
        migrate(conn)
    UPLOADS_DIR.mkdir(exist_ok=True)
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
    yield


app = FastAPI(title="SimePhony API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)
UPLOADS_DIR.mkdir(exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")
SAMPLE_PHOTOS_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/samples", StaticFiles(directory=SAMPLE_PHOTOS_DIR), name="samples")
app.include_router(app_router)


@app.get("/health")
def health():
    checks = {}
    try:
        with db.get_conn() as conn:
            conn.execute("SELECT 1").fetchone()
            conn.execute("SELECT 1 FROM cases LIMIT 1").fetchone()
        checks["database"] = {"status": "ok", "message": "Connected; schema available"}
    except Exception as exc:
        checks["database"] = {"status": "error", "message": str(exc)}

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
