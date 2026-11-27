// Insights page figures, hardcoded for the finals (docs/DASHBOARD_REDESIGN.md). The page only displays them.
// Worked out by hand from data/seed.db on 27 Nov 2026: 123 reports, 17 not a defect, 106 confirmed defects.
// seed.db dates were moved 30 days forward on 27 Nov (backend/seed/shift_seed_dates.py): the newest report is 18 Nov 2026.
// backend/seed/demo_polish.py then added buyer ratings and moved 5 open cases earlier (so some repairs are overdue).
// Values marked ILLUSTRATIVE are not in the seed (the KPI baselines): replace them if SDP gives real targets.
// Contractors map one-to-one to blocks in the seed: Alpha = Block A, Beta = Block B, Gamma = Block C.

export type Tone = "good" | "warn" | "bad" | "neutral";

/** This Building ①: the headline, one line per finding. */
export const WHAT_CHANGED: { text: string; tone: Tone }[] = [
  { text: "November brought 13 new reports, the most of any month and up from 6 in October.", tone: "bad" },
  { text: "9 of 97 repairs took longer than the 30-day legal repair period.", tone: "bad" },
  { text: "Repairs are the slowest step: 12.6 of the 21.6 days from report to close.", tone: "warn" },
  { text: "Block A (Contractor Alpha) has 42 defects and 9 of the 17 reopens.", tone: "warn" },
];

/** This Building ②. Each figure against its baseline: green = meets it, amber = within 10% of it, red = further off
 * (the legal 30-day period is red on any miss). The baselines are ILLUSTRATIVE SDP targets; the values are from the seed. */
export const HEALTH: { label: string; value: string; detail: string; baseline: string; status: string; tone: Tone }[] = [
  { label: "Open Defects", value: "16", detail: "4 waiting for buyer sign-off", baseline: "Baseline: under 20", status: "On track", tone: "good" },
  { label: "Repaired Within 30 Days", value: "91%", detail: "88 of 97 repairs", baseline: "Legal: 100%", status: "9 late", tone: "bad" },
  { label: "Fixed First Time", value: "84%", detail: "89 of 106 defects", baseline: "Target: 90%", status: "Slightly below", tone: "warn" },
  { label: "Days to Close", value: "21.6", detail: "Report to close, average", baseline: "Target: 14 days", status: "Too slow", tone: "bad" },
  { label: "New Reports (Nov)", value: "13", detail: "▲ 7 from October", baseline: "12-month average: 7.9", status: "Spike", tone: "bad" },
];

/** Reports per calendar month, Dec 2025 to Nov 2026: confirmed defects and reports that were not a defect. */
export const MONTHLY: { month: string; confirmed: number; notDefect: number }[] = [
  { month: "Dec", confirmed: 4, notDefect: 1 },
  { month: "Jan", confirmed: 8, notDefect: 2 },
  { month: "Feb", confirmed: 7, notDefect: 1 },
  { month: "Mar", confirmed: 7, notDefect: 1 },
  { month: "Apr", confirmed: 11, notDefect: 1 },
  { month: "May", confirmed: 8, notDefect: 4 },
  { month: "Jun", confirmed: 5, notDefect: 0 },
  { month: "Jul", confirmed: 6, notDefect: 0 },
  { month: "Aug", confirmed: 5, notDefect: 2 },
  { month: "Sep", confirmed: 3, notDefect: 0 },
  { month: "Oct", confirmed: 5, notDefect: 1 },
  { month: "Nov", confirmed: 12, notDefect: 1 },
];

/** This Building ③: average days per stage over the 90 closed cases (they sum to 21.6). */
export const STAGES: { key: string; label: string; days: number }[] = [
  { key: "inspect", label: "Report → Inspection verdict", days: 2.0 },
  { key: "repair", label: "Verdict → Repaired", days: 12.6 },
  { key: "signoff", label: "Repaired → Closed", days: 7.0 },
];

