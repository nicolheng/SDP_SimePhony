"use client";
import { Check, CheckCircle2, Lightbulb, Search, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { EmptyState, MobileHeader, Section } from "@/components/mobile";
import { TECH_GENERAL, TECH_GUIDE } from "@/lib/tech-inspection-guide";
import { cn } from "@/lib/utils";

export default function TechInspectionSheet() {
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [ticked, setTicked] = useState<Set<string>>(new Set());

  const sections = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return TECH_GUIDE.filter((g) => filter === "all" || g.id === filter).filter(
      (g) => !needle || [g.title, ...g.checks, ...g.valid, ...g.invalid].some((t) => t.toLowerCase().includes(needle)),
    );
  }, [filter, q]);

  const toggle = (key: string) => {
    const next = new Set(ticked);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setTicked(next);
  };

  return (
    <div>
      <MobileHeader title="Inspection Sheet" back="/technician" />
      <div className="space-y-4 p-4">
        <div>
          <h2 className="font-semibold">On-Site Inspection Guide</h2>
          <p className="text-sm text-zinc-600">What to check for each defect type, and how to decide whether it is a valid defect.</p>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-3 size-4 text-zinc-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search checks"
            className="h-10 w-full rounded-xl border border-zinc-300 pl-9 pr-3 text-sm outline-none focus:border-brand"
          />
        </div>

        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
          {[{ id: "all", title: "All" }, ...TECH_GUIDE].map((g) => (
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
          <Section title="Before Every Visit">
            <ul className="space-y-2">
              {TECH_GENERAL.map((t) => (
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
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">On-site checks</p>
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
            <div className="mt-4 grid gap-2">
              <div className="rounded-xl bg-emerald-50 p-3 ring-1 ring-emerald-200">
                <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-emerald-800">
                  <CheckCircle2 className="size-3.5" /> Mark Valid when
                </p>
                <ul className="list-disc space-y-0.5 pl-5 text-sm text-emerald-900">
                  {g.valid.map((v) => (
                    <li key={v}>{v}</li>
                  ))}
                </ul>
              </div>
              <div className="rounded-xl bg-zinc-50 p-3 ring-1 ring-zinc-200">
                <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-zinc-700">
                  <XCircle className="size-3.5" /> Mark Invalid when
                </p>
                <ul className="list-disc space-y-0.5 pl-5 text-sm text-zinc-700">
                  {g.invalid.map((v) => (
                    <li key={v}>{v}</li>
                  ))}
                </ul>
              </div>
            </div>
          </Section>
        ))}
      </div>
    </div>
  );
}
