import json
import logging
import re
import sys
from collections import Counter
from pathlib import Path
from typing import Any

# Make the backend database and demo clock available to this agent package.
sys.path.append(str(Path(__file__).resolve().parents[2] / "backend"))
import db
from tools import get_recurring_stats
from demo_api.timeutil import add_days, demo_now, parse

from .llm_client import client, MODEL_TEXT

log = logging.getLogger(__name__)


def generate_analytics_insight() -> str:
    """Generate a concise executive summary of defect recurrence insights."""
    
    try:
        # Call the get_recurring_stats function to get the raw data dictionary
        stats = get_recurring_stats()
    except Exception as e:
        return f"⚠️ Could not fetch analytics data: {e}"

    system_prompt = (
        "You are a data analyst for a property management company. Read the JSON statistics of defect recurrences. "
        "Write a concise, 3-sentence executive summary highlighting the most critical recurring problem and which building block is most affected. "
        "Do not hallucinate numbers. Output ONLY plain text, no JSON formatting."
    )

    user_input = json.dumps(stats)

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_input}
    ]

    try:
        response = client.chat.completions.create(
            model=MODEL_TEXT,
            messages=messages,
            temperature=0.1,
        )
        summary = response.choices[0].message.content.strip()
        return summary
    except Exception as e:
        return f"⚠️ AI failed to generate insight: {e}"


def _weekly_digest_stats(days: int) -> dict[str, Any]:
    if days <= 0:
        raise ValueError("days must be a positive integer")

    with db.get_conn() as conn:
        window_end = demo_now(conn)
        window_start = add_days(window_end, -days)
        cases = conn.execute(
            """
            SELECT case_id, category, urgency, status, created_at, closed_at
            FROM cases
            WHERE (julianday(created_at) >= julianday(?) AND julianday(created_at) <= julianday(?))
               OR (closed_at IS NOT NULL AND julianday(closed_at) >= julianday(?) AND julianday(closed_at) <= julianday(?))
            """,
            (window_start, window_end, window_start, window_end),
        ).fetchall()
        reopen_events = conn.execute(
            """
            SELECT case_id, created_at
            FROM case_events
            WHERE type = 'case.reopened'
              AND julianday(created_at) >= julianday(?)
              AND julianday(created_at) <= julianday(?)
            """,
            (window_start, window_end),
        ).fetchall()

    start = parse(window_start)
    end = parse(window_end)
    new_cases = [
        row for row in cases
        if row["created_at"] and start <= parse(row["created_at"]) <= end
    ]
    closed_cases = [
        row for row in cases
        if row["status"] == "CLOSED"
        and row["closed_at"]
        and start <= parse(row["closed_at"]) <= end
    ]

    category_counts = Counter(
        row["category"] or "unknown" for row in new_cases
    )
    top_categories = [
        {"category": category, "count": count}
        for category, count in sorted(
            category_counts.items(), key=lambda item: (-item[1], item[0])
        )[:3]
    ]
    close_durations = [
        (parse(row["closed_at"]) - parse(row["created_at"])).total_seconds() / 86400
        for row in closed_cases
        if row["created_at"]
    ]
    reopened_cases = {
        row["case_id"]
        for row in reopen_events
        if row["case_id"] and start <= parse(row["created_at"]) <= end
    }

    return {
        "period_days": days,
        "total_new_cases": len(new_cases),
        "total_cases_closed": len(closed_cases),
        "average_days_to_close": round(sum(close_durations) / len(close_durations), 2)
        if close_durations else None,
        "high_urgency_cases": sum(
            1 for row in new_cases if (row["urgency"] or "").lower() == "high"
        ),
        "top_categories": top_categories,
        "reopened_cases": len(reopened_cases),
        "reopen_rate_percent": round(len(reopened_cases) / len(closed_cases) * 100, 1)
        if closed_cases else None,
        "reopen_rate_definition": "distinct cases reopened during the period divided by cases closed during the period",
    }


