// Buyer self-inspection sheet: what to check per defect category, plus FAQs. General guidance only;
// the technician's inspection visit decides whether something is a defect.
import type { Category } from "./types";

export interface GuideSection {
  id: string;
  title: string;
  categories: Category[];
  checks: string[];
  faqs: { q: string; a: string }[];
}

export const GENERAL_TIPS = [
  "Check each room in daylight, with all lights switched on.",
  "Take one close-up photo and one wider photo showing where the problem is.",
  "Note when it happens (e.g. only after heavy rain, only when the shower runs).",
  "Don't open electrical panels, climb ladders, or try to repair anything yourself.",
];

export const INSPECTION_GUIDE: GuideSection[] = [
  {
    id: "water_leak",
    title: "Water leaks & damp",
    categories: ["water_leak"],
    checks: [
      "Look for stains, bubbling paint or drips on ceilings, especially below bathrooms.",
      "Check walls near windows and the balcony for damp patches after rain.",
      "Look around the base of the toilet, shower and under the kitchen sink.",
      "Touch the surface lightly: damp or soft plaster is worth reporting.",
    ],
    faqs: [
      { q: "The stain only appears after heavy rain. Should I still report it?", a: "Yes. Mention that it appears after rain; it helps the technician find the source." },
      { q: "Should I wait for it to dry before reporting?", a: "No. Report while it's visible and take a photo, so the technician can see the extent." },
      { q: "My neighbour above has the same problem. Does that matter?", a: "Yes. Say so in your report; leaks that repeat along a stack of units are checked together." },
    ],
  },
  {
    id: "electrical",
    title: "Electrical",
    categories: ["electrical"],
    checks: [
      "Switch every light and fan on and off.",
      "Test each power socket with a small device (e.g. a phone charger).",
      "Note if the breaker trips, and what was switched on when it did.",
      "Look for scorch marks, buzzing or a burning smell (report these as urgent).",
    ],
    faqs: [
      { q: "A socket sparked or smells of burning. What do I do?", a: "Stop using it, switch off that circuit at the breaker if it's safe to, and report it straight away as urgent." },
      { q: "Can I open the switchboard to check?", a: "No. Leave anything behind covers or panels to the technician." },
    ],
  },
  {
    id: "cracks",
    title: "Wall & structural cracks",
    categories: ["wall_crack", "structural_crack"],
    checks: [
      "Look at walls above doors and windows, and where walls meet beams or columns.",
      "Measure roughly how long and wide the crack is (a coin next to it in the photo helps).",
      "Check whether it goes through the plaster or only the paint.",
      "Note if it grows, or if doors start sticking nearby.",
    ],
    faqs: [
      { q: "Are thin hairline cracks a defect?", a: "Fine surface cracks are common as plaster dries, but report them anyway; the technician will assess them." },
      { q: "When is a crack urgent?", a: "If it is wide, runs diagonally across a beam or column, or keeps growing, report it as urgent." },
    ],
  },
  {
    id: "tiles",
    title: "Tiles & flooring",
    categories: ["tiles"],
    checks: [
      "Walk across floors: listen for hollow-sounding or loose tiles.",
      "Look for cracked, chipped or uneven tiles and gaps in the grout.",
      "In bathrooms, pour a little water and check it flows to the floor trap.",
    ],
    faqs: [
      { q: "How do I check for hollow tiles?", a: "Tap gently with your knuckle or a coin. A dull, hollow sound compared with nearby tiles is worth reporting." },
      { q: "Water pools on my bathroom floor. Is that a defect?", a: "If water doesn't drain to the floor trap, report it with a photo of the pooling." },
    ],
  },
  {
    id: "door_window",
    title: "Doors & windows",
    categories: ["door_window"],
    checks: [
      "Open, close and lock every door and window.",
      "Check for scraping, gaps when closed, or hinges that are loose.",
      "Look for cracked glass and damaged seals or rubber strips.",
    ],
    faqs: [
      { q: "The door only sticks sometimes. Should I report it?", a: "Yes. Say when it happens (e.g. in the morning, after rain)." },
    ],
  },
  {
    id: "plumbing",
    title: "Plumbing, drains & fittings",
    categories: ["plumbing", "drainage", "sanitary_fittings"],
    checks: [
      "Run each tap for a minute: check the pressure and look underneath for drips.",
      "Flush the toilet several times and check around the base.",
      "Check that sinks, showers and floor traps drain quickly with no bad smell.",
      "Check that basins and toilets are firmly fixed.",
    ],
    faqs: [
      { q: "There's a bad smell from the floor trap.", a: "Run water for a minute first. If the smell stays, report it as a drainage issue." },
    ],
  },
  {
    id: "paint_ceiling",
    title: "Paint & ceiling finishes",
    categories: ["paint", "ceiling"],
    checks: [
      "Look for peeling, bubbling or patchy paint, especially near windows.",
      "Check ceilings for cracks along board joints or sagging areas.",
    ],
    faqs: [
      { q: "Paint is bubbling on one wall.", a: "Bubbling can be a sign of damp behind it. Report it and mention any leaks nearby." },
    ],
  },
];
