"use client";
import { Camera, Lightbulb, MessageSquareText, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { MobileHeader, Section } from "@/components/mobile";
import { StatusBadge } from "@/components/status-badge";
import { TECH_EXPLAIN } from "@/lib/status";
import type { CaseStatus } from "@/lib/types";

const FLOW = [
  { title: "New Job Assigned", text: "You receive a job matched to your skills and blocks. Open it and Accept, or hand it over if you cannot attend; the next available colleague is assigned." },
  { title: "Prepare", text: "Review the buyer's photos and description, the AI inspection brief and any previous reports for the unit." },
  { title: "Inspection Visit", text: "Inspect on site, add a photo and describe what you found. Mark the defect Valid or Invalid." },
  { title: "Repair Booked", text: "If Valid, the buyer books a repair slot. The repair job appears in your To Do list." },
  { title: "Repair", text: "Carry out the repair, add an evidence photo, describe what was repaired and mark it repaired." },
  { title: "Sign-Off", text: "The developer approves the repair, then the buyer checks it and signs off. The case then closes." },
  { title: "Reopened or Extra Inspection", text: "If the problem returns, the case comes back as a revisit. Serious or repeated defects may need a joint extra inspection with a subcontractor." },
];

const TIPS = [
  { icon: Camera, text: "Photograph the defect close up and from a distance, in good light." },
  { icon: MessageSquareText, text: "Your notes are shown to the buyer: keep them clear and factual." },
  { icon: ShieldAlert, text: "Report any safety hazard (live wiring, falling glass, structural movement) immediately." },
];

const SHOWN: CaseStatus[] = ["VISIT_SCHEDULED", "EXTRA_INSPECTION", "VALID", "INVALID", "REPAIR_BOOKED", "REPAIRED", "PENDING_SIGNOFF", "REOPENED", "CLOSED"];

export default function TechManual() {
  return (
    <div>
      <MobileHeader title="User Manual" back="/technician" />
      <div className="space-y-4 p-4">
        <Section title="How a Job Works">
          <ol className="relative space-y-4 border-l-2 border-red-100 pl-5">
            {FLOW.map((f, i) => (
              <li key={f.title} className="relative">
                <span className="absolute -left-[31px] grid size-6 place-items-center rounded-full bg-brand text-xs font-semibold text-white">{i + 1}</span>
                <p className="text-sm font-semibold">{f.title}</p>
                <p className="text-sm text-zinc-600">{f.text}</p>
              </li>
            ))}
          </ol>
        </Section>

        <Link href="/technician/inspection-sheet" className="block rounded-2xl bg-red-50 p-4 text-sm ring-1 ring-red-100">
          <span className="font-semibold text-brand">Inspection sheet</span>
          <span className="block text-zinc-700">On-site checks for each defect type, and when to mark Valid or Invalid.</span>
        </Link>

        <Section title="Good Practice">
          <ul className="space-y-2.5">
            {TIPS.map((t) => (
              <li key={t.text} className="flex gap-2.5 text-sm text-zinc-700">
                <t.icon className="mt-0.5 size-4 shrink-0 text-brand" /> {t.text}
              </li>
            ))}
          </ul>
          <p className="mt-3 flex gap-2 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-900">
            <Lightbulb className="size-3.5 shrink-0" /> Buyers may write in English, Bahasa Malaysia or a mix of both.
          </p>
        </Section>

        <Section title="What Each Status Means">
          <ul className="space-y-3">
            {SHOWN.map((s) => (
              <li key={s}>
                <StatusBadge status={s} />
                <p className="mt-1 text-xs text-zinc-600">{TECH_EXPLAIN[s]}</p>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </div>
  );
}
