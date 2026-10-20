# Demo / batch data must point at photos that exist (folder moved to tests/data/test_cases/).
import ast
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
# Never committed to git (a deliberately blurry photo for case 5). Remove from here once someone adds it.
KNOWN_MISSING = {"tests/data/test_cases/images/blur.jpg"}


def test_every_case_photo_in_cases_json_exists():
    cases = json.loads((ROOT / "tests/data/test_cases/cases.json").read_text(encoding="utf-8"))
    missing = [c["image_path"] for c in cases
               if c.get("image_path") and c["image_path"] not in KNOWN_MISSING and not (ROOT / c["image_path"]).exists()]
    assert missing == []


def test_workflow_demo_photo_exists():
    source = (ROOT / "agents/simephony/workflow.py").read_text(encoding="utf-8")
    paths = [n.value for n in ast.walk(ast.parse(source))
             if isinstance(n, ast.Constant) and isinstance(n.value, str) and n.value.endswith((".jpg", ".jpeg", ".png"))]
    assert paths, "workflow.py demo should reference a sample photo"
    assert [p for p in paths if not (ROOT / p).exists()] == []
