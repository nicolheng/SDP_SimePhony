# Test Status Tracking

| Test File | Status | Last Run Result | Notes |
|-----------|--------|------------------|-------|
| tests/unit/test_triage.py | ✅ Passed | 3 passed | Fake LLM; slots test moved to booking |
| tests/unit/test_recurrence.py | ✅ Passed | 3 passed | |
| tests/unit/test_guardrails.py | ✅ Passed | 2 passed | Rewritten (file was truncated) |
| tests/unit/test_comms.py | ✅ Passed | 5 passed, 2 deselected | 2 `live_llm` tests (model wording) are deselected by default; INVALID contract tested with fake LLM |
| tests/unit/test_verification.py | ✅ Passed | 2 passed | Fake LLM |
| tests/integration/test_mcp_server.py | ✅ Passed | 10 passed | backend/tools.py + MCP server on a temp copy of seed.db (demo clock, web-app migrations); also checks the web app's /api/state renders tool-written cases. No Ollama, Gmail or live DB needed |
| tests/functional/test_scenarios.py | ⏳ Pending | - | Merged golden, initial_inspection, planted_story |
| tests/infra/test_system.py | ⏳ Pending | - | Merged concurrency, ollama, persistence |

Unit tests use the autouse `fake_llm` fixture (tests/conftest.py); run live-model tests with `-m live_llm`.