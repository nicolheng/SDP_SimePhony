"""HTTP endpoints. Every write returns the fresh state read back from the database."""
from typing import Annotated, Literal
from urllib.parse import quote

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request
from pydantic import BaseModel, Field
from starlette.responses import Response

import db
import tools
from calendar_utils import generate_ics
from agents.simephony.analytics import generate_weekly_digest

from . import agents, config, ai_agents, workflow
from .migrate import reset_demo
from .state import build_state
from .workflow import Ctx, WorkflowError

router = APIRouter(prefix="/api", tags=["app"])

UPLOADED_IMAGE = r"^data:image/(png|jpe?g|webp);base64,"
MAX_PHOTO_CHARS = 4 * -(-tools.MAX_PHOTO_BYTES // 3) + 64
MAX_BODY_BYTES = MAX_PHOTO_CHARS + 64 * 1024

Photo = Annotated[str, Field(max_length=MAX_PHOTO_CHARS, pattern=UPLOADED_IMAGE)]
RecordId = Annotated[str, Field(min_length=1, max_length=64)]  # unit, buyer, technician ids
Timestamp = Annotated[str, Field(max_length=64)]  # ISO date-time picked from a slot list
Text = Annotated[str, Field(max_length=500)]


def _base(request: Request) -> str:
    return str(request.base_url).rstrip("/")


def _run(request: Request, action=None, *args, background_tasks: BackgroundTasks | None = None) -> dict:
    """Run an action in one transaction, apply time rules, and return the state from the DB."""
    with db.write_conn() as conn:
        ctx = Ctx(conn, defer_agents=background_tasks is not None)
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
        if background_tasks and ctx.deferred_rain_cases:
            for case_id in ctx.deferred_rain_cases:
                background_tasks.add_task(workflow.process_rain_agents, case_id)
        if background_tasks and ctx.after_click:
            background_tasks.add_task(workflow.run_after_click, list(ctx.after_click))
        if background_tasks and ctx.deferred_answers:
            for case_id, answer in ctx.deferred_answers:
                background_tasks.add_task(workflow.process_new_report, case_id, answer)
        if background_tasks and ctx.deferred_reports:
            for case_id in ctx.deferred_reports:
                background_tasks.add_task(workflow.process_new_report, case_id)
        if background_tasks and ctx.deferred_agent_steps:
            case_id = extra.get("caseId") or next(
                (step.get("case_id") for step in ctx.deferred_agent_steps if step.get("case_id")),
                None,
            )
            if case_id:
                background_tasks.add_task(ai_agents.run_background_steps, case_id, ctx.deferred_agent_steps)
        # Send queued fallback emails first so a slow Google API cannot delay them.
        if conn.execute("SELECT 1 FROM outbox WHERE status = 'queued' LIMIT 1").fetchone():
            if background_tasks:
                background_tasks.add_task(tools.deliver_queued_emails)
            else:
                tools.deliver_queued_emails()
        if ctx.deferred_calendar_cases:
            from calendar_service import create_booking_invitation

            for case_id in ctx.deferred_calendar_cases:
                if background_tasks:
                    background_tasks.add_task(create_booking_invitation, case_id)
                else:
                    create_booking_invitation(case_id)
        return {**extra, "state": build_state(Ctx(conn), _base(request))}


# ---------- reads ----------


@router.get("/calendar/{case_id}.ics")
def download_calendar_event(case_id: str):
    """Download the currently scheduled visit or repair as an iCalendar file."""
    try:
        event = tools.get_calendar_event(case_id)
    except tools.ToolError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    if event is None:
        raise HTTPException(status_code=409, detail="This case has no scheduled visit or repair.")
    content = generate_ics(
        event["case_id"],
        event["summary"],
        event["start"],
        end=event["end"],
        description=event["description"],
        job=event["job"],
    )
    return Response(
        content=content,
        media_type="text/calendar; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{quote(case_id, safe="")}.ics"'},
    )


@router.get("/state")
def get_state(request: Request):
    """Everything the screens need, read from data/simephony.db. Read-only, so the 3 s poll never takes the write
    lock: the time rules run on writes, on "Skip days" and in main.py's periodic sweep."""
    with db.get_conn() as conn:
        return {"state": build_state(Ctx(conn), _base(request))}


@router.get("/rules")
def get_rules():
    """Business rules from rules.yaml, the single source the web app reads them from."""
    return config.public_rules()


@router.get("/analytics/weekly-digest")
def weekly_digest():
    """Generate an LLM narrative from defect metrics computed directly from the database."""
    return {"digest": generate_weekly_digest()}


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
    unit_id: RecordId
    buyer_id: RecordId
    description: str = Field(min_length=1, max_length=500)
    photo: Photo | None = None
    slot: Timestamp | None = None  # optional (#79): with no time, the earliest free technician is booked


@router.post("/cases")
def create_case(body: NewReport, request: Request, background_tasks: BackgroundTasks):
    return _run(request, workflow.submit_report, body.unit_id, body.buyer_id, body.description, body.photo, body.slot,
                background_tasks=background_tasks)


class FollowUp(BaseModel):
    answer: str = Field(min_length=1, max_length=500)
    slot: Timestamp | None = None
    photo: Photo | None = None


@router.post("/cases/{case_id}/follow-up")
def follow_up(case_id: str, body: FollowUp, request: Request, background_tasks: BackgroundTasks):
    return _run(request, workflow.answer_follow_up, case_id, body.answer, body.photo, body.slot,
                background_tasks=background_tasks)


class RepairBooking(BaseModel):
    start: Timestamp


@router.post("/cases/{case_id}/repair-booking")
def repair_booking(case_id: str, body: RepairBooking, request: Request, background_tasks: BackgroundTasks):
    return _run(request, workflow.book_repair, case_id, body.start, background_tasks=background_tasks)


class Verification(BaseModel):
    result: Literal["FIXED", "NOT_FIXED", "CANNOT_VERIFY"]
    note: Text = ""
    photo: Photo | None = None


@router.post("/cases/{case_id}/verification")
def verification(case_id: str, body: Verification, request: Request, background_tasks: BackgroundTasks):
    return _run(request, workflow.submit_verification, case_id, body.result, body.note, body.photo,
                background_tasks=background_tasks)


class UnitSignoff(BaseModel):
    note: Text = ""


@router.post("/units/{unit_id}/signoff")
def unit_signoff(unit_id: str, body: UnitSignoff, request: Request):
    """Buyer signs off the whole unit once every defect is approved by SDP and checked Fixed (#74)."""
    return _run(request, workflow.sign_off_unit, unit_id, body.note)


class Rating(BaseModel):
    rating: int = Field(ge=1, le=5)
    comment: str = Field(default="", max_length=500)


@router.post("/cases/{case_id}/rating")
def rating(case_id: str, body: Rating, request: Request):
    """Buyer's satisfaction rating for one case (older per-case flow; the web app rates per unit)."""
    return _run(request, workflow.rate_case, case_id, body.rating, body.comment)


@router.post("/units/{unit_id}/rating")
def unit_rating(unit_id: str, body: Rating, request: Request):
    """Buyer's satisfaction rating for their latest unit sign-off, asked right after it."""
    return _run(request, workflow.rate_unit, unit_id, body.rating, body.comment)


class Reopen(BaseModel):
    description: Text = ""
    photo: Photo


@router.post("/cases/{case_id}/reopen")
def reopen(case_id: str, body: Reopen, request: Request, background_tasks: BackgroundTasks):
    return _run(request, workflow.reopen_case, case_id, body.description, body.photo, background_tasks=background_tasks)


# ---------- technician / subcontractor ----------


class Verdict(BaseModel):
    outcome: Literal["VALID", "INVALID"]
    note: str = Field(min_length=1, max_length=500)
    photo: Photo | None = None
    repair_hours: Literal[2, 4, 8] | None = None  # technician's expected repair duration (VALID only)


@router.post("/cases/{case_id}/verdict")
def verdict(case_id: str, body: Verdict, request: Request, background_tasks: BackgroundTasks):
    return _run(request, workflow.record_verdict, case_id, body.outcome, body.note, body.photo, body.repair_hours,
                background_tasks=background_tasks)


class Repaired(BaseModel):
    note: str = Field(min_length=1, max_length=500)
    photo: Photo | None = None


@router.post("/cases/{case_id}/repaired")
def repaired(case_id: str, body: Repaired, request: Request, background_tasks: BackgroundTasks):
    return _run(request, workflow.mark_repaired, case_id, body.note, body.photo, background_tasks=background_tasks)


class Worker(BaseModel):
    technician_id: RecordId


@router.post("/cases/{case_id}/accept")
def accept(case_id: str, body: Worker, request: Request, background_tasks: BackgroundTasks):
    return _run(request, workflow.accept_job, case_id, body.technician_id, background_tasks=background_tasks)


class HandOver(BaseModel):
    technician_id: RecordId
    reason: str = Field(min_length=1, max_length=300)


@router.post("/cases/{case_id}/handover")
def handover(case_id: str, body: HandOver, request: Request, background_tasks: BackgroundTasks):
    return _run(request, workflow.hand_over, case_id, body.technician_id, body.reason, background_tasks=background_tasks)


# ---------- SDP ----------


@router.post("/cases/{case_id}/developer-signoff")
def developer_signoff(case_id: str, request: Request, background_tasks: BackgroundTasks):
    return _run(request, workflow.developer_signoff, case_id, background_tasks=background_tasks)


class RepairRejection(BaseModel):
    note: str = Field(min_length=1, max_length=500)


@router.post("/cases/{case_id}/reject-repair")
def reject_repair(case_id: str, body: RepairRejection, request: Request, background_tasks: BackgroundTasks):
    """SDP refuses the developer sign-off: the repair needs more work and the buyer books a new repair."""
    return _run(request, workflow.reject_repair, case_id, body.note, background_tasks=background_tasks)


class ReviewDecision(BaseModel):
    approve: bool
    note: str = Field(default="", max_length=500)


@router.post("/cases/{case_id}/review-decision")
def review_decision(case_id: str, body: ReviewDecision, request: Request, background_tasks: BackgroundTasks):
    """SDP staff approve or reject a case an AI agent held for review (PENDING_REVIEW)."""
    return _run(request, workflow.decide_review, case_id, body.approve, body.note, background_tasks=background_tasks)


class Decision(BaseModel):
    approve: bool


@router.post("/approvals/{approval_id}/retry-brief")
def retry_brief(approval_id: str, request: Request, background_tasks: BackgroundTasks):
    """Try the inspection brief and booking again after they failed following an approval."""
    return _run(request, workflow.retry_extra_inspection, approval_id, background_tasks=background_tasks)


@router.post("/approvals/{approval_id}/decision")
def decision(approval_id: str, body: Decision, request: Request, background_tasks: BackgroundTasks):
    return _run(request, workflow.decide_approval, approval_id, body.approve, background_tasks=background_tasks)


# ---------- demo controls ----------


class Skip(BaseModel):
    days: float = Field(gt=0, le=60)


@router.post("/demo/skip-days")
def skip(body: Skip, request: Request):
    return _run(request, workflow.skip_days, body.days)


@router.post("/demo/rain")
def rain(request: Request, background_tasks: BackgroundTasks):
    return _run(request, workflow.simulate_rain, background_tasks=background_tasks)


@router.post("/demo/reset")
def reset(request: Request):
    """Copy seed.db over simephony.db, delete uploaded photos, re-apply migrations, return the fresh state."""
    reset_demo()
    return _run(request)
