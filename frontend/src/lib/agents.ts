// Rule-based stand-ins for the ADK agents, so the UI flow works before the real agents exist.
// Each function mirrors one agent's contract in CONTRACTS.md §7.
import { CATEGORY_LABEL, getUnit, RULES, SLOT_TIMES, TECHNICIANS } from "./constants";
import { addDays, dayKey, fmtDate, fmtDateTime, slotIso } from "./dates";
import type { Case, Category, DemoState, InspectionBrief, SimilarRef, Urgency, VerificationGuide } from "./types";

// ---------- IntakeAgent ----------

const CATEGORY_RULES: [RegExp, Category, string][] = [
  [/bocor|leak|seep|drip|titis|basah|damp|lembap|water stain|air masuk/i, "water_leak", "Water leak"],
  [/spark|socket|plug|switch|suis|lampu|light|breaker|trip|wiring|elektrik|power/i, "electrical", "Electrical fault"],
  [/crack|retak/i, "wall_crack", "Crack"],
  [/tile|jubin|hollow|kopak/i, "tiles", "Tile defect"],
  [/door|pintu|window|tingkap|hinge|engsel|lock|kunci|sliding/i, "door_window", "Door / window defect"],
  [/drain|clog|sumbat|longkang|floor trap/i, "drainage", "Drainage issue"],
  [/toilet|tandas|flush|basin|sink|singki|tap|paip/i, "sanitary_fittings", "Sanitary fitting issue"],
  [/paint|peel|mengelupas|\bcat\b/i, "paint", "Paint defect"],
];

const LOCATION_RULES: [RegExp, string][] = [
  [/master|bilik utama/i, "Master bedroom"],
  [/kitchen|dapur/i, "Kitchen"],
  [/bathroom|bilik air|toilet|tandas/i, "Bathroom"],
  [/living|ruang tamu|hall/i, "Living room"],
  [/dining|makan/i, "Dining area"],
  [/balcony|balkoni/i, "Balcony"],
  [/bedroom|bilik/i, "Bedroom"],
  [/entrance|main door|pintu utama/i, "Main entrance"],
];

export interface IntakeResult {
  category: Category;
  subCategory: string;
  location: string;
  summary: string;
  urgency: Urgency;
  mentionsPreviousIssue: boolean;
  missingInfo: string[];
  followUpQuestion?: string;
  nonDefect?: string;
}

export function intakeAgent(description: string, hasPhoto: boolean): IntakeResult {
  const text = description.trim();
  if (/noisy|bising|neighbou?r|jiran|parking|security guard/i.test(text) && !CATEGORY_RULES.some(([re]) => re.test(text))) {
    return {
      category: "other", subCategory: "Not a property defect", location: "", summary: text, urgency: "low",
      mentionsPreviousIssue: false, missingInfo: [],
      nonDefect: "This sounds like a building management matter rather than a defect in your unit. Please contact your Joint Management Body; defect reports cover the unit's construction and fittings.",
    };
  }
  const rule = CATEGORY_RULES.find(([re]) => re.test(text));
  const category = rule?.[1] ?? "other";
  let subCategory = rule?.[2] ?? "General defect";
  if (category === "water_leak") subCategory = /ceiling|siling|atas/i.test(text) ? "Ceiling leak" : /wall|dinding/i.test(text) ? "Wall seepage" : "Water leak";
  const location = LOCATION_RULES.find(([re]) => re.test(text))?.[1] ?? "";

  const missingInfo: string[] = [];
  if (!location) missingInfo.push("location_in_unit");
  if (text.length < 15) missingInfo.push("description_detail");
  if (!hasPhoto) missingInfo.push("photo");

  let urgency: Urgency = "normal";
  if ((category === "water_leak" && /ceiling|siling|socket|light|lampu|banjir|flood|heavy|teruk/i.test(text)) || /spark|burn|hangus|exposed wire|smell/i.test(text)) urgency = "high";
  else if (category === "paint" || /hairline|halus|minor|sikit/i.test(text)) urgency = "low";

  const followUpQuestion = missingInfo.includes("location_in_unit")
    ? "Which room is this in, and roughly where (e.g. ceiling above the wardrobe)?"
    : missingInfo.includes("description_detail")
      ? "Could you describe what you see in a little more detail (size, when it started)?"
      : undefined;

  return {
    category,
    subCategory,
    location,
    summary: location ? `${subCategory} in ${location.toLowerCase()}` : subCategory,
    urgency,
    mentionsPreviousIssue: /again|lagi|still|masih|previous|before|sebelum|berulang/i.test(text),
    missingInfo,
    followUpQuestion,
  };
}

