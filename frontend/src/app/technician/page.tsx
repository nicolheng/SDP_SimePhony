"use client";
import { Bell, BookOpen, ChevronRight, ClipboardCheck, ClipboardList } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { BrandMark, TechAvatar } from "@/components/brand";
import { QuickAction, SectionHead, SummaryStrip } from "@/components/mobile";
import { StatusBadge } from "@/components/status-badge";
import { dayKey, fmtDateTime, fmtDay, fmtTime } from "@/lib/dates";
import { isOpen, TECH_TODO } from "@/lib/status";
import { useDemo } from "@/lib/store";
import { jobSlot, useMyJobs } from "./use-my-jobs";

export default function TechnicianHome() {
  const { tech, jobs } = useMyJobs();
  const now = useDemo((s) => s.now);
  const outbox = useDemo((s) => s.outbox);
  const todo = useMemo(() => jobs.filter((c) => TECH_TODO.includes(c.status)).sort((a, b) => jobSlot(a).localeCompare(jobSlot(b))), [jobs]);
  const today = todo.filter((c) => dayKey(jobSlot(c)) === dayKey(now));
  const closed = jobs.filter((c) => !isOpen(c.status)).length;
  const inbox = useMemo(() => outbox.filter((e) => e.to === tech.email).length, [outbox, tech.email]);

  return (
    <div className="pb-8">
      <header className="sticky top-0 z-10 flex h-[84px] items-center rounded-b-[1.75rem] bg-ink px-4 text-white">
        <BrandMark size="sm" className="size-11" />
        <div className="ml-auto flex items-center gap-4">
          <Link href="/technician/inbox" className="relative" aria-label="Inbox">
            <Bell className="size-6" />
            {inbox > 0 && <span className="absolute -right-1.5 -top-1.5 grid min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] font-semibold">{inbox}</span>}
          </Link>
          <Link href="/technician/profile" className="rounded-full ring-2 ring-white/80" aria-label="Profile">
            <TechAvatar tech={tech} className="size-10" iconClassName="size-6" />
          </Link>
        </div>
      </header>

      <div className="space-y-7 px-4 pt-5">
        <div className="rounded-2xl p-4 ring-1 ring-zinc-200">
          <p className="text-sm text-zinc-500">{fmtDay(now)}</p>
          <p className="text-lg font-semibold">Hi, {tech.name.split(" ")[0]}</p>
          <p className="text-sm text-zinc-500">{tech.company ?? "In-house technician"}</p>
        </div>

        <section>
          <SectionHead title="Quick Access" />
          <div className="grid grid-cols-4 gap-2">
            <QuickAction href="/technician/jobs" icon={<ClipboardList className="size-6" />} label="My Jobs" badge={todo.length} />
            <QuickAction href="/technician/inspection-sheet" icon={<ClipboardCheck className="size-6" />} label="Inspection Sheet" />
            <QuickAction href="/technician/manual" icon={<BookOpen className="size-6" />} label="User Manual" />
          </div>
        </section>

        <section>
          <SectionHead title="My Jobs" href="/technician/jobs" />
          <SummaryStrip
            items={[
              { label: "Total Jobs", value: jobs.length },
              { label: "To Do", value: todo.length },
              { label: "Closed", value: closed },
            ]}
          />
          {today.length > 0 && (
            <Link href={`/technician/jobs/${today[0].id}`} className="mt-3 flex items-center gap-3 rounded-2xl bg-amber-50 p-3 ring-1 ring-amber-200">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-amber-100 text-amber-700">!</span>
              <span className="flex-1 text-sm">
                <span className="font-semibold">Today:</span> {today.length} job{today.length > 1 ? "s" : ""}, next at {fmtTime(jobSlot(today[0]))}
              </span>
              <ChevronRight className="size-4 text-amber-700" />
            </Link>
          )}
          <ul className="mt-3 divide-y divide-zinc-100">
            {todo.slice(0, 3).map((c) => (
              <li key={c.id}>
                <Link href={`/technician/jobs/${c.id}`} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{c.summary}</p>
                    <p className="text-xs text-zinc-500">
                      {c.id} · {c.unitId} · {fmtDateTime(jobSlot(c))}
                    </p>
                  </div>
                  <StatusBadge status={c.status} />
                  <ChevronRight className="size-4 text-zinc-400" />
                </Link>
              </li>
            ))}
          </ul>
          {todo.length === 0 && (
            <div className="mt-3 rounded-2xl border border-dashed border-zinc-300 p-4 text-center text-sm text-zinc-500">
              No upcoming jobs.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
