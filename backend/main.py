"""FastAPI app: REST endpoints for the buyer, technician and SDP apps, plus /uploads static files."""
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

load_dotenv()

import db  # noqa: E402  (after load_dotenv so env paths apply)

UPLOADS_DIR = Path(__file__).resolve().parent.parent / "uploads"


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.ensure_db()
    UPLOADS_DIR.mkdir(exist_ok=True)
    yield


app = FastAPI(title="SimePhony API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/demo/reset")
def demo_reset():
    db.reset_db()
    return {"ok": True}


# TODO P3: buyer + technician endpoints (cases, photos, slots, verdicts, sign-off, reopen, SSE)
# TODO P4: SDP endpoints (KPIs, defect list, analytics, approvals, agent trace SSE)
