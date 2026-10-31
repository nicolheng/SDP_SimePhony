# rules.yaml is the single source of the business rules: GET /api/rules serves it, and the backend rewrites the
# web app's offline copy (frontend/src/lib/rules.snapshot.json) on every start.
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from demo_api import config  # noqa: E402


def test_committed_snapshot_matches_rules_yaml():
    # Fails when rules.yaml was edited but the snapshot wasn't regenerated: start the backend once, then commit it.
    assert config.RULES_SNAPSHOT_PATH.read_text(encoding="utf-8") == config.rules_snapshot_text()


def test_rules_endpoint_serves_rules_yaml():
    from fastapi.testclient import TestClient

    from demo_api.routes import router
    from fastapi import FastAPI

    app = FastAPI()
    app.include_router(router)
    rules = TestClient(app).get("/api/rules").json()
    assert rules["gracePeriodDays"] == config.RULES["grace_period_days"]
    assert rules["slotTimes"] == config.RULES["scheduling"]["slot_times"]
    assert rules["repairPlan"] == config.RULES["repair_plan"]
