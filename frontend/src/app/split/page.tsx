"use client";
import { ExternalLink, RotateCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/** Demo view: the buyer and technician apps side by side, each the real app inside a phone frame.
 *  Actions in one phone show up in the other at once (store.ts broadcasts state changes across frames/tabs). */
const PANES = [
  { src: "/buyer", label: "Buyer" },
  { src: "/technician", label: "Technician / Subcontractor" },
];

// Same phone as MobileFrame on desktop: 420 × 860 with a 10 px bezel, so the screen inside is 400 × 840.
const PHONE_W = 420;
const PHONE_H = 860;
const BEZEL = 10;
const LABEL_H = 28;
const GAP = 96;

export default function SplitView() {
  const area = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [key, setKey] = useState(0);

  // Shrink both phones to fit the window, never enlarge.
  useEffect(() => {
    const fit = () => {
      const el = area.current;
      if (!el) return;
      const byHeight = (el.clientHeight - 16) / (PHONE_H + LABEL_H);
      const byWidth = (el.clientWidth - 32) / (PHONE_W * PANES.length + GAP * (PANES.length - 1));
      setScale(Math.min(1, byHeight, byWidth));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-zinc-200">
      <header className="flex shrink-0 items-center gap-3 bg-ink px-4 py-2 text-sm text-white">
        <span className="font-semibold">Side by Side: Buyer &amp; Technician</span>
        <span className="hidden text-zinc-400 sm:inline">Act in one phone and watch the other update.</span>
        <button
          type="button"
          onClick={() => setKey((k) => k + 1)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 ring-1 ring-white/20 hover:bg-white/10"
        >
          <RotateCw className="size-3.5" /> Reload both
        </button>
        <a href="/sdp" className="rounded-lg px-2.5 py-1 ring-1 ring-white/20 hover:bg-white/10">
          Staff view
        </a>
      </header>
      <div ref={area} className="flex min-h-0 flex-1 items-start justify-center pt-3" style={{ gap: GAP * scale }}>
        {PANES.map((p) => (
          <div key={p.src} className="shrink-0" style={{ width: PHONE_W * scale, height: (PHONE_H + LABEL_H) * scale }}>
            <div style={{ width: PHONE_W, transform: `scale(${scale})`, transformOrigin: "top left" }}>
              <p className="flex items-center justify-center gap-2 text-sm font-semibold text-zinc-700" style={{ height: LABEL_H }}>
                {p.label}
                <a href={p.src} target="_blank" rel="noreferrer" className="text-zinc-400 hover:text-zinc-700" aria-label={`Open ${p.label} in a new tab`}>
                  <ExternalLink className="size-3.5" />
                </a>
              </p>
              <div className="overflow-hidden rounded-[2.5rem] border-zinc-900 bg-white shadow-2xl" style={{ width: PHONE_W, height: PHONE_H, borderWidth: BEZEL }}>
                <iframe
                  key={`${p.src}-${key}`}
                  src={p.src}
                  title={`${p.label} view`}
                  className="block border-0"
                  style={{ width: PHONE_W - BEZEL * 2, height: PHONE_H - BEZEL * 2 }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
