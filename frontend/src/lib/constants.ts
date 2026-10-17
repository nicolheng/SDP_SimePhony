import type { Category, Technician, Unit } from "./types";

// Mirrors rules.yaml. When the backend exists, fetch these from it instead.
export const RULES = {
  gracePeriodDays: 30,
  occurrenceThreshold: 3,
  stackClusterThreshold: 3,
  categoryToSkill: {
    water_leak: ["plumbing", "waterproofing"],
    plumbing: ["plumbing"],
    drainage: ["plumbing"],
    sanitary_fittings: ["plumbing"],
    electrical: ["electrical"],
    wall_crack: ["civil"],
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

export const DEMO_BUYER = {
  id: "B-A-12-08",
  name: "Aisyah Rahman",
  email: "aisyah.demo@example.com",
  unitId: "A-12-08",
};

export const SDP_STAFF_EMAIL = "sdp.staff@example.com";

export const TECHNICIANS: Technician[] = [
  { id: "T-01", name: "Hafiz Osman", email: "hafiz.tech@example.com", skills: ["plumbing", "waterproofing"], blocks: ["A", "B"] },
  { id: "T-02", name: "Ravi Kumar", email: "ravi.tech@example.com", skills: ["plumbing"], blocks: ["A", "B", "C"] },
  { id: "T-03", name: "Lim Wei Jie", email: "weijie.tech@example.com", skills: ["electrical"], blocks: ["A", "B", "C"] },
  { id: "T-04", name: "Nurul Izzah", email: "nurul.tech@example.com", skills: ["civil", "tiling", "painting"], blocks: ["A", "B", "C"] },
  { id: "T-05", name: "Daniel Tan", email: "daniel.tech@example.com", skills: ["carpentry", "glazing", "general"], blocks: ["A", "B", "C"] },
  { id: "T-06", name: "Siti Aminah", email: "siti.tech@example.com", skills: ["waterproofing", "civil"], blocks: ["C"] },
];

export const getTechnician = (id?: string) => TECHNICIANS.find((t) => t.id === id);

export const SLOT_TIMES = ["09:00", "11:00", "14:00", "16:00"];
