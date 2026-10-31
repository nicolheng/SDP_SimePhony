"""FastAPI app: REST endpoints for the buyer, technician and SDP apps, plus /uploads static files."""
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

load_dotenv()

import db  # noqa: E402  (after load_dotenv so env paths apply)
from demo_api import config  # noqa: E402
from demo_api.migrate import migrate, reset_demo  # noqa: E402
from demo_api.routes import router as app_router  # noqa: E402

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
    return {"ok": True}


@app.post("/demo/reset")
def demo_reset():
    """Same as POST /api/demo/reset (kept for older callers), without returning the state."""
    reset_demo()
    return {"ok": True}


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


# TODO P3: buyer + technician endpoints (cases, photos, slots, verdicts, sign-off, reopen, SSE)
# TODO P4: SDP endpoints (KPIs, defect list, analytics, approvals, agent trace SSE)
