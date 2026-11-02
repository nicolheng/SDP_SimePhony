// Technician inspection sheet: what to check on site per defect type, and how to decide Valid / Invalid.
// General guidance only; the technician's judgement on site decides the verdict.

export interface TechGuideSection {
  id: string;
  title: string;
  checks: string[];
  valid: string[];
  invalid: string[];
}

export const TECH_GENERAL = [
  "Review the buyer's photos, description and the AI inspection brief before the visit.",
  "Take one close-up and one wide photo of the defect; both are attached to your result.",
  "Write findings in plain language: the buyer reads your note.",
  "Isolate power or water before testing anything unsafe, and never leave a hazard unattended.",
];

export const TECH_GUIDE: TechGuideSection[] = [
  {
    id: "water_leak",
    title: "Water leaks & damp",
    checks: [
      "Take a moisture reading at the stain and at a dry reference point.",
      "Trace the source: unit above, bathroom waterproofing, window seal or riser pipe.",
      "Check whether other units in the same stack have reported leaks.",
    ],
    valid: ["Active seepage or high moisture reading", "Failed waterproofing, sealant or pipe joint"],
    invalid: ["Condensation from air-conditioning or ventilation", "Damage caused by the occupant's fittings or renovation"],
  },
  {
    id: "electrical",
    title: "Electrical",
    checks: [
      "Test the socket or circuit with a tester; note the breaker that trips.",
      "Inspect for scorch marks, loose terminals or exposed wiring.",
      "Isolate the circuit if there is any sign of overheating.",
    ],
    valid: ["Faulty wiring, socket or breaker installed by the developer", "Breaker trips under normal load"],
    invalid: ["Faulty appliance belonging to the buyer", "Circuit overloaded by the buyer's own additions"],
  },
  {
    id: "cracks",
    title: "Wall & structural cracks",
    checks: [
      "Measure the crack width and length; photograph it with a scale.",
      "Note the direction (diagonal, horizontal) and whether it passes through beams or columns.",
      "Check for signs of movement: doors sticking, tiles cracking nearby.",
    ],
    valid: ["Crack wider than hairline, or growing", "Diagonal or structural crack: flag for extra inspection"],
    invalid: ["Superficial hairline shrinkage crack in plaster", "Impact damage caused by the occupant"],
  },
  {
    id: "tiles",
    title: "Tiles & flooring",
    checks: [
      "Tap the tiles to find hollow areas and mark their extent.",
      "Check for lifting edges, cracks and missing grout.",
      "Check the floor level and falls near drains.",
    ],
    valid: ["Hollow, lifting or cracked tiles from poor bonding", "Incorrect falls causing ponding"],
    invalid: ["Chips or scratches from moving furniture", "Stains from cleaning products"],
  },
  {
    id: "door_window",
    title: "Doors & windows",
    checks: [
      "Open and close fully; check rollers, hinges, locks and alignment.",
      "Check seals and the frame joint for gaps or water entry.",
      "Check glass panels and handles are secure.",
    ],
    valid: ["Misaligned frame, faulty hardware or failed seal", "Loose glass or panel (high priority)"],
    invalid: ["Damage from forcing or misuse", "Hardware added or changed by the occupant"],
  },
  {
    id: "plumbing",
    title: "Plumbing, drainage & sanitary",
    checks: [
      "Run taps, shower and flush; check flow, pressure and drainage time.",
      "Inspect joints, traps and the floor trap for leaks or blockages.",
      "Check fittings are secure and sealed to the wall or floor.",
    ],
    valid: ["Leaking joint, faulty fitting or incorrect pipe fall", "Blockage from construction debris"],
    invalid: ["Blockage from hair, grease or foreign objects", "Fittings installed by the occupant"],
  },
  {
    id: "paint_ceiling",
    title: "Paint & ceiling",
    checks: [
      "Check for peeling, bubbling or uneven finish; test whether the surface is damp.",
      "Check ceiling boards for sagging, cracks at joints or water stains.",
      "Find the cause first: damp paint usually means a leak behind it.",
    ],
    valid: ["Peeling or bubbling from poor workmanship", "Sagging or cracked ceiling board"],
    invalid: ["Marks, scuffs or wear from normal use", "Repainting or alterations by the occupant"],
  },
];
