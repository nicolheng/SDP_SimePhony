"use client";
import { Check, ChevronDown, Lightbulb, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { EmptyState, MobileHeader, primaryButtonClass, Section } from "@/components/mobile";
import { GENERAL_TIPS, INSPECTION_GUIDE } from "@/lib/inspection-guide";
import { cn } from "@/lib/utils";

export default function InspectionSheet() {
  const [filter, setFilter] = useState<string>("all");
  const [q, setQ] = useState("");
  const [ticked, setTicked] = useState<Set<string>>(new Set());

  const sections = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return INSPECTION_GUIDE.filter((g) => filter === "all" || g.id === filter)
      .map((g) =>
        needle
          ? { ...g, checks: g.checks.filter((c) => c.toLowerCase().includes(needle)), faqs: g.faqs.filter((f) => `${f.q} ${f.a}`.toLowerCase().includes(needle)) }
          : g,
      )
      .filter((g) => !needle || g.checks.length || g.faqs.length || g.title.toLowerCase().includes(needle));
  }, [filter, q]);

  const toggle = (key: string) => {
    const next = new Set(ticked);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setTicked(next);
  };

  return (
    <div>
      <MobileHeader title="Inspection Sheet" back="/buyer" />
      <div className="space-y-4 p-4">
        <div>
          <h2 className="font-semibold">Check your home</h2>
          <p className="text-sm text-zinc-600">Go room by room with this list. If something looks wrong, report it; our technician confirms whether it&apos;s a defect at the inspection visit.</p>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-3 size-4 text-zinc-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search checks and questions"
            className="h-10 w-full rounded-xl border border-zinc-300 pl-9 pr-3 text-sm outline-none focus:border-brand"
          />
        </div>

        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
          {[{ id: "all", title: "All" }, ...INSPECTION_GUIDE].map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => setFilter(g.id)}
              className={cn("shrink-0 rounded-full px-3 py-1.5 text-xs font-medium", filter === g.id ? "bg-brand text-white" : "bg-zinc-100 text-zinc-700")}
            >
              {g.title}
            </button>
          ))}
        </div>

        {filter === "all" && !q && (
          <Section title="Before you start">
            <ul className="space-y-2">
              {GENERAL_TIPS.map((t) => (
                <li key={t} className="flex gap-2 text-sm text-zinc-700">
                  <Lightbulb className="mt-0.5 size-4 shrink-0 text-amber-500" /> {t}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {sections.length === 0 && <EmptyState icon={<Search className="size-14" strokeWidth={1.5} />} text="Nothing matches your search." />}

        {sections.map((g) => (
          <Section key={g.id} title={g.title}>
            {g.checks.length > 0 && (
              <>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">What to check</p>
                <ul className="space-y-1.5">
                  {g.checks.map((c) => {
                    const key = `${g.id}:${c}`;
                    const on = ticked.has(key);
                    return (
                      <li key={key}>
                        <button
                          type="button"
                          onClick={() => toggle(key)}
                          className={cn("flex w-full gap-2.5 rounded-xl p-2.5 text-left text-sm ring-1", on ? "bg-emerald-50 ring-emerald-200" : "bg-white ring-zinc-200")}
                        >
                          <span className={cn("grid size-5 shrink-0 place-items-center rounded-md border-2", on ? "border-emerald-500 bg-emerald-500 text-white" : "border-zinc-300")}>
                            {on && <Check className="size-3" strokeWidth={3} />}
                          </span>
                          {c}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
            {g.faqs.length > 0 && (
              <>
                <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-zinc-500">FAQ</p>
                <div className="divide-y divide-zinc-100 rounded-xl ring-1 ring-zinc-200">
                  {g.faqs.map((f) => (
                    <details key={f.q} className="group p-3">
                      <summary className="flex cursor-pointer list-none items-start justify-between gap-2 text-sm font-medium">
                        {f.q}
                        <ChevronDown className="mt-0.5 size-4 shrink-0 text-zinc-400 transition group-open:rotate-180" />
                      </summary>
                      <p className="mt-2 text-sm text-zinc-600">{f.a}</p>
                    </details>
                  ))}
                </div>
              </>
            )}
          </Section>
        ))}

        <Link href="/buyer/report" className={primaryButtonClass}>
          Found something? Report a defect
        </Link>
      </div>
    </div>
  );
}
