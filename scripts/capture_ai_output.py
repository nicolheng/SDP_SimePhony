"""Show each AI agent's raw model reply next to the answer the backend makes of it, for one case.

    python scripts/capture_ai_output.py C-0015                 # a case in data/simephony.db
    python scripts/capture_ai_output.py C-0009 --db data/seed.db
    python scripts/capture_ai_output.py C-0015 --out ai_output.json

Runs the web app's own agent calls (backend/demo_api/ai_agents.py: intake, similar, triage, comms) with the real
models, and records every reply Ollama sends back. Prints, per agent:
- raw: the model's text exactly as returned
- polished: what ai_agents.py returns after the schema check, rules.yaml corrections and shaping
- rule-based: the stand-in from backend/demo_api/agents.py, which is what the web app saves today

The app never stores raw replies (invalid model text must not reach the DB), so this script is the way to see them.
It works on a temporary copy of the database, so the case and the live data are left as they were.
"""
import argparse
import json
import os
import shutil
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
for stream in (sys.stdout, sys.stderr):
    try:
        stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("case_id")
    parser.add_argument("--db", default="data/simephony.db", help="database to copy (default: data/simephony.db)")
    parser.add_argument("--out", help="also save the full capture as JSON here")
    args = parser.parse_args()

    source = (ROOT / args.db).resolve()
    if not source.exists():
        raise SystemExit(f"No database at {source}. Start the backend once, or pass --db data/seed.db.")
    tmp = Path(tempfile.mkdtemp(prefix="simephony-capture-"))
    shutil.copyfile(source, tmp / "capture.db")
    os.environ.update(DB_PATH=str(tmp / "capture.db"), USE_AI_AGENTS="all", EMAIL_ENABLED="false",
                      EMBEDDINGS_ENABLED="false")
    sys.path[:0] = [str(ROOT), str(ROOT / "backend")]

    from openai.resources.chat.completions import Completions

    calls = []
    real_create = Completions.create

    def recording_create(self, *a, **kw):
        start = time.perf_counter()
        resp = real_create(self, *a, **kw)
        msgs = kw.get("messages") or []
        calls.append({
            "model": kw.get("model"),
            "seconds": round(time.perf_counter() - start, 1),
            "json_mode": bool(kw.get("response_format")),
            "photo": any(isinstance(m.get("content"), list) and any(p.get("type") == "image_url" for p in m["content"])
                         for m in msgs),
            "raw": resp.choices[0].message.content,
        })
        return resp

    Completions.create = recording_create

    import db
    from demo_api import agents as standins
    from demo_api import ai_agents
    from demo_api.workflow import Ctx, load_case

    report = {"case_id": args.case_id, "steps": []}
    with db.get_conn() as conn:
        ctx = Ctx(conn)
        case = load_case(ctx, args.case_id)
        report["description"] = case["description"]
        report["saved_case"] = {k: case.get(k) for k in ("status", "category", "sub_category", "location_in_unit",
                                                          "urgency", "summary")}
        agents = [
            ("IntakeAgent", lambda: ai_agents.intake(ctx, case["description"] or "", None, bool(ctx.photo_kinds(args.case_id)),
                                                     args.case_id),
             lambda: standins.intake(case["description"] or "", bool(ctx.photo_kinds(args.case_id)))),
            ("SimilarDefectAgent", lambda: ai_agents.similar(ctx, case), lambda: standins.similar(ctx, case)),
            ("TriageAgent", lambda: ai_agents.triage(ctx, case, None), lambda: standins.triage(ctx, case, None)),
            ("CommsAgent (received)", lambda: ai_agents.comms(ctx, "received", case),
             lambda: standins.comms(ctx, "received", case, {})),
        ]
        for name, ai_call, rule_call in agents:
            before = len(calls)
            try:
                polished = ai_call()
            except Exception as e:  # noqa: BLE001 (show it and carry on with the next agent)
                polished = {"error": f"{type(e).__name__}: {e}"}
            try:
                rule_based = rule_call()
            except Exception as e:  # noqa: BLE001
                rule_based = {"error": f"{type(e).__name__}: {e}"}
            report["steps"].append({"agent": name, "raw_calls": calls[before:], "polished": polished,
                                    "rule_based": rule_based})

    show = lambda v: json.dumps(v, ensure_ascii=False, indent=2, default=str)  # noqa: E731
    print(f"Case {args.case_id}: {report['description']}")
    print(f"Saved on the case: {show(report['saved_case'])}")
    for step in report["steps"]:
        print("\n" + "=" * 78 + f"\n{step['agent']}\n" + "=" * 78)
        if not step["raw_calls"]:
            print("raw: (no model call)")
        for c in step["raw_calls"]:
            print(f"raw ({c['model']}, {c['seconds']} s{', photo' if c['photo'] else ''}"
                  f"{', JSON mode' if c['json_mode'] else ''}):\n{c['raw']}")
        print(f"\npolished:\n{show(step['polished'])}")
        print(f"\nrule-based:\n{show(step['rule_based'])}")
    if args.out:
        Path(args.out).write_text(show(report), encoding="utf-8")
        print(f"\nSaved the full capture to {args.out}")
    shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