/** This Building ④: confirmed defects per category, split into fixed first time and came back (reopened). */
export const CATEGORIES: { name: string; firstTime: number; cameBack: number }[] = [
  { name: "Water Leak", firstTime: 19, cameBack: 7 },
  { name: "Electrical", firstTime: 14, cameBack: 3 },
  { name: "Tiles", firstTime: 9, cameBack: 1 },
  { name: "Wall Crack", firstTime: 8, cameBack: 1 },
  { name: "Drainage", firstTime: 8, cameBack: 1 },
  { name: "Plumbing", firstTime: 7, cameBack: 1 },
  { name: "Ceiling", firstTime: 6, cameBack: 1 },
  { name: "Sanitary Fittings", firstTime: 6, cameBack: 0 },
  { name: "Door / Window", firstTime: 6, cameBack: 0 },
  { name: "Structural Crack", firstTime: 2, cameBack: 2 },
  { name: "Paint", firstTime: 3, cameBack: 0 },
];

/** Where the 26 confirmed water leaks showed up (grouped from location_in_unit). */
export const LEAK_SOURCES: { name: string; count: number }[] = [
  { name: "Ceiling, from the unit above", count: 10 },
  { name: "Pipe shaft or riser", count: 7 },
  { name: "Wall (party, living, bedroom)", count: 7 },
  { name: "Other", count: 2 },
];

/** This Building ⑥. Hours are not in the seed, so the scorecard shows counts only. */
export const CONTRACTORS: {
  name: string;
  block: string;
  units: number;
  defects: number;
  reopened: number;
  topProblem: string;
  topCount: number;
  evidence: { headline: string; lines: string[]; caseIds: string[] };
}[] = [
  {
    name: "Contractor Alpha",
    block: "A",
    units: 150,
    defects: 42,
    reopened: 9,
    topProblem: "Water Leak",
    topCount: 14,
    evidence: {
      headline: "Water leaks in Block A, Stack 08",
      lines: [
        "6 leak repairs on 4 floors of one stack (A-9-08 to A-12-08), through the ceiling and the pipe shaft",
        "3 of the 6 repairs came back, and a 7th report (C-0014) is open now",
        "9 of the project's 17 reopened defects are in Block A",
      ],
      caseIds: ["H-0001", "H-0002", "H-0003", "H-0004", "H-0005", "H-0006", "C-0014"],
    },
  },
  {
    name: "Contractor Beta",
    block: "B",
    units: 150,
    defects: 31,
    reopened: 6,
    topProblem: "Tiles",
    topCount: 6,
    evidence: {
      headline: "Tiles and cracks in Block B",
      lines: ["6 of 31 repairs came back (19%), including 2 water leaks", "6 tile defects, the most of any block; C-0011 (structural crack) came back twice"],
      caseIds: ["H-0009", "H-0015", "H-0034", "H-0102", "C-0008", "C-0011"],
    },
  },
  {
    name: "Contractor Gamma",
    block: "C",
    units: 150,
    defects: 33,
    reopened: 2,
    topProblem: "Water Leak",
    topCount: 7,
    evidence: {
      headline: "Block C: best repair quality",
      lines: ["Only 2 of 33 repairs came back (6%)", "Use as the benchmark for the reopen KPI"],
      caseIds: ["H-0011", "H-0098"],
    },
  },
];

/** Contractor radar: each axis has its own scale; bigger = worse on every axis. */
export const CONTRACTOR_RADAR = {
  axes: [
    { name: "Defects per 100 units", max: 30 },
    { name: "Came back %", max: 25 },
    { name: "Water leaks", max: 15 },
    { name: "Cracks", max: 8 },
    { name: "Tiles", max: 8 },
  ],
  series: [
    { name: "Contractor Alpha", values: [28, 21, 14, 4, 0] },
    { name: "Contractor Beta", values: [21, 19, 5, 6, 6] },
    { name: "Contractor Gamma", values: [22, 6, 7, 3, 4] },
  ],
};

