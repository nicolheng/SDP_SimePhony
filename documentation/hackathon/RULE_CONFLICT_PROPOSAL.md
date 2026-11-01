# Proposal: stop holding cases when the rules only correct the urgency

**For:** Tan Syn Yee (IntakeAgent), Nicol Heng Si Yi (TriageAgent, guardrails)
**Also affects:** Lim Xiao Wen (SDP console: fewer cases in Approvals), Phoebe Angelina Surin (buyer app: fewer "Being checked" cases)
**Status:** implemented. Urgency corrections remain logged as guardrail hits but no longer trigger human review.

---

## 1. How a held case works today (already built)

When an AI agent is unsure, the backend pauses the case as `PENDING_REVIEW` so SDP staff can check it. Example:

1. A buyer at A-12-08 reports *"Something wrong near the window, wall looks strange"* with a photo.
2. IntakeAgent answers "wall crack" but scores itself **0.45**, below the 0.7 threshold, so it is unsure.
3. The case is paused as `PENDING_REVIEW`. No technician is booked.
   - The buyer sees **"Being checked"**: *"Our team is checking the details of your case."* (no mention of AI).
   - SDP staff see a banner on **Overview** and the case under **Approvals → Held for Review**, with the agent, its
     reason (*"low confidence (score: 0.45)"*) and a confidence bar.
4. Staff decide:
   - **Approve & continue** → the inspection visit is booked and the case carries on as normal.
   - **Reject** (reason required) → the case closes as *Not a defect*, and the buyer is told the reason.

This part is fine. The problem is **which** cases get paused.

## 2. The problem: plain reports get paused too

`agents/simephony/review.py` pauses a case for any of these reasons:

| Reason | Meaning |
|---|---|
| Low confidence | The model's `confidence_score` is below 0.7 |
| Rule conflict | The model's answer disagreed with the rules in `rules.yaml` |
| Abstain | The agent said it can't decide |

"Rule conflict" is set in two places, and both count an **urgency correction** as a conflict:

### Example: a plain ceiling leak

> Buyer: *"Ceiling leaking in my bedroom."*
>
> 1. **IntakeAgent** (model): category `water_leak`, urgency **high**, confidence 0.95.
> 2. The rules (`rules.yaml` urgency lists, applied in `intake.py`) find no high-urgency trigger (no flooding,
>    sparks, collapse…), so they set urgency to **normal**.
> 3. Model said "high", rules said "normal" → `rule_conflict = True` → **case paused**.
> 4. If staff approve it, **TriageAgent** can do the same: the model says "high" without a matching high rule,
>    triage keeps "normal" → `rule_conflict = True` → **paused again**.

The rules had already decided the urgency correctly, so there was nothing for a person to check. This is what
happened in the live run of `scripts/demo_flow.py --live --scenario 1`. If ordinary leaks are paused, staff spend
their time approving routine reports, and on stage it looks like the AI can't handle a basic case.

## 3. The proposal

| Pause the case when… | Today | Proposed |
|---|---|---|
| Confidence below 0.7 | Yes | **Yes** (unchanged) |
| Model and rules disagree on **what the defect is** (e.g. model says `electrical`, rules say `water_leak`) | Yes | **Yes** |
| Model left the category as `other` (or answered outside the list) and the keyword check filled it in | Yes | **No**: filling a gap isn't a disagreement |
| Rules corrected the **urgency** only | Yes | **No**: `rules.yaml` decides urgency anyway |

Nothing becomes less safe:

- The rules still set the final category and urgency, exactly as today.
- Every correction is still recorded as a guardrail hit (`category_guardrail_triggered` /
  `urgency_guardrail_triggered`) and shows in the SDP **Agent Trace**.
- Low confidence still pauses the case.

## 4. What to edit

### 4.1 IntakeAgent: `agents/simephony/intake.py` (owner: Tan Syn Yee)

Around **line 292–299**, today:

```python
    if parsed_intake.get("category") != original_category:
        record_guardrail_hit("category_guardrail_triggered")
    if parsed_intake.get("urgency") != original_urgency:
        record_guardrail_hit("urgency_guardrail_triggered")
    rule_conflict = (
        parsed_intake.get("category") != original_category
        or parsed_intake.get("urgency") != original_urgency
    )
```

Change to (keep both guardrail hits; only the last statement changes):

```python
    if parsed_intake.get("category") != original_category:
        record_guardrail_hit("category_guardrail_triggered")
    if parsed_intake.get("urgency") != original_urgency:
        record_guardrail_hit("urgency_guardrail_triggered")
    # A rule conflict means the model and the rules disagree on WHAT the defect is. Filling in a category the
    # model left as "other" (or answered outside the list) is not a disagreement, and urgency is always set by
    # rules.yaml, so neither pauses the case; both are still recorded above as guardrail hits.
    model_was_specific = original_category in _ALLOWED_CATEGORIES and original_category != "other"
    rule_conflict = model_was_specific and parsed_intake.get("category") != original_category
```

