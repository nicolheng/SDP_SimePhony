# Test Status Tracking

| Test File | Status | Last Run Result | Notes |
|-----------|--------|------------------|-------|
| tests/unit/test_triage.py | ✅ Passed | 15 passed | Lowercase urgency, reads intake `urgency`, intake-high floor, injection stripping, LLM failure fallback |
| tests/unit/test_booking.py | ✅ Passed | 16 passed | Real case_id, sorted slots, all-reject loop ends in escalation, alternatives |
| tests/unit/test_comms.py | ✅ Passed | 52 passed, 2 deselected | Fixed replies for refused reopens, no old repair note in reopen/escalation emails, no email to a missing buyer, templates per situation. 2 `live_llm` wording tests |
| tests/unit/test_guardrails.py | ✅ Passed | 42 passed | Liability (incl. pay/sorry/liable/appeal, recurrence promises), unsafe-step scans, shared sign-off strip |
| tests/unit/test_verification.py | ✅ Passed | 38 passed, 1 deselected | Photo check, safe guide, new repair cycle resets "verified", wrong-status events keep the record |
| tests/unit/test_recurrence.py | ✅ Passed | 18 passed | Reopen gate with rejection codes, MYT calendar-date grace, missing closed_at refused without crashing |
| tests/unit/test_escalation.py | ✅ Passed | 5 passed | Occurrence threshold and stack cluster |
| tests/integration/test_mcp_server.py | ❌ 1 failing | 9 passed, 1 failed | backend/tools.py + MCP server on a temp copy of seed.db (xiaowen). All 10 pass on 8cdd230; `test_full_lifecycle_escalation_reuses_si002_and_reopen_grace` breaks after 2546933 (technician must now accept the job), not caused by P2 code |
| tests/integration/test_comms_guardrail_integration.py | ✅ Passed | 1 passed | Fake LLM |
| tests/integration/test_workflow.py | ✅ Passed | 17 passed | Event routing; unknown events end without running agents; past-grace reopen uses the buyer's reopen description |
| tests/functional/test_case_lifecycle.py | ✅ Passed | 10 passed, 1 deselected | One case driven event by event through `agent_app`. Scenario table in the docstring. The 2 bugs it found are fixed and kept as regression tests. 1 `live_llm` variant |
| tests/functional/test_scenarios.py | ✅ Passed | 1 passed (~30s) | P1's file; slow, it is not on the fake LLM |
| tests/infra/test_system.py | ✅ Passed | 2 passed, 1 deselected | Concurrency test uses a temp DB (never the live one). Ollama check is `live_llm` |

Run everything: `PYTHONPATH=. ./.venv/Scripts/python -m pytest tests -v -p no:cacheprovider`.

Unit tests use the autouse `fake_llm` fixture (tests/conftest.py); run live-model tests with `-m live_llm`.
