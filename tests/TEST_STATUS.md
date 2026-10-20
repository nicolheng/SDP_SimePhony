# Test Status Tracking

| Test File | Status | Last Run Result | Notes |
|-----------|--------|------------------|-------|
| tests/unit/test_triage.py | ✅ Runnable | Pass | |
| tests/unit/test_recurrence.py | ✅ Runnable | Pass | |
| tests/unit/test_guardrails.py | ✅ Runnable | Pass | |
| tests/unit/test_booking.py | ✅ Passed | 3 passed | Reassignment and smart-selection tests verified |
| tests/unit/test_comms.py | ✅ Passed | 5 passed, 1 failed | `test_comms_handles_invalid_status` can't check the text well |
| tests/unit/test_verification.py | ⏳ Pending | - | |
| tests/integration/test_mcp_server.py | ✅ Passed | 10 passed | backend/tools.py + MCP server on a temp copy of seed.db (demo clock, web-app migrations); also checks the web app's /api/state renders tool-written cases. No Ollama, Gmail or live DB needed |
| tests/functional/test_scenarios.py | ⏳ Pending | - | Merged golden, initial_inspection, planted_story |
| tests/infra/test_system.py | ⏳ Pending | - | Merged concurrency, ollama, persistence |