// ---------- SimilarDefectAgent ----------

export function similarDefectAgent(s: DemoState, c: Pick<Case, "id" | "unitId" | "category">) {
  const unit = getUnit(c.unitId);
  const others = s.cases.filter((x) => x.id !== c.id && x.category === c.category && x.status !== "INVALID");
  const sameUnit = others.filter((x) => x.unitId === c.unitId);
  const sameStack = others.filter((x) => {
    const u = getUnit(x.unitId);
    return x.unitId !== c.unitId && u.block === unit.block && u.stack === unit.stack;
  });
  const refs: SimilarRef[] = [
    ...sameUnit.map((x) => ({ caseId: x.id, unitId: x.unitId, at: x.createdAt, reason: `Same unit: ${x.subCategory.toLowerCase()} on ${fmtDate(x.createdAt)}` })),
    ...sameStack.map((x) => {
      const u = getUnit(x.unitId);
      const where = u.floor === unit.floor ? "next door" : u.floor > unit.floor ? `${u.floor - unit.floor} floor(s) above` : `${unit.floor - u.floor} floor(s) below`;
      return { caseId: x.id, unitId: x.unitId, at: x.createdAt, reason: `Same stack ${unit.block}-${unit.stack}, ${where}` };
    }),
  ].slice(0, 8);
  const stackUnits = [...new Set(sameStack.map((x) => x.unitId))];
  return { refs, occurrence: sameUnit.length + 1, stackUnits };
}

// ---------- TriageAgent ----------

export function upcomingSlots(now: string, days = 14) {
  const out: string[] = [];
  for (let d = 1; out.length < days * SLOT_TIMES.length && d <= days + 3; d++) {
    const day = dayKey(addDays(now, d));
    if (new Date(`${day}T12:00:00+08:00`).getUTCDay() === 0) continue; // no Sunday visits
    for (const t of SLOT_TIMES) out.push(slotIso(day, t));
  }
  return out;
}

const busy = (s: DemoState, techId: string, slot: string) => s.bookings.some((b) => b.technicianId === techId && b.slot === slot);

export function techniciansFor(category: Category, block: string) {
  const skills = RULES.categoryToSkill[category];
  return TECHNICIANS.filter((t) => t.blocks.includes(block) && t.skills.some((sk) => skills.includes(sk)));
}

export function freeSlotsFor(s: DemoState, category: Category, block: string) {
  const techs = techniciansFor(category, block);
  return upcomingSlots(s.now).filter((slot) => techs.some((t) => !busy(s, t.id, slot)));
}

export function triageAgent(s: DemoState, c: Case, preferredSlot: string) {
  const unit = getUnit(c.unitId);
  const techs = techniciansFor(c.category, unit.block);
  const skill = RULES.categoryToSkill[c.category].join(" / ");
  const free = techs.find((t) => !busy(s, t.id, preferredSlot));
  if (free) {
    return {
      technicianId: free.id,
      slot: preferredSlot,
      alternatives: [] as string[],
      reason: `${CATEGORY_LABEL[c.category]} needs ${skill}; ${free.name} covers Block ${unit.block} and is free ${fmtDateTime(preferredSlot)}.`,
    };
  }
  const alternatives = freeSlotsFor(s, c.category, unit.block).slice(0, 3);
  const slot = alternatives[0];
  const tech = techs.find((t) => !busy(s, t.id, slot))!;
  return {
    technicianId: tech.id,
    slot,
    alternatives,
    reason: `No ${skill} technician free at the chosen time; booked ${tech.name} at the earliest alternative, ${fmtDateTime(slot)}.`,
  };
}

// ---------- CommsAgent ----------

