// Small display helpers that mirror backend/demo_api/agents.py, plus the VerificationAgent checklist used by the
// offline demo data (seed.ts). The real agent logic runs on the backend.
import { SLOT_HOURS, SLOT_TIMES } from "./constants";
import type { Case, Category, VerificationGuide } from "./types";

// ---------- Repair duration ----------

export const repairBlocks = (hours: number) => Math.min(SLOT_TIMES.length, Math.max(1, Math.ceil(hours / SLOT_HOURS)));

// ---------- Agent names ----------

/** Display name for an agent id: "InitialInspectionAgent" -> "Initial Inspection Agent". */
export const agentLabel = (name: string) => name.replace(/([a-z])([A-Z])/g, "$1 $2");

export const fmtHours =(h: number) => (h >= 8 ? "about 1 day" : `about ${h % 1 ? h.toFixed(1) : h} hour${h === 1 ? "" : "s"}`);

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
    ifFails: `If any check fails, do not sign off: choose "Still not fixed" and add a photo. Your case will be reopened.`,
  };
}
