# Issue #83: no personal data in prompts sent to a cloud model. Names, emails, phone numbers and unit numbers
# are swapped for placeholders before the call, and put back into the answer.
import json

import pytest

from agents.simephony import privacy
from agents.simephony.privacy import Redactor
from agents.simephony.structured_output import chat_json

CLOUD = "https://generativelanguage.googleapis.com/v1beta/openai/"


@pytest.fixture
def cloud(monkeypatch):
    monkeypatch.setenv("LLM_BASE_URL", CLOUD)


def test_personal_data_is_swapped_for_placeholders_and_put_back():
    r = Redactor(names=["Aisyah Rahman"])
    text = ("Aisyah Rahman (aisyah.r@example.com, +60 12-345 6789) in A-12-08 reported case C-0025; "
            "the unit below, A-11-08, had APR-0001. Call 012-3456789.")
    sent = r.redact(text)
    for private in ("Aisyah", "aisyah.r@example.com", "345 6789", "3456789", "A-12-08", "A-11-08"):
        assert private not in sent
    assert "C-0025" in sent and "APR-0001" in sent  # case and record numbers are not personal
    assert "UNIT_1" in sent and "UNIT_2" in sent  # two different units stay two different placeholders
    assert r.restore(sent) == text


def test_same_value_gets_the_same_placeholder():
    r = Redactor(names=[])
    sent = r.redact("A-12-08 again: A-12-08")
    assert sent == "UNIT_1 again: UNIT_1"


def test_ten_or_more_placeholders_are_put_back_correctly():
    r = Redactor(names=[])
    units = [f"A-{n}-01" for n in range(1, 13)]
    assert r.restore(r.redact(" ".join(units))) == " ".join(units)


def test_photo_parts_are_sent_unchanged():
    r = Redactor(names=[])
    image = {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64,QS0xMi0wOA=="}}
    out = r.redact_messages([{"role": "user", "content": [{"type": "text", "text": "Unit A-12-08"}, image]}])
    assert out[0]["content"] == [{"type": "text", "text": "Unit UNIT_1"}, image]


@pytest.mark.parametrize("url, mode, on", [
    ("http://localhost:11434/v1", "auto", False),
    (CLOUD, "auto", True),
    (CLOUD, "off", False),
    ("http://localhost:11434/v1", "on", True),
])
def test_filter_is_on_for_a_cloud_model_unless_switched(monkeypatch, url, mode, on):
    monkeypatch.setenv("LLM_BASE_URL", url)
    monkeypatch.setenv("LLM_PRIVACY_FILTER", mode)
    assert privacy.enabled() is on


def test_local_model_sees_the_prompt_unchanged(fake_llm):
    fake_llm.responses.append("{}")
    chat_json(fake_llm.client, "m", [{"role": "user", "content": "Unit A-12-08"}], {"type": "object"})
    assert fake_llm.calls[-1][0]["content"] == "Unit A-12-08"


def test_chat_json_hides_personal_data_and_restores_the_answer(fake_llm, cloud, monkeypatch):
    monkeypatch.setattr(privacy, "_buyer_names", lambda: ["Aisyah Rahman"])
    fake_llm.responses.append(json.dumps({"note": "Visit UNIT_1 for PERSON_1"}))
    out = chat_json(fake_llm.client, "m", [{"role": "user", "content": "Aisyah Rahman, unit A-12-08, aisyah@example.com"}],
                    {"type": "object"})
    sent = fake_llm.calls[-1][0]["content"]
    assert "Aisyah" not in sent and "A-12-08" not in sent and "aisyah@example.com" not in sent
    assert out["parsed"] == {"note": "Visit A-12-08 for Aisyah Rahman"}


def test_tracked_completion_hides_personal_data_and_restores_the_answer(fake_llm, cloud):
    from agents.telemetry import tracked_chat_completion
    fake_llm.responses.append("Your visit at UNIT_1 is booked.")
    response = tracked_chat_completion(fake_llm.client, model="m", messages=[{"role": "user", "content": "Unit A-12-08"}])
    assert fake_llm.calls[-1][0]["content"] == "Unit UNIT_1"
    assert response.choices[0].message.content == "Your visit at A-12-08 is booked."


@pytest.mark.usefixtures("seed_db")
def test_a_whole_report_sends_no_personal_data_to_a_cloud_model(fake_llm, cloud, monkeypatch):
    # The demo buyer's report through every AI agent: no prompt carries their name, email or unit number
    import db
    import tools
    from demo_api import workflow
    monkeypatch.setenv("USE_AI_AGENTS", "all")
    tools.get_clock()
    with db.get_conn() as conn:
        buyer = dict(conn.execute("SELECT * FROM buyers WHERE name = 'Aisyah Rahman'").fetchone())
        case_id = workflow.submit_report(workflow.Ctx(conn), buyer["unit_id"], buyer["buyer_id"],
                                         "Water dripping from the master bedroom ceiling above the wardrobe.", None, None)["caseId"]
    with db.get_conn() as conn:
        assert conn.execute("SELECT unit_id FROM cases WHERE case_id = ?", (case_id,)).fetchone()[0] == buyer["unit_id"]
    prompts = json.dumps(fake_llm.calls)
    assert fake_llm.calls  # the agents did call the model
    for private in (buyer["name"], buyer["email"], buyer["unit_id"]):
        assert private not in prompts
