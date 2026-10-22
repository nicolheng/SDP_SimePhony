import type { Buyer, Category, Reference, RepairPlan, Technician, Unit } from "./types";

// Lookup data the screens show. The values below are the built-in defaults, used only until the first response from
// the backend (and by the offline demo data in seed.ts). applyReference() then replaces them with what the backend
// sends: workers and units/buyers from data/simephony.db, rules from rules.yaml and backend/demo_api/config.py.
// The exports keep their names and are updated in place, so every screen picks up the database values.

export const RULES = {
  gracePeriodDays: 30,
  /** Buyer has this long after the developer's sign-off to sign off; then the case auto-closes (high urgency: flagged to SDP instead). */
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
  } as Record<string, string[]>,
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

export const DEMO_START = "2026-10-19T09:00:00+08:00"; // Monday (offline demo data only)
export const TZ = "Asia/Kuala_Lumpur";

export let PROJECT_NAME = "Serenia City";

export const unitId = (block: string, floor: number, stack: string) => `${block}-${floor}-${stack}`;

const DEFAULT_CONTRACTOR: Record<string, string> = { A: "Contractor Alpha", B: "Contractor Beta", C: "Contractor Gamma" };
const DEFAULT_STACKS = Array.from({ length: 10 }, (_, i) => String(i + 1).padStart(2, "0"));

export let UNITS: Unit[] = ["A", "B", "C"].flatMap((block) =>
  Array.from({ length: 15 }, (_, i) => i + 1).flatMap((floor) =>
    DEFAULT_STACKS.map((stack) => ({ id: unitId(block, floor, stack), block, floor, stack, contractor: DEFAULT_CONTRACTOR[block] })),
  ),
);
export let BLOCKS: string[] = [];
export let FLOORS = 0;
export let STACKS: string[] = [];
let unitById = new Map<string, Unit>();

function indexUnits() {
  unitById = new Map(UNITS.map((u) => [u.id, u]));
  BLOCKS = [...new Set(UNITS.map((u) => u.block))].sort();
  STACKS = [...new Set(UNITS.map((u) => u.stack))].sort();
  FLOORS = Math.max(0, ...UNITS.map((u) => u.floor));
}
indexUnits();

/** A unit from the units table. Unknown ids are parsed from "A-12-08" so screens never crash on them. */
export const getUnit = (id: string): Unit => {
  const u = unitById.get(id);
  if (u) return u;
  const [block = "?", floor = "0", stack = "?"] = id.split("-");
  return { id, block, floor: Number(floor) || 0, stack, contractor: "" };
};

/** The buyer signed in on the buyer app (demo login: always B-0118); name, email and unit come from the buyers table. */
export const DEMO_BUYER: Buyer = {
  id: "B-0118",
  name: "Elsa",
  email: "elsa.demo@example.com",
  unitId: "A-12-08",
};

let buyerById = new Map<string, Buyer>();
export const getBuyer = (id?: string) => (id ? buyerById.get(id) : undefined);

// In-house technicians: inspection visits and minor repairs.
export let TECHNICIANS: Technician[] = [
  { id: "T-01", name: "Olaf", email: "olaf.tech@example.com", skills: ["plumbing", "waterproofing"], blocks: ["A", "B"], kind: "technician" },
  { id: "T-02", name: "Ravi Kumar", email: "ravi.tech@example.com", skills: ["plumbing"], blocks: ["A", "B", "C"], kind: "technician" },
  { id: "T-03", name: "Lim Wei Jie", email: "weijie.tech@example.com", skills: ["electrical"], blocks: ["A", "B", "C"], kind: "technician" },
  { id: "T-04", name: "Nurul Izzah", email: "nurul.tech@example.com", skills: ["civil", "tiling", "painting"], blocks: ["A", "B", "C"], kind: "technician" },
  { id: "T-05", name: "Daniel Tan", email: "daniel.tech@example.com", skills: ["carpentry", "glazing", "general"], blocks: ["A", "B", "C"], kind: "technician" },
  { id: "T-06", name: "Siti Aminah", email: "siti.tech@example.com", skills: ["waterproofing", "civil"], blocks: ["C"], kind: "technician" },
];

