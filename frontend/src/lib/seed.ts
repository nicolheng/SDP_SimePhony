// Deterministic demo data: 18 months of noisy history plus the planted A-12-08 / stack 08 leak story.
import { BLOCKS, DEMO_START, FLOORS, STACKS, TECHNICIANS, RULES, unitId } from "./constants";
import { addDays } from "./dates";
import { verificationAgent } from "./agents";
import type { Case, Category, DemoState, SystemicIssue } from "./types";

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const HISTORY_TEMPLATES: Record<Category, { sub: string; loc: string[]; text: string }[]> = {
  water_leak: [
    { sub: "Ceiling leak", loc: ["Master bedroom", "Bathroom", "Kitchen"], text: "Water dripping from ceiling, stain spreading." },
    { sub: "Wall seepage", loc: ["Living room", "Bedroom 2"], text: "Wall damp and paint bubbling near skirting." },
  ],
  plumbing: [{ sub: "Pipe leak", loc: ["Kitchen"], text: "Leak under kitchen sink pipe." }],
  drainage: [{ sub: "Slow drain", loc: ["Bathroom", "Balcony"], text: "Floor trap drains very slowly." }],
  sanitary_fittings: [{ sub: "Loose basin", loc: ["Bathroom"], text: "Basin wobbly, sealant cracked." }],
  electrical: [{ sub: "Faulty socket", loc: ["Living room", "Kitchen"], text: "Power socket not working." }],
  wall_crack: [{ sub: "Hairline crack", loc: ["Living room", "Bedroom 2"], text: "Hairline crack on wall above door." }],
  tiles: [{ sub: "Hollow tiles", loc: ["Living room", "Kitchen"], text: "Floor tiles sound hollow, one tile cracked." }],
  ceiling: [{ sub: "Ceiling board crack", loc: ["Living room"], text: "Crack line on plaster ceiling." }],
  door_window: [{ sub: "Door misaligned", loc: ["Master bedroom", "Main entrance"], text: "Door scrapes floor, hard to lock." }],
  paint: [{ sub: "Paint peeling", loc: ["Bedroom 2", "Balcony"], text: "Paint peeling near window." }],
  other: [{ sub: "Missing fitting", loc: ["Kitchen"], text: "Cabinet handle missing." }],
};

const WEIGHTED: Category[] = [
  ...Array<Category>(16).fill("water_leak"),
  ...Array<Category>(15).fill("tiles"),
  ...Array<Category>(14).fill("paint"),
  ...Array<Category>(12).fill("wall_crack"),
  ...Array<Category>(12).fill("door_window"),
  ...Array<Category>(8).fill("electrical"),
  ...Array<Category>(8).fill("drainage"),
  ...Array<Category>(6).fill("sanitary_fittings"),
  ...Array<Category>(4).fill("ceiling"),
  ...Array<Category>(5).fill("other"),
];

function techFor(category: Category, block: string) {
  const skills = RULES.categoryToSkill[category];
  return TECHNICIANS.find((t) => t.blocks.includes(block) && t.skills.some((s) => skills.includes(s)))?.id;
}

function historyCase(
  id: string,
  unit: string,
  category: Category,
  created: string,
  pick: (typeof HISTORY_TEMPLATES)[Category][number],
  loc: string,
  opts: { invalid?: boolean; reopens?: number; closeAfter?: number } = {},
): Case {
  const block = unit.split("-")[0];
  return {
    id,
    unitId: unit,
    buyerId: `B-${unit}`,
    status: opts.invalid ? "INVALID" : "CLOSED",
    category,
    subCategory: pick.sub,
    location: loc,
    summary: `${pick.sub} in ${loc.toLowerCase()}`,
    description: pick.text,
    urgency: category === "water_leak" || category === "electrical" ? "high" : "normal",
    technicianId: techFor(category, block),
    photos: [{ url: null, kind: "original", at: created }],
    reopenCount: opts.reopens ?? 0,
    occurrence: 1,
    similar: [],
    missingInfo: [],
    verdict: { outcome: opts.invalid ? "INVALID" : "VALID", note: opts.invalid ? "Within normal tolerance, not a defect." : "Confirmed on site.", at: addDays(created, 3) },
    createdAt: created,
    closedAt: addDays(created, opts.closeAfter ?? 12),
    repairedAt: opts.invalid ? undefined : addDays(created, (opts.closeAfter ?? 12) - 2),
    repairNote: opts.invalid ? undefined : "Repaired on site.",
    signoff: opts.invalid
      ? undefined
      : {
          buyer: { at: addDays(created, (opts.closeAfter ?? 12) - 1), note: "" },
          developer: { at: addDays(created, opts.closeAfter ?? 12), by: "SDP Defect Team" },
        },
    historical: true,
  };
}

