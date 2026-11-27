"use client";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface Page {
  title: string;
  content: ReactNode;
  /** Small text after the title, e.g. "2 / 5 done". */
  badge?: ReactNode;
}

/** The element that scrolls this one: the nearest scrolling ancestor, else the page. */
function scrollerOf(el: HTMLElement): HTMLElement {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const y = getComputedStyle(p).overflowY;
    if ((y === "auto" || y === "scroll") && p.scrollHeight > p.clientHeight) return p;
  }
  return (document.scrollingElement as HTMLElement) ?? document.documentElement;
}

/**
 * A few views in one card: swipe left/right on touch screens, or tap the arrows or a dot.
 * Every view sits in the same grid cell (the others hidden), so the card is always as tall as its tallest
 * view. With fit, the card is as tall as the open view instead; it grows or shrinks below, and its top stays
 * where it was on screen.
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
  const root = useRef<HTMLDivElement>(null);
  // Room added at the bottom of the page (never inside the card) when a shorter view would otherwise leave too
  // little page to keep the card in place: {element, its own padding}.
  const padded = useRef<{ el: HTMLElement; was: string } | null>(null);
  const unpad = () => {
    if (padded.current) padded.current.el.style.paddingBottom = padded.current.was;
    padded.current = null;
  };
  const anchorTop = useRef<number | null>(null);
  const go = (n: number) => {
    const next = Math.max(0, Math.min(pages.length - 1, n));
    if (next === i) return;
    // Measure first: removing earlier room can itself move the card, and the effect puts it back.
    anchorTop.current = root.current?.getBoundingClientRect().top ?? null;
    unpad();
    setIndex(next);
  };
  const page = pages[i];

  // Keep the card's top where it was: the new view only changes how far it reaches down.
  useLayoutEffect(() => {
    const el = root.current;
    const before = anchorTop.current;
    anchorTop.current = null;
    if (!el || before === null) return;
    const scroller = scrollerOf(el);
    let drift = el.getBoundingClientRect().top - before;
    if (Math.abs(drift) < 1) return;
    // Near the bottom of the page a shorter view can't be scrolled back into place: add the missing room below.
    const room = scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop;
    if (drift > room) {
      if (!padded.current) padded.current = { el: scroller, was: scroller.style.paddingBottom };
      const current = parseFloat(getComputedStyle(scroller).paddingBottom) || 0;
      scroller.style.paddingBottom = `${current + drift - room}px`;
    }
    scroller.scrollTop += drift;
    drift = el.getBoundingClientRect().top - before;
    if (Math.abs(drift) >= 1) scroller.scrollTop += drift;
  }, [i]);
  // Drop the added room when the pager goes away (e.g. leaving the page).
  useLayoutEffect(() => unpad, []);

  return (
    <div ref={root} className={className} style={{ overflowAnchor: "none" }}>
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