def _contains_quantitative_claim(text: str) -> bool:
    return bool(re.search(
        r"\d|"
        r"\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|"
        r"eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|"
        r"eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|"
        r"eighty|ninety|dozen|hundred|thousand|none|no|few|several|many|"
        r"most|half|twice|double|single|first|second|third|fourth|fifth|"
        r"percent(?:age)?|total|average|count)\b",
        text,
        re.IGNORECASE,
    ))


def _safe_qualitative_digest(stats: dict[str, Any]) -> str:
    categories = [item["category"].replace("_", " ") for item in stats["top_categories"]]
    if categories:
        category_text = ", ".join(categories)
        first = (
            f"Incoming reports are concentrated in {category_text}. "
            "Management should keep attention on these defect types and ensure "
            "that the response remains aligned with their operational risks."
        )
    else:
        first = (
            "The reporting window provides limited category activity to interpret. "
            "Continue routine defect monitoring and maintain consistent intake triage."
        )

    if stats["high_urgency_cases"]:
        second = (
            "High-urgency reports require prompt review and clear ownership. "
            "Reopening activity also warrants case-level follow-up to identify "
            "repair or verification gaps."
        )
    elif stats["reopened_cases"]:
        second = (
            "Reopening activity warrants case-level follow-up to identify repair "
            "or verification gaps. Continue routine safety triage for new reports."
        )
    else:
        second = (
            "No urgent or reopening signal stands out in the current intake. "
            "Continue routine safety triage and review case outcomes as they mature."
        )
    return f"{first}\n\n{second}"


def _computed_figures_paragraph(stats: dict[str, Any]) -> str:
    average = (
        f"{stats['average_days_to_close']:.2f} days"
        if stats["average_days_to_close"] is not None
        else "unavailable"
    )
    reopen_rate = (
        f"{stats['reopen_rate_percent']:.1f}%"
        if stats["reopen_rate_percent"] is not None
        else "unavailable"
    )
    categories = ", ".join(
        f"{item['category'].replace('_', ' ')} ({item['count']})"
        for item in stats["top_categories"]
    ) or "none"
    return (
        f"Computed figures for the past {stats['period_days']} days: "
        f"{stats['total_new_cases']} new cases; {stats['total_cases_closed']} cases closed; "
        f"average days to close: {average}; high-urgency cases: {stats['high_urgency_cases']}; "
        f"top categories: {categories}; distinct cases reopened: {stats['reopened_cases']}; "
        f"reopen rate: {reopen_rate}."
    )


def generate_weekly_digest(days: int = 7) -> str:
    """Compute figures in Python; include only vetted qualitative model prose and coded figures."""
    stats = _weekly_digest_stats(days)
    system_prompt = (
        "You are an SDP management assistant. Write exactly 2 concise paragraphs of "
        "qualitative management analysis using the supplied statistics: discuss defect "
        "category trends, urgency, reopening risks, and operational priorities. Do not "
        "include any digits, numbers written as words, counts, percentages, averages, "
        "or claims that something happened zero/no/once/multiple times. A separate "
        "third paragraph will contain the exact figures computed by code."
    )
    user_input = (
        f"Exact defect management statistics for the past {days} days:\n"
        f"{json.dumps(stats, indent=2, sort_keys=True)}"
    )
    response = client.chat.completions.create(
        model=MODEL_TEXT,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_input},
        ],
        temperature=0.1,
    )
    digest = response.choices[0].message.content
    if not isinstance(digest, str) or not digest.strip():
        raise RuntimeError("The text model returned an empty weekly digest")
    paragraphs = [paragraph.strip() for paragraph in digest.strip().split("\n\n") if paragraph.strip()]
    if len(paragraphs) != 2 or _contains_quantitative_claim(digest):
        log.warning("Weekly digest model response contained quantitative claims; using safe qualitative summary")
        narrative = _safe_qualitative_digest(stats)
    else:
        narrative = "\n\n".join(paragraphs)
    return f"{narrative}\n\n{_computed_figures_paragraph(stats)}"


if __name__ == "__main__":
    print("📊 Generating Analytics Insight...\n")
    insight = generate_analytics_insight()
    print(insight)