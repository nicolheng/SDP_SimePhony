"use client";
import { Sparkles } from "lucide-react";
import { getUnit } from "@/lib/constants";
import { useDemo } from "@/lib/store";
import type { Case, Category } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Signs of each kind of defect, worded as what the technician should see. Limits follow kb/tolerances.yaml.
 * `in` matches the buyer's report; a sign without one is checked on site. */
type Sign = { text: string; in?: RegExp };
const SIGNS: Record<Category, Sign[]> = {
  water_leak: [
    { text: "Water dripping or running from the ceiling or wall, not condensation.", in: /drip|leak|running water/i },
    { text: "Brown or yellow discolouration forming irregular patches on the ceiling or wall.", in: /stain|discolou?r|patch|brown|yellow/i },
    { text: "Raised or blistered paint indicating possible moisture trapped underneath.", in: /bubbl|blister|peel/i },
    { text: "Damp surface confirmed with a moisture meter." },
    { text: "Dark mould spots forming near the wet area.", in: /mou?ld|fung|black spot/i },
  ],
  plumbing: [
    { text: "Water leaking from a pipe joint or fitting.", in: /leak|drip/i },
    { text: "Water pooling on the floor below the pipe or fitting.", in: /pool|puddle|wet floor/i },
    { text: "Low or uneven water pressure at the tap.", in: /pressure|weak|slow flow/i },
    { text: "Water meter still moving with all taps off." },
  ],
  drainage: [
    { text: "Standing water stays on the floor away from the drain after it is wetted.", in: /pond|pool|stagnant|puddle|not drain/i },
    { text: "Water drains slowly or backs up from the drain.", in: /slow|clog|block|back/i },
    { text: "Bad smell coming from the floor trap.", in: /smell|odou?r/i },
  ],
  sanitary_fittings: [
    { text: "Water leaking at the base or connection of the fitting.", in: /leak|drip/i },
    { text: "Fitting loose, cracked or not fixed firmly.", in: /loose|broken|crack|wobbl/i },
    { text: "Toilet keeps running after flushing.", in: /running|keeps? flush/i },
  ],
  electrical: [
    { text: "Breaker trips when the circuit is used.", in: /trip/i },
    { text: "Socket, switch or light does not work.", in: /not work|dead|no power|doesn.t work/i },
    { text: "Burning smell, scorch marks or sparks at the point.", in: /burn|scorch|spark|smell/i },
  ],
  wall_crack: [
    { text: "Visible crack more than 1 mm wide on the wall surface.", in: /crack/i },
    { text: "Crack running diagonally from a door or window corner.", in: /door|window|diagonal/i },
    { text: "Crack getting longer or wider since it was first seen.", in: /grow|longer|wider|spread/i },
  ],
  structural_crack: [
    { text: "Crack in a beam, column or slab.", in: /beam|column|slab|crack/i },
    { text: "Concrete flaking off with rusty steel showing.", in: /spall|flak|rust/i },
    { text: "Crack getting wider since it was first seen.", in: /grow|wider|spread/i },
  ],
  tiles: [
    { text: "Adjacent floor tiles have a height difference of more than 1 mm.", in: /uneven|edge|step|lippage|not level/i },
    { text: "Tile sounds hollow when tapped.", in: /hollow|loose|drum/i },
    { text: "Tile cracked or lifted from the floor.", in: /crack|pop|lift|tent|bulg/i },
  ],
  ceiling: [
    { text: "Brown or yellow discolouration forming irregular patches on the ceiling.", in: /stain|discolou?r|patch|brown|yellow/i },
    { text: "Ceiling board sagging or bulging.", in: /sag|bulg/i },
    { text: "Crack in the ceiling or pieces falling from it.", in: /crack|fall|debris|flak/i },
  ],
  door_window: [
    { text: "Visible gap of more than 5 mm between the frame and the surrounding wall where sealing is missing.", in: /gap|seal|draught|draft/i },
    { text: "Rain water coming in around the frame.", in: /leak|rain|water|seep/i },
    { text: "Door or window fails to close or lock in more than 1 of 3 tries.", in: /stuck|stick|jam|hard to|won.t|lock/i },
  ],
  paint: [
    { text: "Raised or blistered paint indicating possible moisture trapped underneath.", in: /bubbl|blister/i },
    { text: "Paint peeling or flaking off the wall.", in: /peel|flak/i },
    { text: "Wall feels damp or shows white powder (efflorescence).", in: /damp|wet|moist|seep|powder|efflor/i },
  ],
  other: [
    { text: "Defect visible in the buyer's photo." },
    { text: "Defect at the spot the buyer pinned on the floor plan." },
    { text: "Defect confirmed on site." },
  ],
};

/**
 * The AI's first look at the defect, before the technician checks it: the signs of this kind of defect, ticked
 * where the buyer's report mentions them, and a one-line summary. Built from the case (IntakeAgent's
 * classification, the buyer's report, the inspection brief); no new AI call. The technician's inspection decides.
 */
export function AiValidityNote({ c, className }: { c: Case; className?: string }) {
  const now = useDemo((s) => s.now);
  const dlpEnd = getUnit(c.unitId).dlpExpiry;
  const dlpOver = !!dlpEnd && new Date(`${dlpEnd}T23:59:59+08:00`) < new Date(now);
  const signs = (SIGNS[c.category] ?? SIGNS.other)
    .map((s) => ({
      text: s.text,
      seen: s.in ? s.in.test(c.description) : s === SIGNS.other[0] && c.photos.length > 0,
    }))
    .sort((x, y) => Number(y.seen) - Number(x.seen));
  // One reason: the sign the report mentions, else the first sign for this kind of defect.
  const sign = signs[0]?.text;

  return (
    <div
      className={cn(
        "rounded-xl p-3 text-sm ring-1",
        "bg-yellow-50 text-yellow-900 ring-yellow-200",
        className,
      )}
    >
      <p className="flex items-center gap-1.5 text-xs font-semibold">
        <Sparkles className="size-3.5" /> AI Suggestion: {dlpOver ? "SDP to decide (defect period ended)" : "Likely a valid defect"}
      </p>
      <p className="mt-1">{sign}</p>
    </div>
  );
}
