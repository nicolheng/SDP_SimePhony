import type { Category, Technician, Unit } from "./types";

// Mirrors rules.yaml. When the backend exists, fetch these from it instead.
export const RULES = {
  gracePeriodDays: 30,
  /** Buyer has this long after the repair to sign off; then the case auto-closes (high urgency: flagged to SDP instead). */
  signoffPeriodDays: 14,
  signoffReminderDaysBefore: 3,
  occurrenceThreshold: 3,
  stackClusterThreshold: 3,
  categoryToSkill: {
    water_leak: ["plumbing", "waterproofing"],
    plumbing: ["plumbing"],
    drainage: ["plumbing"],
    sanitary_fittings: ["plumbing"],
    electrical: ["electrical"],
    wall_crack: ["civil"],
    structural_crack: ["civil"],
    tiles: ["tiling"],
    ceiling: ["civil"],
    door_window: ["carpentry", "glazing"],
    paint: ["painting"],
    other: ["general"],
  } as Record<Category, string[]>,
};

export const CATEGORY_LABEL: Record<Category, string> = {
  water_leak: "Water leak",
  plumbing: "Plumbing",
  drainage: "Drainage",
  sanitary_fittings: "Sanitary fittings",
  electrical: "Electrical",
  wall_crack: "Wall crack",
  structural_crack: "Structural crack",
  tiles: "Tiles",
  ceiling: "Ceiling",
  door_window: "Door / window",
  paint: "Paint",
  other: "Other",
};

export const DEMO_START = "2026-10-19T09:00:00+08:00"; // Monday
export const TZ = "Asia/Kuala_Lumpur";

export const PROJECT_NAME = "Residensi Harmoni";
export const BLOCKS = ["A", "B", "C"];
export const FLOORS = 15;
export const STACKS = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10"];

const CONTRACTOR: Record<string, string> = {
  A: "Contractor Alpha",
  B: "Contractor Beta",
  C: "Contractor Gamma",
};

export const unitId = (block: string, floor: number, stack: string) => `${block}-${floor}-${stack}`;

export const UNITS: Unit[] = BLOCKS.flatMap((block) =>
  Array.from({ length: FLOORS }, (_, i) => i + 1).flatMap((floor) =>
    STACKS.map((stack) => ({ id: unitId(block, floor, stack), block, floor, stack, contractor: CONTRACTOR[block] })),
  ),
);

export const getUnit = (id: string) => UNITS.find((u) => u.id === id)!;

// Matches the A-12-08 buyer in data/seed.db.
export const DEMO_BUYER = {
  id: "B-0118",
  name: "Aisyah Rahman",
  email: "aisyah.demo@example.com",
  unitId: "A-12-08",
};

export const SDP_STAFF_EMAIL = "sdp.staff@example.com";

// In-house technicians (match data/seed.db): inspection visits and minor repairs.
export const TECHNICIANS: Technician[] = [
  { id: "T-01", name: "Hafiz Osman", email: "hafiz.tech@example.com", skills: ["plumbing", "waterproofing"], blocks: ["A", "B"], kind: "technician" },
  { id: "T-02", name: "Ravi Kumar", email: "ravi.tech@example.com", skills: ["plumbing"], blocks: ["A", "B", "C"], kind: "technician" },
  { id: "T-03", name: "Lim Wei Jie", email: "weijie.tech@example.com", skills: ["electrical"], blocks: ["A", "B", "C"], kind: "technician" },
  { id: "T-04", name: "Nurul Izzah", email: "nurul.tech@example.com", skills: ["civil", "tiling", "painting"], blocks: ["A", "B", "C"], kind: "technician" },
  { id: "T-05", name: "Daniel Tan", email: "daniel.tech@example.com", skills: ["carpentry", "glazing", "general"], blocks: ["A", "B", "C"], kind: "technician" },
  { id: "T-06", name: "Siti Aminah", email: "siti.tech@example.com", skills: ["waterproofing", "civil"], blocks: ["C"], kind: "technician" },
];

// Subcontractors (demo, frontend only for now): specialised repair work under contract.
export const SUBCONTRACTORS: Technician[] = [
  { id: "SC-01", name: "Kamal Yusof", company: "Alpha Waterproofing Sdn Bhd", email: "kamal.subcon@example.com", skills: ["waterproofing", "plumbing"], blocks: ["A", "B", "C"], kind: "subcontractor" },
  { id: "SC-02", name: "Tan Mei Ling", company: "Beta Structural Works Sdn Bhd", email: "meiling.subcon@example.com", skills: ["structural", "civil"], blocks: ["A", "B", "C"], kind: "subcontractor" },
  { id: "SC-03", name: "Arjun Pillai", company: "Gamma Tiling & Flooring Sdn Bhd", email: "arjun.subcon@example.com", skills: ["tiling", "flooring"], blocks: ["A", "B", "C"], kind: "subcontractor" },
  { id: "SC-04", name: "Ong Chee Keong", company: "Delta Electrical Services Sdn Bhd", email: "cheekeong.subcon@example.com", skills: ["electrical"], blocks: ["A", "B", "C"], kind: "subcontractor" },
];

export const WORKERS: Technician[] = [...TECHNICIANS, ...SUBCONTRACTORS];

/** Any worker: in-house technician or subcontractor. */
export const getTechnician = (id?: string) => WORKERS.find((t) => t.id === id);

/** "Kamal Yusof (Alpha Waterproofing Sdn Bhd)" or just the technician's name. */
export const workerLabel = (id?: string) => {
  const w = getTechnician(id);
  return w ? (w.company ? `${w.name} (${w.company})` : w.name) : "—";
};

/** Who repairs what, and roughly how long it takes. Specialised trades go to subcontractors. */
export const REPAIR_PLAN: Record<Category, { trade: string; by: Technician["kind"]; skills: string[]; hours: number }> = {
  water_leak: { trade: "Waterproofing / Plumbing", by: "subcontractor", skills: ["waterproofing"], hours: 4 },
  structural_crack: { trade: "Structural", by: "subcontractor", skills: ["structural"], hours: 8 },
  tiles: { trade: "Tiling", by: "subcontractor", skills: ["tiling"], hours: 4 },
  plumbing: { trade: "Plumbing", by: "technician", skills: ["plumbing"], hours: 2 },
  drainage: { trade: "Plumbing", by: "technician", skills: ["plumbing"], hours: 1.5 },
  sanitary_fittings: { trade: "Plumbing", by: "technician", skills: ["plumbing"], hours: 1.5 },
  electrical: { trade: "Electrical", by: "technician", skills: ["electrical"], hours: 1.5 },
  wall_crack: { trade: "Civil / Painting", by: "technician", skills: ["civil", "painting"], hours: 2 },
  ceiling: { trade: "Ceiling / Civil", by: "technician", skills: ["civil"], hours: 3 },
  door_window: { trade: "Carpentry / Glazing", by: "technician", skills: ["carpentry", "glazing"], hours: 2 },
  paint: { trade: "Painting", by: "technician", skills: ["painting"], hours: 2 },
  other: { trade: "General", by: "technician", skills: ["general"], hours: 1 },
};

export const SDP_STAFF = { name: "Farah Lee", title: "SDP Defect Team" };

export const SLOT_TIMES = ["09:00", "11:00", "14:00", "16:00"];
/** Each slot is a 2-hour block. */
export const SLOT_HOURS = 2;