export function commsAgent(kind: string, c: Case, extra: Record<string, string> = {}) {
  const tech = TECHNICIANS.find((t) => t.id === c.technicianId);
  const ref = `Case ${c.id} (${c.summary})`;
  switch (kind) {
    case "received":
      return { title: "We've received your report", body: `${ref}. ${tech?.name ?? "A technician"} will inspect it on ${extra.slot}.${c.occurrence > 1 ? ` We've linked it to ${c.occurrence - 1} earlier report(s) for your unit.` : ""}` };
    case "info_needed":
      return { title: "We need a little more information", body: `${ref}. ${c.followUpQuestion}` };
    case "valid":
      return { title: "Defect confirmed — please book a repair", body: `${ref}. The technician confirmed the defect: "${extra.note}". Please choose a repair slot in the app.` };
    case "invalid":
      return { title: "Inspection result", body: `${ref}. After inspection, the technician assessed this as not a defect: "${extra.note}". This case is now closed. If the problem gets worse or changes, please submit a new report.` };
    case "repair_booked":
      return { title: "Repair booked", body: `${ref}. Repair is booked for ${extra.slot}.` };
    case "verify":
      return { title: "Please check the repair", body: `${ref}. The repair is done. Follow the short checklist in the app to confirm it is fixed.` };
    case "closed":
      return { title: "Case closed", body: `${ref}. Thank you for confirming the repair. You can reopen this case within ${RULES.gracePeriodDays} days if the problem returns.` };
    case "reopened":
      return { title: "Case reopened", body: `${ref}. We've reopened your case with the new photo you provided. We'll update you on the next step shortly.` };
    case "escalated":
      return { title: "Your case is being reviewed", body: `${ref}. Because this problem has come back, we've asked our team to arrange a more detailed inspection. We'll confirm the visit soon.` };
    case "extra_inspection":
      return { title: "Detailed inspection scheduled", body: `${ref}. A detailed inspection is booked for ${extra.slot} with ${tech?.name ?? "our technician"}.` };
    case "revisit":
      return { title: "Technician revisit booked", body: `${ref}. ${tech?.name ?? "A technician"} will revisit on ${extra.slot}.` };
    default:
      return { title: "Update on your case", body: ref };
  }
}

// ---------- VerificationAgent ----------
// Predefined protocol per category, filled with this case's details only. No general advice.

const PROTOCOLS: Partial<Record<Category, (c: Case, where: string) => string[]>> = {
  water_leak: (c, where) => [
    `Look at the repaired spot (${where}). Compare it with your original photo: there should be no wet patch, drip or new stain.`,
    c.subCategory === "Ceiling leak"
      ? `Run the shower in your bathroom for 10 minutes, then check the repaired ceiling in the ${c.location.toLowerCase() || "same room"} again.`
      : `Run the nearest tap for 10 minutes, then check the repaired area again.`,
    `Touch the repaired surface lightly: it should feel dry, not damp or soft.`,
    `Check once more after the next heavy rain and before your grace period ends.`,
  ],
  electrical: (c, where) => [
    `Use the repaired fitting (${where}) normally: switch it on and off 5 times.`,
    `Check it works each time and nothing flickers, buzzes or feels warm.`,
    `Over the next 24 hours, note if the breaker trips while using it.`,
  ],
  door_window: (c, where) => [
    `Open and close the repaired ${c.subCategory.toLowerCase().includes("window") ? "window" : "door"} (${where}) 10 times.`,
    `Lock and unlock it 3 times: it should move without forcing.`,
    `Check it no longer scrapes or leaves a visible gap when closed.`,
  ],
  tiles: (_c, where) => [
    `Look at the repaired tiles (${where}): check for cracks or gaps in the grout.`,
    `Walk across them normally: they should feel solid with no movement.`,
  ],
  wall_crack: (_c, where) => [
    `Look at the repaired crack (${where}) and compare with your original photo.`,
    `Check again in 7 days: the line should not reappear through the paint.`,
  ],
  paint: (_c, where) => [`Look at the repainted area (${where}): it should be smooth with no bubbles, peeling or patchy colour.`],
  drainage: (_c, where) => [
    `Pour a bucket of water near the repaired drain (${where}).`,
    `It should drain within about a minute with no pooling or smell.`,
  ],
  sanitary_fittings: (c, where) => [
    `Use the repaired ${c.subCategory.toLowerCase()} (${where}) normally 3 times (run the tap / flush).`,
    `Check underneath and around it for drips or wet spots.`,
  ],
};

export function verificationAgent(c: Case): VerificationGuide {
  const where = [c.location, c.summary].filter(Boolean).join(", ").toLowerCase();
  const protocol = PROTOCOLS[c.category];
  const steps = protocol
    ? protocol(c, where)
    : [`Check the item you reported ("${c.description}") in the ${c.location.toLowerCase() || "same spot"}: it should now work or look as expected.`];
  return {
    intro: `Your ${c.summary.toLowerCase()} was repaired.${c.repairNote ? ` Technician's note: "${c.repairNote}".` : ""} Please check only these points:`,
    steps,
    ifFails: `If any check fails, choose "Still not fixed" and add a photo. Your case will be reopened.`,
  };
}

// ---------- RecurrenceAgent ----------

export function recurrenceAgent(s: DemoState, c: Case) {
  const { occurrence, stackUnits } = similarDefectAgent(s, c);
  const unit = getUnit(c.unitId);
  const reasons: string[] = [];
  if (occurrence >= RULES.occurrenceThreshold)
    reasons.push(`${CATEGORY_LABEL[c.category]} reported in ${c.unitId} ${occurrence} times (${occurrence - 1} earlier case(s)), and this case has been reopened ${c.reopenCount}×.`);
  if (stackUnits.length + 1 >= RULES.stackClusterThreshold)
    reasons.push(`${stackUnits.length + 1} units in stack ${unit.block}-${unit.stack} have the same problem: ${[c.unitId, ...stackUnits].join(", ")}.`);
  return { escalate: reasons.length > 0, reasons, occurrence, stackUnits };
}

// ---------- InitialInspectionAgent ----------

const LIKELY_COMPONENTS: Partial<Record<Category, string[]>> = {
  water_leak: [
    "Waterproofing membrane of the bathroom directly above",
    "Water supply pipe joints in the ceiling void",
    "Floor trap and grout seal of the unit above",
    "Vertical service riser shared by the stack",
  ],
  electrical: ["Circuit for the affected socket/fitting", "Junction box behind the fitting", "RCCB/MCB rating"],
  tiles: ["Screed bonding under tiles", "Expansion joints"],
  wall_crack: ["Beam/column junction", "Plaster bonding"],
};

export function initialInspectionAgent(s: DemoState, c: Case): InspectionBrief {
  const unit = getUnit(c.unitId);
  const history = s.cases.filter((x) => x.unitId === c.unitId && x.category === c.category && x.id !== c.id);
  const stack = s.cases.filter((x) => {
    const u = getUnit(x.unitId);
    return x.category === c.category && u.block === unit.block && u.stack === unit.stack && x.unitId !== c.unitId;
  });
  const byUnit = new Map<string, { cases: number; last: string }>();
  for (const x of stack) {
    const cur = byUnit.get(x.unitId);
    byUnit.set(x.unitId, { cases: (cur?.cases ?? 0) + 1, last: cur && cur.last > x.createdAt ? cur.last : x.createdAt });
  }
  const original = c.photos.find((p) => p.kind === "original");
  const reopen = [...c.photos].reverse().find((p) => p.kind === "reopen");
  return {
    generatedAt: s.now,
    timeline: [
      ...history.map((x) => ({ at: x.createdAt, text: `${x.id}: ${x.summary} — repaired, closed ${fmtDate(x.closedAt ?? x.createdAt)}` })),
      { at: c.createdAt, text: `${c.id}: reported — ${c.summary}` },
      ...(c.verdict ? [{ at: c.verdict.at, text: `Technician confirmed: ${c.verdict.note}` }] : []),
      ...(c.verification ? [{ at: c.verification.at, text: `Buyer verification: ${c.verification.result.replace("_", " ").toLowerCase()}` }] : []),
      { at: s.now, text: `Reopened ${c.reopenCount}× within grace period; escalated to SDP and approved` },
    ].sort((a, b) => a.at.localeCompare(b.at)),
    photoComparison:
      original && reopen
        ? "Original and reopen photos attached. Compare the stain's size and position: if it has moved or grown, the source is likely above, not the repaired patch."
        : "Reopen photo not available; take before/after photos on site.",
    neighbouringUnits: [...byUnit.entries()].map(([unitId, v]) => ({ unitId, ...v })).sort((a, b) => getUnit(b.unitId).floor - getUnit(a.unitId).floor),
    likelyComponents: LIKELY_COMPONENTS[c.category] ?? ["Original repair area", "Adjacent fittings"],
    checklist: [
      `Inspect the original repair in ${c.unitId} (${c.location || "reported area"}).`,
      `Inspect the unit directly above (${unit.block}-${unit.floor + 1}-${unit.stack}) at the same position.`,
      ...(c.category === "water_leak" ? ["Moisture-meter readings at the repair and 1 m around it.", "Flood test of the bathroom above for 24 h if accessible."] : []),
      "Photograph each check point and attach to the case.",
      "Record the root cause and whether other units in the stack need the same fix.",
    ],
  };
}
