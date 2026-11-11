"use client";
// The unit floor plan (lib/floor-plan.json): the buyer taps where a defect is; case pages show that pin.
// backend/floor_plan.py reads the same file to name the room a pin falls in, so the drawing and the room the
// case gets always agree. With an "image" set on the layout, the picture is shown instead of the drawn rooms.
import { MapPin } from "lucide-react";
import { useRef } from "react";
import plans from "@/lib/floor-plan.json";
import { cn } from "@/lib/utils";
import type { CasePin } from "@/lib/types";

type Pt = [number, number];
interface Room {
  id: string;
  label: string;
  /** Label lines when the full name doesn't fit the room. */
  display?: string[];
  points: Pt[];
  labelAt?: Pt;
  wet?: boolean;
  outdoor?: boolean;
}
export interface FloorPlanLayout {
  name: string;
  width: number;
  height: number;
  image: string | null;
  entrance?: Pt;
  rooms: Room[];
}

export const WHOLE_UNIT = "Whole unit";

export function floorPlanFor(unitId: string): FloorPlanLayout {
  const units = plans.units as Record<string, string>;
  const layouts = plans.layouts as unknown as Record<string, FloorPlanLayout>;
  return layouts[units[unitId] ?? plans.default];
}

function inside(x: number, y: number, pts: Pt[]) {
  let hit = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[j];
    if (y1 > y !== y2 > y && x < x1 + ((y - y1) * (x2 - x1)) / (y2 - y1)) hit = !hit;
  }
  return hit;
}

/** The room at a pin (fractions of the plan's width and height). The backend works it out again on submit. */
export function roomAt(layout: FloorPlanLayout, x: number, y: number): string | null {
  const px = x * layout.width;
  const py = y * layout.height;
  return layout.rooms.find((r) => inside(px, py, r.points))?.label ?? null;
}

function labelPoint(r: Room): Pt {
  if (r.labelAt) return r.labelAt;
  const xs = r.points.map((p) => p[0]);
  const ys = r.points.map((p) => p[1]);
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
}

export interface PlanPin {
  x: number;
  y: number;
  /** Shown inside the marker ("1", "2"); empty for a single pin. */
  label?: string;
  /** The pin being placed or moved: brand red; the others are grey. */
  active?: boolean;
}

// Teardrop marker with its tip at (0, 0), in plan units.
const MARKER = "M0 0C-1.4-2.3-3.1-3.6-3.1-5.7a3.1 3.1 0 1 1 6.2 0C3.1-3.6 1.4-2.3 0 0Z";

