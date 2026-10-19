# Test Status Tracking

| Test File | Status | Last Run Result | Notes |
|-----------|--------|------------------|-------|
| tests/unit/test_triage.py | ✅ Passed | 3 passed | Fake LLM; slots test moved to booking |
| tests/unit/test_recurrence.py | ✅ Passed | 15 passed | Reopen gate, MYT calendar-date grace period, closed_at validation, escalation |
| tests/unit/test_escalation.py | ✅ Passed | 5 passed | Occurrence threshold and stack cluster |
| tests/unit/test_guardrails.py | ✅ Passed | 42 passed | Liability (incl. recurrence promises), unsafe-step scans, shared sign-off strip |
| tests/unit/test_booking.py | ✅ Passed | 4 passed | Includes no-slots escalation |
| tests/unit/test_comms.py | ✅ Passed | 14 passed, 2 deselected | 2 `live_llm` tests (model wording) are deselected by default; INVALID contract tested with fake LLM |
| tests/unit/test_verification.py | ✅ Passed | 36 passed, 1 deselected | Fake LLM; photo check, safe buyer guide, status preconditions, outcome node |
| tests/integration/test_mcp_server.py | ✅ Passed | 10 passed | backend/tools.py + MCP server on a temp copy of seed.db (demo clock, web-app migrations); also checks the web app's /api/state renders tool-written cases. No Ollama, Gmail or live DB needed |
| tests/integration/test_comms_guardrail_integration.py | ✅ Passed | 1 passed | Fake LLM |
| tests/integration/test_workflow.py | ✅ Passed | 12 passed | Event routing (fake LLM), prepare_new_case reroute, END on rejected verification events. Old manual demo script now behind `run_live_demo()` / `__main__` |
| tests/functional/test_scenarios.py | ⏳ Pending | - | Merged golden, initial_inspection, planted_story |
| tests/infra/test_system.py | ⏳ Pending | - | Merged concurrency, ollama, persistence |

Unit tests use the autouse `fake_llm` fixture (tests/conftest.py); run live-model tests with `-m live_llm`.