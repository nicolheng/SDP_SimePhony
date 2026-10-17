"""New-case flow: SequentialAgent(IntakeAgent → SimilarDefectAgent → TriageAgent).

Comms, Recurrence and InitialInspection agents are event-driven and will live alongside these.
"""
import os

from google.adk.agents import LlmAgent, SequentialAgent

from .stub_tools import assign_technician, find_similar_cases, get_available_slots, get_unit

MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

# P1
intake_agent = LlmAgent(
    name="IntakeAgent",
    model=MODEL,
    instruction=(
        "You receive a defect report (photo + text in English, Bahasa Malaysia or Manglish). "
        "Return JSON with: category, sub_category, location_in_unit, summary, severity_hint, "
        "mentions_previous_issue, missing_info[]. If key info is missing, ask one follow-up question."
    ),
    tools=[get_unit],
    output_key="intake",
)

# P1
similar_defect_agent = LlmAgent(
    name="SimilarDefectAgent",
    model=MODEL,
    instruction=(
        "Given the intake result {intake}, find related past cases (same unit, floor, stack, "
        "category or contractor). Return each with a reason, plus recurrence_count."
    ),
    tools=[find_similar_cases],
    output_key="similar",
)

# P2
triage_agent = LlmAgent(
    name="TriageAgent",
    model=MODEL,
    instruction=(
        "Using {intake} and {similar}, set urgency and map category to skill per rules.yaml, "
        "pick a free technician in the buyer's slot (or offer 3 alternatives), and explain the choice in one line."
    ),
    tools=[get_available_slots, assign_technician],
    output_key="triage",
)

root_agent = SequentialAgent(
    name="NewCaseFlow",
    sub_agents=[intake_agent, similar_defect_agent, triage_agent],
)