export function FloorPlan({
  unitId,
  pins = [],
  onPick,
  onPinClick,
  className,
  label,
}: {
  unitId: string;
  pins?: PlanPin[];
  /** Makes the plan tappable: called with the spot (fractions 0-1) and the room there. */
  onPick?: (x: number, y: number, room: string) => void;
  onPinClick?: (index: number) => void;
  className?: string;
  /** Accessible name, e.g. "Floor plan with the defect pinned in the kitchen". */
  label?: string;
}) {
  const layout = floorPlanFor(unitId);
  const svgRef = useRef<SVGSVGElement>(null);
  const { width: w, height: h } = layout;
  const activeRoom = pins.find((p) => p.active) ?? (pins.length === 1 ? pins[0] : undefined);
  const highlighted = activeRoom ? roomAt(layout, activeRoom.x, activeRoom.y) : null;
  const pad = 2;
  const bottom = layout.entrance ? 7 : pad;

  function pick(e: React.MouseEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm || !onPick) return;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    if (p.x < 0 || p.y < 0 || p.x > w || p.y > h) return;
    const x = p.x / w;
    const y = p.y / h;
    const room = roomAt(layout, x, y);
    if (room) onPick(x, y, room);
  }

  return (
    <svg
      ref={svgRef}
      viewBox={`${-pad} ${-pad} ${w + pad * 2} ${h + pad + bottom}`}
      className={cn("block w-full select-none", onPick && "cursor-crosshair touch-manipulation", className)}
      onClick={onPick ? pick : undefined}
      role="img"
      aria-label={label ?? `Floor plan, ${layout.name}`}
    >
      <defs>
        <pattern id="fp-hatch" width="2" height="2" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="2" className="stroke-zinc-200" strokeWidth="0.7" />
        </pattern>
      </defs>

      {layout.image && (
        <image href={layout.image} x={0} y={0} width={w} height={h} preserveAspectRatio="none" />
      )}

      {layout.rooms.map((r) => {
        const pts = r.points.map((p) => p.join(",")).join(" ");
        const on = r.label === highlighted;
        return (
          <polygon
            key={r.id}
            points={pts}
            fill={layout.image ? (on ? "rgb(215 25 32 / 0.12)" : "transparent") : r.outdoor && !on ? "url(#fp-hatch)" : undefined}
            className={cn(
              !layout.image && (on ? "fill-red-50" : r.wet ? "fill-sky-50/70" : r.outdoor ? "" : "fill-white"),
              layout.image ? "stroke-transparent" : "stroke-zinc-400",
              "transition-colors",
            )}
            strokeWidth={0.6}
          />
        );
      })}

      {!layout.image && (
        <>
          <rect x={0} y={0} width={w} height={h} fill="none" className="stroke-zinc-700" strokeWidth={1.4} />
          {layout.entrance && (
            <g>
              <line x1={layout.entrance[0] - 4} y1={layout.entrance[1]} x2={layout.entrance[0] + 4} y2={layout.entrance[1]} className="stroke-white" strokeWidth={1.8} />
              <text x={layout.entrance[0]} y={layout.entrance[1] + 4.6} textAnchor="middle" className="fill-zinc-500" fontSize={2.6} fontWeight={600}>
                ENTRANCE
              </text>
            </g>
          )}
          {layout.rooms.map((r) => {
            const [lx, ly] = labelPoint(r);
            const lines = r.display ?? [r.label];
            const on = r.label === highlighted;
            return (
              <text
                key={r.id}
                x={lx}
                y={ly - ((lines.length - 1) * 3.2) / 2}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={lines.length > 1 ? 2.4 : 2.7}
                fontWeight={on ? 700 : 500}
                className={cn("pointer-events-none", on ? "fill-brand" : "fill-zinc-500")}
              >
                {lines.map((line, i) => (
                  <tspan key={i} x={lx} dy={i === 0 ? 0 : 3.2}>
                    {line}
                  </tspan>
                ))}
              </text>
            );
          })}
        </>
      )}

      {pins.map((p, i) => (
        <g
          key={i}
          transform={`translate(${p.x * w} ${p.y * h})`}
          onClick={
            onPinClick
              ? (e) => {
                  e.stopPropagation();
                  onPinClick(i);
                }
              : undefined
          }
          className={cn(onPinClick && "cursor-pointer")}
        >
          <ellipse cx={0} cy={0} rx={1.6} ry={0.6} className="fill-zinc-900/20" />
          <path d={MARKER} className={cn(p.active || pins.length === 1 ? "fill-brand" : "fill-zinc-500", "stroke-white")} strokeWidth={0.5} />
          {p.label ? (
            <text x={0} y={-5.6} textAnchor="middle" dominantBaseline="central" fontSize={3.2} fontWeight={700} className="pointer-events-none fill-white">
              {p.label}
            </text>
          ) : (
            <circle cx={0} cy={-5.7} r={1.1} className="fill-white" />
          )}
        </g>
      ))}
    </svg>
  );
}

/** A case's pin on the unit floor plan, for the case pages. Nothing for cases reported without one. */
export function CasePinMap({ unitId, pin, className }: { unitId: string; pin?: CasePin | null; className?: string }) {
  if (!pin) return null;
  const whole = pin.room === WHOLE_UNIT || pin.x == null || pin.y == null;
  return (
    <div className={cn("rounded-xl bg-zinc-50 p-2 ring-1 ring-zinc-200", className)}>
      <FloorPlan
        unitId={unitId}
        pins={whole ? [] : [{ x: pin.x!, y: pin.y! }]}
        className={whole ? "opacity-60" : undefined}
        label={whole ? "Floor plan: the buyer marked the whole unit" : `Floor plan with the defect pinned in the ${pin.room.toLowerCase()}`}
      />
      <p className="mt-1.5 flex items-center gap-1 px-1 text-xs text-zinc-600">
        <MapPin className="size-3.5 text-brand" />
        {whole ? "Buyer marked the whole unit (not one spot)" : `Pinned by the buyer in the ${pin.room.toLowerCase()}`}
      </p>
    </div>
  );
}
