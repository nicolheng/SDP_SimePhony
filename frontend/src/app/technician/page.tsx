"use client";
import { Bell, Bot, ClipboardList, Inbox, ScrollText, UserRound, Wrench } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { BrandMark } from "@/components/brand";
import { EmptyState, QuickAction, SectionHead, SummaryStrip } from "@/components/mobile";
import { dayKey, fmtDay } from "@/lib/dates";
import { TECH_TODO } from "@/lib/status";
import { useDemo } from "@/lib/store";
import { JobCard } from "./job-card";
import { jobSlot, useMyJobs } from "./use-my-jobs";

export default function TechnicianHome() {
  const { tech, jobs } = useMyJobs();
  const now = useDemo((s) => s.now);
  const outbox = useDemo((s) => s.outbox);
  const live = useMemo(() => jobs.filter((c) => !c.historical), [jobs]);
  const todo = useMemo(() => live.filter((c) => TECH_TODO.includes(c.status)).sort((a, b) => jobSlot(a).localeCompare(jobSlot(b))), [live]);
  const today = todo.filter((c) => dayKey(jobSlot(c)) === dayKey(now));
  const waiting = live.filter((c) => c.status === "PENDING_SIGNOFF" || c.status === "VALID").length;
  const completed = live.filter((c) => c.status === "CLOSED" || c.status === "INVALID").length;
  const inbox = useMemo(() => outbox.filter((e) => e.to === tech.email).length, [outbox, tech.email]);
  const insights = live.filter((c) => c.inspectionBrief).slice(0, 4);
  const upcoming = today.length ? today : todo.slice(0, 3);

  return (
    <div className="pb-8">
      <header className="sticky top-0 z-10 flex h-[84px] items-center rounded-b-[1.75rem] bg-ink px-4 text-white">
        <BrandMark size="sm" className="size-11" />
        <div className="ml-auto flex items-center gap-4">
          <Link href="/technician/inbox" className="relative" aria-label="Inbox">
            <Bell className="size-6" />
            {inbox > 0 && <span className="absolute -right-1.5 -top-1.5 grid min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] font-semibold">{inbox}</span>}
          </Link>
          <Link href="/technician/profile" className="grid size-10 place-items-center rounded-full bg-zinc-300 text-zinc-500" aria-label="Profile">
            <UserRound className="size-6" />
          </Link>
        </div>
      </header>

      <div className="space-y-7 px-4 pt-5">
        <div className="rounded-2xl p-4 ring-1 ring-zinc-200">
          <p className="text-sm text-zinc-500">{fmtDay(now)}</p>
          <p className="text-lg font-semibold">Hi, {tech.name.split(" ")[0]}</p>
          <p className="text-sm text-zinc-500">{tech.company ?? "In-house technician"}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {tech.skills.map((s) => (
              <span key={s} className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium capitalize text-brand">
                {s}
              </span>
            ))}
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">Blocks {tech.blocks.join(", ")}</span>
          </div>
        </div>

        <section>
          <SectionHead title="Quick Access" />
          <div className="grid grid-cols-4 gap-2">
            <QuickAction href="/technician/jobs" icon={<ClipboardList className="size-6" />} label="My Jobs" badge={todo.length} />
            <QuickAction href="/technician/inbox" icon={<Inbox className="size-6" />} label="Inbox" />
            <QuickAction href="/technician#ai" icon={<Bot className="size-6" />} label="AI Briefs" />
            <QuickAction href="/technician/profile" icon={<UserRound className="size-6" />} label="Profile" />
          </div>
        </section>

        <section>
          <SectionHead title={today.length ? "Today's Jobs" : "Next Jobs"} href="/technician/jobs" />
          <SummaryStrip
            items={[
              { label: "To do", value: todo.length },
              { label: "Today", value: today.length },
              { label: "Awaiting buyer", value: waiting },
              { label: "Completed", value: completed },
            ]}
          />
          <ul className="mt-3 space-y-3">
            {upcoming.map((c) => (
              <li key={c.id}>
                <JobCard c={c} />
              </li>
            ))}
          </ul>
          {upcoming.length === 0 && <EmptyState icon={<Wrench className="size-14" strokeWidth={1.5} />} text="No jobs assigned to you right now." />}
        </section>

        <section id="ai">
          <SectionHead title="AI Briefs For You" />
          {insights.length === 0 ? (
            <p className="rounded-2xl bg-zinc-50 p-4 text-sm text-zinc-500">No inspection briefs for your jobs.</p>
          ) : (
            <ul className="space-y-2">
              {insights.map((c) => (
                <li key={c.id}>
                  <Link href={`/technician/jobs/${c.id}`} className="flex gap-3 rounded-2xl bg-violet-50/60 p-3 ring-1 ring-violet-100">
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-violet-100 text-violet-700">
                      <ScrollText className="size-4" />
                    </span>
                    <div className="min-w-0 text-sm">
                      <p className="font-medium">
                        {c.unitId} · {c.summary}
                      </p>
                      <p className="text-xs text-violet-900/80">
                        InitialInspectionAgent: inspection brief and checklist ready.
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