export function buildSeed(): DemoState {
  const rand = mulberry32(20261019);
  const cases: Case[] = [];
  let n = 1;
  const nextId = () => `H-${String(n++).padStart(4, "0")}`;

  // Noise: ~170 cases across all blocks over 18 months.
  for (let i = 0; i < 170; i++) {
    const block = BLOCKS[Math.floor(rand() * BLOCKS.length)];
    const floor = 1 + Math.floor(rand() * FLOORS);
    const stack = STACKS[Math.floor(rand() * STACKS.length)];
    const unit = unitId(block, floor, stack);
    if (block === "A" && stack === "08") continue; // keep the planted story clean
    const category = WEIGHTED[Math.floor(rand() * WEIGHTED.length)];
    const templates = HISTORY_TEMPLATES[category];
    const pick = templates[Math.floor(rand() * templates.length)];
    const loc = pick.loc[Math.floor(rand() * pick.loc.length)];
    const created = addDays(DEMO_START, -(20 + Math.floor(rand() * 520)));
    cases.push(
      historyCase(nextId(), unit, category, created, pick, loc, {
        invalid: rand() < 0.1,
        reopens: rand() < 0.1 ? 1 : 0,
        closeAfter: 4 + Math.floor(rand() * 30),
      }),
    );
  }

  // Planted story: ceiling leaks running down stack A-08.
  const leak = HISTORY_TEMPLATES.water_leak[0];
  const planted: [string, number, string][] = [
    ["A-12-08", -400, "Master bedroom"],
    ["A-12-08", -150, "Master bedroom"],
    ["A-12-07", -210, "Master bedroom"],
    ["A-11-08", -300, "Master bedroom"],
    ["A-11-08", -90, "Master bedroom"],
    ["A-10-08", -180, "Master bedroom"],
    ["A-9-08", -120, "Master bedroom"],
  ];
  for (const [unit, offset, loc] of planted) {
    cases.push(historyCase(nextId(), unit, "water_leak", addDays(DEMO_START, offset), leak, loc, { closeAfter: 9 }));
  }

  // A cluster SDP already handled, so the Systemic Issues page has history.
  const tiles = HISTORY_TEMPLATES.tiles[0];
  for (const [unit, offset] of [["B-5-03", -240], ["B-6-03", -200], ["B-8-03", -170]] as const) {
    cases.push(historyCase(nextId(), unit, "tiles", addDays(DEMO_START, offset), tiles, "Living room", { closeAfter: 14, reopens: unit === "B-6-03" ? 1 : 0 }));
  }
  const tilesB03 = cases.filter((c) => c.unitId.startsWith("B-") && c.unitId.endsWith("-03") && c.category === "tiles");
  const systemicIssues: SystemicIssue[] = [
    {
      id: "SI-001",
      title: "Hollow floor tiles",
      category: "tiles",
      block: "B",
      stack: "03",
      relatedCases: tilesB03.map((c) => c.id),
      recurrenceCount: tilesB03.length,
      reopenedCount: tilesB03.filter((c) => c.reopenCount > 0).length,
      confidence: 0.78,
      detectedAt: addDays(DEMO_START, -60),
      status: "monitoring",
      approvalStatus: "approved",
      recommendedAction: "Screed bonding check on stack B-03 floors; monitor for 3 months.",
    },
  ];

  // A few live cases from other buyers so the SDP console has open work.
  const live: [string, Category, number, Case["status"], number][] = [
    ["B-7-02", "electrical", -6, "VISIT_SCHEDULED", 2],
    ["C-3-05", "tiles", -9, "REPAIR_BOOKED", 3],
    ["A-4-01", "door_window", -4, "VALID", 0],
    ["B-14-09", "paint", -12, "PENDING_SIGNOFF", 0],
    ["C-10-04", "drainage", -3, "VISIT_SCHEDULED", 1],
    ["A-6-10", "wall_crack", -8, "INVALID", 0],
    // Jobs for the default technician (T-01 Hafiz) so the technician view has work on day one.
    ["B-3-06", "water_leak", -2, "VISIT_SCHEDULED", 0.25],
    ["A-8-03", "plumbing", -7, "REPAIR_BOOKED", 1.08],
    ["B-2-09", "water_leak", -5, "VALID", 0],
    ["B-11-01", "drainage", -10, "PENDING_SIGNOFF", 0],
  ];
  live.forEach(([unit, category, offset, status, slotDays], i) => {
    const pick = HISTORY_TEMPLATES[category][0];
    const created = addDays(DEMO_START, offset);
    const c = historyCase(`L-${String(i + 1).padStart(3, "0")}`, unit, category, created, pick, pick.loc[0]);
    c.historical = false;
    c.status = status;
    c.closedAt = undefined;
    c.urgency = category === "electrical" ? "high" : "normal";
    if (status === "VISIT_SCHEDULED") {
      c.verdict = undefined;
      c.visitSlot = addDays(DEMO_START, slotDays);
    } else if (status === "REPAIR_BOOKED") {
      c.repairSlot = addDays(DEMO_START, slotDays);
    } else if (status === "PENDING_SIGNOFF") {
      c.repairNote = category === "paint" ? "Scraped and repainted affected area." : "Cleared and resealed the floor trap.";
      c.repairedAt = addDays(DEMO_START, -1);
      c.signoff = undefined;
      c.verificationGuide = verificationAgent(c);
    } else if (status === "INVALID") {
      c.closedAt = addDays(created, 3);
    }
    cases.push(c);
  });

  // Seeded jobs hold their technician's slot so triage won't double-book it.
  const bookings: DemoState["bookings"] = cases
    .filter((c) => !c.historical && c.technicianId && (c.status === "VISIT_SCHEDULED" || c.status === "REPAIR_BOOKED"))
    .map((c) => {
      const kind = c.status === "REPAIR_BOOKED" ? "repair" : "visit";
      return { slot: (kind === "repair" ? c.repairSlot : c.visitSlot)!, technicianId: c.technicianId!, caseId: c.id, kind };
    });

  cases.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return {
    version: 3,
    now: DEMO_START,
    cases,
    events: [],
    messages: [],
    outbox: [],
    approvals: [],
    systemicIssues,
    bookings,
    seq: { case: 1, event: 1, si: 2 },
  };
}
