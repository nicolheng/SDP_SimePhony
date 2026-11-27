"use client";
import { Check } from "lucide-react";
import { type ReactNode, useState } from "react";
import { fmtDate } from "@/lib/dates";
import type { Case } from "@/lib/types";
import { cn } from "@/lib/utils";
import { PhotoThumb } from "./photo";
import { type Page, SwipePager } from "./swipe-pager";

const H3 = "mb-2 text-xs font-semibold text-zinc-500";

/**
 * The inspection brief. paged: a few parts per view (checklist, suggested verify method or repair, where to look, timeline) that the
 * technician swipes or taps through; otherwise every part stacked, as SDP staff see it.
 */
export function InspectionBriefView({
  c,
  interactive,
  paged,
  nearby,
  suggested,
}: {
  c: Case;
  interactive?: boolean;
  paged?: boolean;
  /** paged only: same-stack defects, shown under "Where to Look" in place of the brief's neighbouring units. */
  nearby?: ReactNode;
  /** paged only: the suggested verify method (inspection) or repair (after Valid), shown after the checklist. */
  suggested?: { title: string; content: ReactNode };
}) {
  const b = c.inspectionBrief;
  const [done, setDone] = useState<number[]>([]);
  if (!b) {
    if (!paged) return null;
    // No brief (not a recurring defect): just the suggestion and the neighbouring units' cases.
    const pages: Page[] = [
      ...(suggested ? [suggested] : []),
      ...(nearby
        ? [{ title: "Neighbouring Units", content: (
            <div>
              <h3 className={H3}>Same Problem in Neighbouring Units</h3>
              {nearby}
            </div>
          ) }]
        : []),
    ];
    return pages.length ? <SwipePager pages={pages} fit /> : null;
  }
  const original = c.photos.find((p) => p.kind === "original");
  const reopen = [...c.photos].reverse().find((p) => p.kind === "reopen");

  const checklist = (
    <ol className="space-y-2">
      {b.checklist.map((x, i) => {
        const on = done.includes(i);
        return (
          <li key={i}>
            <button
              type="button"
              disabled={!interactive}
              onClick={() => setDone(on ? done.filter((d) => d !== i) : [...done, i])}
              className={cn(
                "flex w-full items-start gap-2.5 rounded-xl text-left ring-1",
                paged ? "p-3 text-sm" : "p-2 text-xs",
                on ? "bg-emerald-50 ring-emerald-200" : "bg-white ring-zinc-200",
              )}
            >
              <span
                className={cn(
                  "grid shrink-0 place-items-center rounded border",
                  paged ? "mt-0.5 size-5" : "size-4",
                  on ? "border-emerald-500 bg-emerald-500 text-white" : "border-zinc-300",
                )}
              >
                {on && <Check className="size-3" strokeWidth={3} />}
              </span>
              <span className={cn(on && paged && "text-zinc-500 line-through")}>{x}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );

  const photos = (
    <>
      {(original || reopen) && (
        <div className="grid grid-cols-2 gap-2">
          {original && <PhotoThumb photo={original} className="aspect-[4/3]" />}
          {reopen && <PhotoThumb photo={reopen} className="aspect-[4/3]" />}
        </div>
      )}
      <p className={cn("mt-2 text-zinc-700", paged ? "text-sm" : "text-xs")}>{b.photoComparison}</p>
    </>
  );

  const timeline = (
    <ol className={cn("border-zinc-200", paged ? "space-y-3 border-l-2 pl-4" : "space-y-1 border-l pl-3")}>
      {b.timeline.map((t, i) => (
        <li key={i} className={paged ? "text-sm" : "text-xs"}>
          {paged ? (
            <>
              <p className="text-xs font-medium text-zinc-500">{fmtDate(t.at)}</p>
              <p className="text-zinc-800">{t.text}</p>
            </>
          ) : (
            <>
              <span className="text-zinc-400">{fmtDate(t.at)}</span> — {t.text}
            </>
          )}
        </li>
      ))}
    </ol>
  );

  // The brief names parts as ids (window_sealant): show them as words (Window sealant).
  const partName = (x: string) => {
    const t = x.replace(/[_-]+/g, " ").trim();
    return t.charAt(0).toUpperCase() + t.slice(1);
  };
  const components = paged ? (
    <ul className="flex flex-wrap gap-1.5">
      {b.likelyComponents.map((x) => (
        <li key={x} className="rounded-lg bg-zinc-100 px-2.5 py-1 text-sm text-zinc-800">
          {partName(x)}
        </li>
      ))}
    </ul>
  ) : (
    <ul className="list-disc space-y-1 pl-4 text-xs text-zinc-700">
      {b.likelyComponents.map((x) => (
        <li key={x}>{partName(x)}</li>
      ))}
    </ul>
  );

  const neighbours = b.neighbouringUnits.length > 0 && (
    <ul className="flex flex-wrap gap-1.5">
      {b.neighbouringUnits.map((u) => (
        <li key={u.unitId} className="rounded-lg bg-amber-50 px-2 py-1 text-xs text-amber-900 ring-1 ring-amber-200">
          <span className="font-mono font-semibold">{u.unitId}</span> · last {fmtDate(u.last)}
        </li>
      ))}
    </ul>
  );

  if (paged) {
    const pages: Page[] = [
      { title: "Checklist", badge: `${done.length}/${b.checklist.length}`, content: checklist },
      ...(suggested ? [suggested] : []),
      { title: "Where to Look", content: (
        <div className="space-y-4">
          <div>
            <h3 className={H3}>Parts to Check</h3>
            {components}
          </div>
          {(nearby || neighbours) && (
            <div>
              <h3 className={H3}>Same Problem in Neighbouring Units</h3>
              {nearby ?? neighbours}
            </div>
          )}
        </div>
      ) },
      { title: "Timeline", content: <div className="max-h-[28rem] overflow-y-auto overscroll-contain p-0.5 pr-1.5">{timeline}</div> },
    ];
    // Same height for every view; a longer one (checklist, timeline) scrolls inside the card.
    return <SwipePager pages={pages} fit />;
  }

  return (
    <div className="space-y-4 text-sm">
      <div>
        <h3 className={H3}>Timeline</h3>
        {timeline}
      </div>
      <div>
        <h3 className={H3}>Photo Comparison</h3>
        {photos}
      </div>
      {neighbours && (
        <div>
          <h3 className={H3}>Neighbouring Units with the Same Problem</h3>
          {neighbours}
        </div>
      )}
      <div>
        <h3 className={H3}>Parts to Check</h3>
        {components}
      </div>
      <div>
        <h3 className={H3}>Checklist</h3>
        {checklist}
      </div>
    </div>
  );
}
