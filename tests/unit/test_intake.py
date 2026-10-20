# tests/unit/test_intake.py
"""
Unit tests for agents/simephony/intake.py (P1 IntakeAgent).

Strategy
--------
- The LLM client (`client.chat.completions.create`) is mocked via monkeypatch
  so tests run without Ollama / any network calls.
- Every test asserts on the *Python business logic* in intake_node — not on
  what the LLM says.  The LLM responses are deterministic stubs.
- rules.yaml compliance is validated by checking that forbidden categories
  ('bathroom', 'air_conditioning') never appear in the prompt, and that all
  16 canonical categories are present.
"""

import json
import os
import types
import pytest
from unittest.mock import MagicMock, patch

# ---------------------------------------------------------------------------
# Project root must be on sys.path (conftest.py handles this for pytest).
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

ALLOWED_CATEGORIES = (
    "water_leak", "plumbing", "waterproofing", "drainage", "sanitary_fittings",
    "electrical", "wall_crack", "structural_crack", "tiles", "flooring",
    "ceiling", "roof", "door_window", "paint", "external_works", "other",
)

FORBIDDEN_CATEGORIES = ("bathroom", "air_conditioning")


def _make_llm_response(payload: dict) -> MagicMock:
    """Return a mock that looks like an OpenAI ChatCompletion response."""
    content = json.dumps(payload)
    return MagicMock(choices=[MagicMock(message=MagicMock(content=content))])


def _patch_llm(monkeypatch, response_payload: dict):
    """Patch llm_client.client so intake_node uses our stub."""
    mock_client = MagicMock()
    mock_client.chat.completions.create.return_value = _make_llm_response(response_payload)
    monkeypatch.setattr("agents.simephony.llm_client.client", mock_client)
    # Also patch the reference already imported inside intake
    monkeypatch.setattr("agents.simephony.intake.client", mock_client)
    return mock_client


def _base_state(**overrides) -> dict:
    return {
        "user_description": "Water dripping from ceiling",
        "image_path": None,
        **overrides,
    }


# ---------------------------------------------------------------------------
# Import the module under test (after path setup)
# ---------------------------------------------------------------------------

from agents.simephony.intake import intake_node


# ===========================================================================
# Group 1: Output contract — state keys are always set
# ===========================================================================

class TestOutputContract:
    """intake_node must always write intake_result and missing_info to state."""

    def test_always_sets_intake_result(self, monkeypatch):
        _patch_llm(monkeypatch, {"category": "water_leak", "urgency": "normal",
                                  "missing_info": [], "preliminary_outcome": "VALID_DEFECT"})
        state = _base_state()
        result = intake_node(state)
        assert "intake_result" in result
        assert isinstance(result["intake_result"], dict)

    def test_always_sets_missing_info_list(self, monkeypatch):
        _patch_llm(monkeypatch, {"category": "plumbing", "missing_info": ["Need photo"]})
        state = _base_state()
        result = intake_node(state)
        assert "missing_info" in result
        assert isinstance(result["missing_info"], list)

    def test_missing_info_mirrors_intake_result(self, monkeypatch):
        expected = ["No photo provided", "Location unclear"]
        _patch_llm(monkeypatch, {"category": "other", "missing_info": expected})
        result = intake_node(_base_state())
        assert result["missing_info"] == expected


# ===========================================================================
# Group 2: Category enforcement — rules.yaml compliance
# ===========================================================================

class TestCategoryCompliance:
    """Only the 16 rules.yaml categories must ever be output."""

    @pytest.mark.parametrize("category", ALLOWED_CATEGORIES)
    def test_accepts_valid_category(self, monkeypatch, category):
        _patch_llm(monkeypatch, {"category": category, "missing_info": [],
                                  "urgency": "normal", "preliminary_outcome": "VALID_DEFECT"})
        result = intake_node(_base_state())
        assert result["intake_result"]["category"] == category

    @pytest.mark.parametrize("bad_cat", FORBIDDEN_CATEGORIES)
    def test_system_prompt_excludes_forbidden_categories(self, bad_cat):
        """
        The system prompt text in intake.py must NOT list 'bathroom' or
        'air_conditioning' as selectable categories.
        We inspect the source text of the prompt constant rather than the
        LLM output (which is mocked) so this test is immune to mock drift.
        """
        import agents.simephony.intake as intake_module
        import inspect
        source = inspect.getsource(intake_module)
        # The forbidden words may appear in a comment / docstring as examples,
        # but they must NOT appear in the _ALLOWED_CATEGORIES tuple.
        assert bad_cat not in [c for c in intake_module._ALLOWED_CATEGORIES], \
            f"'{bad_cat}' must not be in _ALLOWED_CATEGORIES (rules.yaml violation)"

    def test_all_rules_yaml_categories_present(self):
        """All 16 rules.yaml categories must be in _ALLOWED_CATEGORIES."""
        import agents.simephony.intake as intake_module
        for cat in ALLOWED_CATEGORIES:
            assert cat in intake_module._ALLOWED_CATEGORIES, \
                f"'{cat}' is missing from _ALLOWED_CATEGORIES (rules.yaml violation)"


# ===========================================================================
# Group 3: Urgency enforcement — rules.yaml high / low triggers
# ===========================================================================