/** This Building ⑤: buyer ratings in seed.db (added by demo_polish.py), 66 of 90 signed-off cases. */
export const BUYERS = {
  average: 3.8,
  responseRate: 0.73,
  distribution: [
    { stars: 5, count: 26 },
    { stars: 4, count: 15 },
    { stars: 3, count: 11 },
    { stars: 2, count: 11 },
    { stars: 1, count: 3 },
  ],
  drivers: [
    { label: "Repaired within 30 days", stars: 4.3 },
    { label: "Repaired after 30 days", stars: 1.9 },
    { label: "Defect came back", stars: 2.6 },
  ],
};

// ── Next Building ─────────────────────────────────────────────────────────────

export const LESSONS_SCOPE = "From 123 reports in 110 units across Blocks A to C, defect liability period to date";

export const CAME_BACK = {
  reopened: 17,
  of: 106,
  byCategory: [
    { name: "Water Leak", count: 7 },
    { name: "Electrical", count: 3 },
    { name: "Structural Crack", count: 2 },
    { name: "Other (5 categories)", count: 5 },
  ],
};

/** Block A / Stack 08: the floors shown in the stack diagram, top to bottom. */
export const WORST_STACK = {
  title: "Block A, Stack 08",
  sub: "Water leaks on four floors in a row, through the ceiling and the pipe shaft",
  floors: [
    { unit: "A-13-08", reports: 0, cameBack: 0 },
    { unit: "A-12-08", reports: 3, cameBack: 1 },
    { unit: "A-11-08", reports: 2, cameBack: 2 },
    { unit: "A-10-08", reports: 1, cameBack: 0 },
    { unit: "A-9-08", reports: 1, cameBack: 0 },
    { unit: "A-8-08", reports: 0, cameBack: 0 },
  ],
};

export const AVOIDABLE = {
  count: 17,
  of: 123,
  byCategory: [
    { name: "Wall / Structural Crack", count: 6 },
    { name: "Water Leak", count: 5 },
    { name: "Electrical", count: 3 },
    { name: "Tiles", count: 2 },
    { name: "Door / Window", count: 1 },
  ],
  example: "Hairline shrinkage crack in the skim coat only, under 0.3 mm wide, with no movement. Cosmetic, not a developer defect.",
};

/** 3 to 5 recommendations, each with one number as evidence, the team that owns it and the cases behind it (#138). */
export const RECOMMENDATIONS: { action: string; evidence: string; owner: string; caseIds: string[] }[] = [
  {
    action: "Review the bathroom waterproofing and floor trap detail",
    evidence: "10 of 26 water leaks came through the ceiling from the unit above. In Stack 08, 3 of 6 repairs came back.",
    owner: "Design team",
    caseIds: ["H-0001", "H-0002", "H-0003", "H-0004", "H-0007", "H-0040", "H-0042", "H-0046", "H-0060", "C-0014"],
  },
  {
    action: "Pressure-test pipe shafts and risers before they are closed up",
    evidence: "7 of 26 water leaks were at a pipe shaft or riser.",
    owner: "Site QA",
    caseIds: ["H-0005", "H-0006", "H-0025", "H-0034", "H-0062", "H-0070", "H-0073"],
  },
  {
    action: "Add a reopen-rate KPI to the main contractor's contract",
    evidence: "21% of Contractor Alpha's repairs came back, against 6% for Contractor Gamma.",
    owner: "Procurement",
    caseIds: ["H-0002", "H-0003", "H-0004", "H-0070", "H-0074", "H-0078", "H-0080", "H-0100", "H-0108"],
  },
  {
    action: "Have an engineer sign off structural crack repairs before closing",
    evidence: "2 of 4 structural crack repairs came back; C-0011 came back twice.",
    owner: "Site QA",
    caseIds: ["H-0032", "H-0039", "H-0102", "C-0011"],
  },
  {
    action: "Explain hairline cracks in the handover guide",
    evidence: "17 of 123 reports (14%) were not a defect; 6 of them were cosmetic cracks.",
    owner: "Handover team",
    caseIds: ["H-0045", "H-0053", "H-0054", "H-0079", "H-0097", "C-0006"],
  },
];