Notes:

- `original_category` and `original_urgency` are set at **line 242–243**; nothing else changes there.
- `_ALLOWED_CATEGORIES` is already used at **line 252**.
- `rule_conflict` is passed to `flag_for_human_review` at **line 340**; leave that call as it is.

### 4.2 TriageAgent: `agents/simephony/triage.py` (owner: Nicol Heng Si Yi)

Around **line 116–120**, today:

```python
    if intake_urgency == "high":
        urgency, matched_rule = "high", None  # the model can raise urgency, never lower an intake "high"
    rule_conflict = llm_urgency is not None and urgency != llm_urgency
    if rule_conflict:
        record_guardrail_hit("urgency_guardrail_triggered")
```

Change to:

```python
    if intake_urgency == "high":
        urgency, matched_rule = "high", None  # the model can raise urgency, never lower an intake "high"
    # The rules decide urgency; a correction is recorded, not a reason to pause the case.
    if llm_urgency is not None and urgency != llm_urgency:
        record_guardrail_hit("urgency_guardrail_triggered")
```

And around **line 139–145**, today:

```python
    if not state.get("_structured_output_error"):
        flag_for_human_review(
            state,
            "TriageAgent",
            confidence_score,
            rule_conflict=rule_conflict,
        )
```

Change to (triage only pauses on low confidence now):

```python
    if not state.get("_structured_output_error"):
        flag_for_human_review(state, "TriageAgent", confidence_score)
```

### 4.3 Test: `tests/unit/test_triage.py` (owner: Nicol Heng Si Yi)

`test_triage_guardrail_disagreement_abstains_for_human_review` (**line 87–97**) checks the old behaviour. Replace it with:

```python
def test_triage_urgency_correction_is_logged_not_held(sample_state, fake_llm):
    fake_llm.responses = [_reply("high", confidence=0.95)]
    state = _state(sample_state, case_id="C-NEW",
                   intake_result={"category": "water_leak", "urgency": "normal"})

    result = triage_node(state)

    assert result["triage_result"]["urgency"] == "normal"  # the rules still decide
    assert not result.get("needs_human_review")
```

Add one IntakeAgent test to `tests/unit/test_intake.py` (owner: Tan Syn Yee), next to
`test_low_confidence_intake_requests_human_review`, using the same `_patch_llm` and `_base_state` helpers:

```python
    def test_urgency_correction_does_not_request_human_review(self, monkeypatch):
        _patch_llm(monkeypatch, {
            "category": "water_leak",
            "urgency": "high",  # rules.yaml has no high trigger for a plain leak, so it becomes normal
            "missing_info": [],
            "preliminary_outcome": "VALID_DEFECT",
            "confidence_score": 0.95,
        })

        result = intake_node(_base_state(case_id="C-NEW", user_description="Ceiling leaking in my bedroom"))

        assert result["intake_result"]["urgency"] == "normal"
        assert not result.get("needs_human_review")
```

These tests don't need changes: the low-confidence tests in `test_intake.py`, `test_triage.py` and
`test_confidence_review.py` (low confidence still pauses), and `tests/integration/test_web_ai_flow.py` line 266–267
(guardrail hits are still recorded).

### 4.4 Docs

| File | Change |
|---|---|
| `CONTRACTS.md` §1, `PENDING_REVIEW` row | "(confidence below 0.7, or a rule conflict)" → "(confidence below 0.7, or the AI and the rules disagree on the category)" |
| `HACKATHON_PITCH_SCRIPTS_AND_FIELD_RESEARCH.md` | "Confidence thresholds and disagreement with guardrails can route a case to `PENDING_REVIEW`" → "Low confidence, or the AI and the rules disagreeing on what the defect is, routes a case to `PENDING_REVIEW`; urgency is always set by the rules" |

`agents/simephony/review.py`, the backend and the frontend need **no** changes.

## 5. How to check it

```bash
pytest tests/unit/test_triage.py tests/unit/test_intake.py tests/unit/test_confidence_review.py
pytest                                   # whole suite
python scripts/demo_flow.py --live --scenario 1   # with Ollama: the plain ceiling leak should no longer be held
```

In the web app (`USE_AI_AGENTS=true`, Ollama running): report *"Ceiling leaking in my bedroom"* as the buyer.
Expected: the inspection visit is booked straight away. In **SDP → Agent Trace**, the IntakeAgent step still lists
`urgency_guardrail_triggered` under guardrail hits.

## 6. Outcome

Urgency-only corrections no longer hold cases. Low-confidence decisions and disagreements about the defect category still route to human review. The specified tests and documentation updates are included.