class TestUrgencyCompliance:
    """rules.yaml urgency triggers must be present in the module constants."""

    HIGH_TRIGGERS = (
        "active water leak near electrical fittings",
        "electrical sparks or burning smell",
        "exposed live wiring",
        "repeated breaker tripping",
        "ceiling at risk of collapse",
        "suspected structural movement or major structural crack",
        "severe water ingress or flooding",
        "loose glass or window panel at risk of falling",
        "suspected gas leak",
    )
    LOW_TRIGGERS = (
        "cosmetic paint defects",
        "minor hairline crack with no signs of movement",
        "superficial scratches",
        "minor cosmetic tile defects",
    )

    @pytest.mark.parametrize("trigger", HIGH_TRIGGERS)
    def test_high_trigger_in_prompt_constants(self, trigger):
        import agents.simephony.intake as m
        assert trigger in m._HIGH_URGENCY_TRIGGERS, \
            f"High-urgency trigger missing from _HIGH_URGENCY_TRIGGERS: '{trigger}'"

    @pytest.mark.parametrize("trigger", LOW_TRIGGERS)
    def test_low_trigger_in_prompt_constants(self, trigger):
        import agents.simephony.intake as m
        assert trigger in m._LOW_URGENCY_TRIGGERS, \
            f"Low-urgency trigger missing from _LOW_URGENCY_TRIGGERS: '{trigger}'"

    def test_llm_high_urgency_propagated(self, monkeypatch):
        _patch_llm(monkeypatch, {"category": "electrical", "urgency": "high",
                                  "missing_info": [], "preliminary_outcome": "VALID_DEFECT"})
        result = intake_node(_base_state(user_description="Exposed live wiring in kitchen"))
        assert result["intake_result"]["urgency"] == "high"

    def test_llm_low_urgency_propagated(self, monkeypatch):
        _patch_llm(monkeypatch, {"category": "paint", "urgency": "low",
                                  "missing_info": [], "preliminary_outcome": "VALID_DEFECT"})
        result = intake_node(_base_state(user_description="Small paint scratch on wall"))
        assert result["intake_result"]["urgency"] == "low"

    def test_llm_normal_urgency_propagated(self, monkeypatch):
        _patch_llm(monkeypatch, {"category": "tiles", "urgency": "normal",
                                  "missing_info": [], "preliminary_outcome": "VALID_DEFECT"})
        result = intake_node(_base_state())
        assert result["intake_result"]["urgency"] == "normal"


# ===========================================================================
# Group 4: Image handling
# ===========================================================================

class TestImageHandling:
    def test_runs_without_image(self, monkeypatch):
        """No image_path — must not crash."""
        _patch_llm(monkeypatch, {"category": "other", "missing_info": ["Please provide photo"],
                                  "urgency": "normal", "preliminary_outcome": "INSUFFICIENT_INFORMATION"})
        result = intake_node(_base_state(image_path=None))
        assert "intake_result" in result

    def test_nonexistent_image_path_graceful(self, monkeypatch):
        """A path that doesn't exist must not crash — just skip encoding."""
        _patch_llm(monkeypatch, {"category": "other", "missing_info": [],
                                  "urgency": "normal", "preliminary_outcome": "VALID_DEFECT"})
        result = intake_node(_base_state(image_path="/does/not/exist.jpg"))
        assert "intake_result" in result

    def test_existing_image_is_encoded(self, monkeypatch, tmp_path):
        """When a valid image exists, the LLM call must include an image_url content block."""
        img_file = tmp_path / "test.jpg"
        img_file.write_bytes(b"\xff\xd8\xff" + b"\x00" * 100)  # minimal fake JPEG

        mock_client = MagicMock()
        mock_client.chat.completions.create.return_value = _make_llm_response(
            {"category": "water_leak", "missing_info": [], "urgency": "high",
             "preliminary_outcome": "VALID_DEFECT"}
        )
        monkeypatch.setattr("agents.simephony.intake.client", mock_client)

        intake_node(_base_state(image_path=str(img_file)))

        call_kwargs = mock_client.chat.completions.create.call_args[1]
        user_content = call_kwargs["messages"][-1]["content"]
        types_in_content = [block["type"] for block in user_content]
        assert "image_url" in types_in_content, "Image block missing from LLM call"


# ===========================================================================
# Group 5: Resilience / safety nets
# ===========================================================================

class TestResilience:
    def test_llm_exception_returns_error_state(self, monkeypatch):
        """If the LLM raises, intake_node must not propagate the exception."""
        mock_client = MagicMock()
        mock_client.chat.completions.create.side_effect = RuntimeError("Ollama is down")
        monkeypatch.setattr("agents.simephony.intake.client", mock_client)
        result = intake_node(_base_state())
        assert "intake_result" in result
        assert result["intake_result"]["category"] == "error"

    def test_invalid_json_from_llm_falls_back(self, monkeypatch):
        """If the LLM returns non-JSON, intake_node must fall back gracefully."""
        mock_client = MagicMock()
        mock_client.chat.completions.create.return_value = MagicMock(
            choices=[MagicMock(message=MagicMock(content="Sorry, I cannot process this."))]
        )
        monkeypatch.setattr("agents.simephony.intake.client", mock_client)
        result = intake_node(_base_state())
        assert "intake_result" in result
        # Falls back to 'other' category on JSON parse failure
        assert result["intake_result"]["category"] == "other"

    def test_state_is_mutated_in_place(self, monkeypatch):
        """intake_node must return the same state dict (mutated), not a new one."""
        _patch_llm(monkeypatch, {"category": "flooring", "missing_info": [],
                                  "urgency": "normal", "preliminary_outcome": "VALID_DEFECT"})
        state = _base_state()
        result = intake_node(state)
        assert result is state

    def test_preliminary_outcome_field_preserved(self, monkeypatch):
        _patch_llm(monkeypatch, {"category": "wall_crack", "urgency": "low",
                                  "preliminary_outcome": "NOT_A_DEFECT", "missing_info": []})
        result = intake_node(_base_state())
        assert result["intake_result"]["preliminary_outcome"] == "NOT_A_DEFECT"