// Subcontractors: specialised repair work under contract.
export let SUBCONTRACTORS: Technician[] = [
  { id: "SC-01", name: "Kamal Yusof", company: "Alpha Waterproofing Sdn Bhd", email: "kamal.subcon@example.com", skills: ["waterproofing", "plumbing"], blocks: ["A", "B", "C"], kind: "subcontractor" },
  { id: "SC-02", name: "Tan Mei Ling", company: "Beta Structural Works Sdn Bhd", email: "meiling.subcon@example.com", skills: ["structural", "civil"], blocks: ["A", "B", "C"], kind: "subcontractor" },
  { id: "SC-03", name: "Arjun Pillai", company: "Gamma Tiling & Flooring Sdn Bhd", email: "arjun.subcon@example.com", skills: ["tiling", "flooring"], blocks: ["A", "B", "C"], kind: "subcontractor" },
  { id: "SC-04", name: "Ong Chee Keong", company: "Delta Electrical Services Sdn Bhd", email: "cheekeong.subcon@example.com", skills: ["electrical"], blocks: ["A", "B", "C"], kind: "subcontractor" },
];

export let WORKERS: Technician[] = [...TECHNICIANS, ...SUBCONTRACTORS];

/** Any worker: in-house technician or subcontractor. */
export const getTechnician = (id?: string) => WORKERS.find((t) => t.id === id);

/** Just the person's name, for the buyer's screens where company names don't fit. */
export const workerName = (id?: string) => getTechnician(id)?.name ?? "—";

/** "Kamal Yusof (Alpha Waterproofing Sdn Bhd)" or just the technician's name. */
export const workerLabel = (id?: string) => {
  const w = getTechnician(id);
  return w ? (w.company ? `${w.name} (${w.company})` : w.name) : "—";
};

/** Who repairs what, and roughly how long it takes. Specialised trades go to subcontractors. */
export const REPAIR_PLAN: Record<Category, RepairPlan> = {
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

export const SDP_STAFF = { name: "Farah Lee", title: "SDP Defect Team", email: "sdp.staff@example.com" };

export const SLOT_TIMES = ["09:00", "11:00", "14:00", "16:00"];
/** Each slot is a 2-hour block. */
export let SLOT_HOURS = 2;

let appliedFrom: unknown = null;

/** Adopt the backend's workers and reference data (called by the store on every state from the API). */
export function applyReference(ref: Reference | undefined, workers: Technician[] | undefined) {
  if (workers?.length) {
    WORKERS = workers.map((w) => ({ ...w, company: w.company ?? undefined }));
    TECHNICIANS = WORKERS.filter((w) => w.kind === "technician");
    SUBCONTRACTORS = WORKERS.filter((w) => w.kind === "subcontractor");
  }
  if (!ref) return;
  // Units, buyers and rules rarely change; only rebuild the indexes when the backend sends a new set.
  const key = `${ref.units.length}:${ref.buyers.length}:${JSON.stringify(ref.rules)}:${ref.project}`;
  if (key === appliedFrom) return;
  appliedFrom = key;
  PROJECT_NAME = ref.project;
  UNITS = ref.units;
  indexUnits();
  buyerById = new Map(ref.buyers.map((b) => [b.id, b]));
  Object.assign(DEMO_BUYER, buyerById.get(DEMO_BUYER.id) ?? {});
  Object.assign(SDP_STAFF, ref.sdpStaff);
  Object.assign(RULES, ref.rules);
  Object.assign(CATEGORY_LABEL, ref.categoryLabel);
  Object.assign(REPAIR_PLAN, ref.repairPlan);
  SLOT_TIMES.splice(0, SLOT_TIMES.length, ...ref.slotTimes);
  SLOT_HOURS = ref.slotHours;
}
