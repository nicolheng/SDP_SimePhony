"use client";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { type ReactNode, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface Page {
  title: string;
  content: ReactNode;
  /** Small text after the title, e.g. "2 / 5 done". */
  badge?: ReactNode;
}

/**
 * A few views in one card: swipe left/right on touch screens, or tap the arrows or a dot.
 * Every view sits in the same grid cell (the others hidden), so the card is always as tall as its tallest
 * view and switching never moves the card or the page under the user's finger.
 */
export function SwipePager({
  pages,
  className,
  viewClassName,
  fit,
}: {
  pages: Page[];
  className?: string;
  /** Size the card to the open view instead of the tallest one (the card grows and shrinks as you switch). */
  fit?: boolean;
  /** A fixed height for every view (e.g. "h-64"): longer views scroll inside, so short ones leave little empty space. */
  viewClassName?: string;
}) {
  const [index, setIndex] = useState(0);
  const start = useRef<{ x: number; y: number } | null>(null);
  const i = Math.min(index, pages.length - 1);
  const go = (n: number) => setIndex(Math.max(0, Math.min(pages.length - 1, n)));
  const page = pages[i];

  return (
    <div className={className}>
      <div className="mb-3 flex select-none items-center gap-2">
        <ArrowButton dir="left" disabled={i === 0} onClick={() => go(i - 1)} />
        <div className="min-w-0 flex-1 text-center">
          <p className="truncate text-sm font-semibold text-zinc-900">
            {page.title}
            {page.badge && <span className="ml-1.5 text-xs font-medium text-zinc-500">{page.badge}</span>}
          </p>
          <div className="mt-1 flex justify-center gap-1.5">
            {pages.map((p, n) => (
              <button
                key={p.title}
                type="button"
                onClick={() => go(n)}
                aria-label={`Show ${p.title}`}
                aria-current={n === i}
                className={cn("h-1.5 rounded-full transition-all", n === i ? "w-5 bg-brand" : "w-1.5 bg-zinc-300")}
              />
            ))}
          </div>
        </div>
        <ArrowButton dir="right" disabled={i === pages.length - 1} onClick={() => go(i + 1)} />
      </div>
      <div
        className="touch-pan-y"
        onTouchStart={(e) => {
          const t = e.touches[0];
          start.current = { x: t.clientX, y: t.clientY };
        }}
        onTouchEnd={(e) => {
          const s = start.current;
          start.current = null;
          if (!s) return;
          const t = e.changedTouches[0];
          const dx = t.clientX - s.x;
          // A clear sideways swipe only, so scrolling the page up and down never flips it.
          if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(t.clientY - s.y) * 1.5) go(dx < 0 ? i + 1 : i - 1);
        }}
      >
        <div className="grid">
          {pages.map((p, n) => (fit && n !== i ? null : (
            <div
              key={p.title}
              aria-hidden={n !== i}
              inert={n !== i}
              className={cn(
                "[grid-area:1/1] min-w-0",
                viewClassName && cn("overflow-y-auto overscroll-contain p-0.5 pr-1.5", viewClassName),
                n !== i && "invisible",
              )}
            >
              {p.content}
            </div>
          )))}
        </div>
      </div>
    </div>
  );
}

function ArrowButton({ dir, disabled, onClick }: { dir: "left" | "right"; disabled: boolean; onClick: () => void }) {
  const Icon = dir === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={dir === "left" ? "Previous" : "Next"}
      className="grid size-9 shrink-0 place-items-center rounded-full text-zinc-700 ring-1 ring-zinc-200 transition hover:bg-zinc-50 disabled:opacity-30"
    >
      <Icon className="size-5" />
    </button>
  );
}
