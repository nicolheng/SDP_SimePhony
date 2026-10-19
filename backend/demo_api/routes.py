"""HTTP endpoints. Every write returns the fresh state read back from the database."""
from typing import Literal

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

import db

from . import agents, workflow
from .migrate import migrate
from .state import build_state
from .workflow import Ctx, WorkflowError

router = APIRouter(prefix="/api", tags=["app"])


def _base(request: Request) -> str:
    return str(request.base_url).rstrip("/")


def _run(request: Request, action=None, *args) -> dict:
    """Run an action in one transaction, apply time rules, and return the state from the DB."""
    with db.get_conn() as conn:
        ctx = Ctx(conn)
        extra = {}
        try:
            if action:
                extra = action(ctx, *args) or {}
            workflow.sweep_signoffs(ctx)
        except WorkflowError as e:
            conn.rollback()
            raise HTTPException(status_code=400, detail=str(e)) from e
        except ValueError as e:  # e.g. no technician free
            conn.rollback()
            raise HTTPException(status_code=409, detail=str(e)) from e
        conn.commit()
        return {**extra, "state": build_state(Ctx(conn), _base(request))}


# ---------- reads ----------


@router.get("/state")
def get_state(request: Request):
    """Everything the screens need, read from data/simephony.db (time rules applied first)."""
    return _run(request)


@router.get("/slots/visit")
def visit_slots():
    """Inspection-visit start times in the next 2 weeks where at least one technician is free."""
    with db.get_conn() as conn:
        return {"slots": agents.any_free_visit_slots(Ctx(conn))}


@router.get("/cases/{case_id}/repair-options")
def repair_options(case_id: str):
    """Repair start times where a qualified worker is free for the whole estimated job."""
    with db.get_conn() as conn:
        ctx = Ctx(conn)
        try:
            return {"options": agents.repair_options(ctx, workflow.load_case(ctx, case_id))}
        except WorkflowError as e:
            raise HTTPException(status_code=404, detail=str(e)) from e


# ---------- buyer ----------


class NewReport(BaseModel):
    unit_id: str
    buyer_id: str
    description: str = Field(min_length=1, max_length=500)
    photo: str | None = None  # data URL
    slot: str


@router.post("/cases")
def create_case(body: NewReport, request: Request):
    return _run(request, workflow.submit_report, body.unit_id, body.buyer_id, body.description, body.photo, body.slot)


class FollowUp(BaseModel):
    answer: str = Field(min_length=1, max_length=500)
    slot: str | None = None


@router.post("/cases/{case_id}/follow-up")
def follow_up(case_id: str, body: FollowUp, request: Request):
    return _run(request, workflow.answer_follow_up, case_id, body.answer, body.slot)


class RepairBooking(BaseModel):
    start: str


@router.post("/cases/{case_id}/repair-booking")
def repair_booking(case_id: str, body: RepairBooking, request: Request):
    return _run(request, workflow.book_repair, case_id, body.start)


class Verification(BaseModel):
    result: Literal["FIXED", "NOT_FIXED", "CANNOT_VERIFY"]
    note: str = ""
    photo: str | None = None


@router.post("/cases/{case_id}/verification")
def verification(case_id: str, body: Verification, request: Request):
    return _run(request, workflow.submit_verification, case_id, body.result, body.note, body.photo)


class Reopen(BaseModel):
    description: str = ""
    photo: str


@router.post("/cases/{case_id}/reopen")
def reopen(case_id: str, body: Reopen, request: Request):
    return _run(request, workflow.reopen_case, case_id, body.description, body.photo)


# ---------- technician / subcontractor ----------


class Verdict(BaseModel):
    outcome: Literal["VALID", "INVALID"]
    note: str = Field(min_length=1, max_length=500)
    photo: str | None = None


@router.post("/cases/{case_id}/verdict")
def verdict(case_id: str, body: Verdict, request: Request):
    return _run(request, workflow.record_verdict, case_id, body.outcome, body.note, body.photo)


class Repaired(BaseModel):
    note: str = Field(min_length=1, max_length=500)
    photo: str | None = None


@router.post("/cases/{case_id}/repaired")
def repaired(case_id: str, body: Repaired, request: Request):
    return _run(request, workflow.mark_repaired, case_id, body.note, body.photo)


# ---------- SDP ----------


@router.post("/cases/{case_id}/developer-signoff")
def developer_signoff(case_id: str, request: Request):
    return _run(request, workflow.developer_signoff, case_id)


class Decision(BaseModel):
    approve: bool


@router.post("/approvals/{approval_id}/decision")
def decision(approval_id: str, body: Decision, request: Request):
    return _run(request, workflow.decide_approval, approval_id, body.approve)


# ---------- demo controls ----------


class Skip(BaseModel):
    days: float = Field(gt=0, le=60)


@router.post("/demo/skip-days")
def skip(body: Skip, request: Request):
    return _run(request, workflow.skip_days, body.days)


@router.post("/demo/rain")
def rain(request: Request):
    return _run(request, workflow.simulate_rain)


@router.post("/demo/reset")
def reset(request: Request):
    """Copy seed.db over simephony.db, re-apply migrations, return the fresh state."""
    db.reset_db()
    with db.get_conn() as conn:
        migrate(conn)
    return _run(request)
