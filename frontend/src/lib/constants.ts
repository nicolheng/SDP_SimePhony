import rulesSnapshot from "./rules.snapshot.json";
import type { Buyer, Reference, Rules, Technician, Unit } from "./types";

// Lookup data the screens show. Business rules come from the backend's GET /api/rules via
// applyRules(); rules.snapshot.json is a generated copy of that response, used only until the API
// answers and by the offline demo data in seed.ts. Workers, units and buyers below are built-in defaults until
// applyReference() replaces them with data/simephony.db. The exports keep their names and are updated in place, so
// every screen picks up the backend values.

export const RULES: Rules = rulesSnapshot as Rules;
export const CATEGORY_LABEL = RULES.categoryLabel;
export const REPAIR_PLAN = RULES.repairPlan;
export const SLOT_TIMES = RULES.slotTimes;
export let SLOT_HOURS = RULES.slotHours;

/** Adopt the rules from GET /api/rules. */
export function applyRules(rules: Rules) {
  Object.assign(CATEGORY_LABEL, rules.categoryLabel);
  Object.assign(REPAIR_PLAN, rules.repairPlan);
  SLOT_TIMES.splice(0, SLOT_TIMES.length, ...rules.slotTimes);
  Object.assign(RULES, rules, { categoryLabel: CATEGORY_LABEL, repairPlan: REPAIR_PLAN, slotTimes: SLOT_TIMES });
  SLOT_HOURS = rules.slotHours;
}

export const DEMO_START = "2026-10-19T09:00:00+08:00"; // Monday (offline demo data only)
export const TZ = "Asia/Kuala_Lumpur";

export let PROJECT_NAME = "Residensi Harmoni";

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
  name: "Aisyah Rahman",
  email: "aisyah.demo@example.com",
  unitId: "A-12-08",
};

let buyerById = new Map<string, Buyer>();
export const getBuyer = (id?: string) => (id ? buyerById.get(id) : undefined);

// In-house technicians: inspection visits and minor repairs.
export let TECHNICIANS: Technician[] = [
  { id: "T-01", name: "Hafiz Osman", email: "hafiz.tech@example.com", skills: ["plumbing", "waterproofing"], blocks: ["A", "B"], kind: "technician" },
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

export const SDP_STAFF = { name: "Farah Lee", title: "SDP Defect Team", email: "sdp.staff@example.com" };

let appliedFrom: unknown = null;

/** Adopt the backend's workers and reference data (called by the store on every state from the API). */
export function applyReference(ref: Reference | undefined, workers: Technician[] | undefined) {
  if (workers?.length) {
    WORKERS = workers.map((w) => ({ ...w, company: w.company ?? undefined }));
    TECHNICIANS = WORKERS.filter((w) => w.kind === "technician");
    SUBCONTRACTORS = WORKERS.filter((w) => w.kind === "subcontractor");
  }
  if (!ref) return;
  // Units and buyers rarely change; only rebuild the indexes when the backend sends a new set.
  const key = `${ref.units.length}:${ref.buyers.length}:${ref.project}`;
  if (key === appliedFrom) return;
  appliedFrom = key;
  PROJECT_NAME = ref.project;
  UNITS = ref.units;
  indexUnits();
  buyerById = new Map(ref.buyers.map((b) => [b.id, b]));
  Object.assign(DEMO_BUYER, buyerById.get(DEMO_BUYER.id) ?? {});
  Object.assign(SDP_STAFF, ref.sdpStaff);
}
