"use client";
import { Camera, Lightbulb, MapPin, Sun } from "lucide-react";
import Link from "next/link";
import { MobileHeader, Section } from "@/components/mobile";
import { StatusBadge } from "@/components/status-badge";
import { RULES } from "@/lib/constants";
import { BUYER_EXPLAIN } from "@/lib/status";
import type { CaseStatus } from "@/lib/types";

const FLOW = [
  { title: "Report the defect", text: "Upload a photo, describe the problem and pick an inspection slot. Our assistant categorises it and checks nothing is missing." },
  { title: "Technician assigned", text: "We assign a technician with the right skills who is free at your chosen time." },
  { title: "Inspection visit", text: "The technician inspects and marks the defect as confirmed or not a defect. You get an update in the app and by email." },
  { title: "Book the repair", text: "If confirmed, choose a repair slot in the app." },
  { title: "Repair", text: "The technician fixes the defect and marks it done." },
  { title: "Check & sign off", text: `Follow the short checklist for your defect and sign off within ${RULES.signoffPeriodDays} days. The developer also signs off. We remind you ${RULES.signoffReminderDaysBefore} days before the deadline; if you don't sign off, the case closes automatically.` },
  { title: "Case closed", text: "The case closes once both you and the developer have signed off." },
  { title: "Came back?", text: `Within ${RULES.gracePeriodDays} days of closing, reopen the same case with a new photo. No need to report again.` },
];

const TIPS = [
  { icon: Sun, text: "Take the photo in daylight or with the lights on." },
  { icon: Camera, text: "One close-up of the defect, plus one wider shot showing where it is." },
  { icon: MapPin, text: "Say which room and where (e.g. ceiling above the wardrobe)." },
];

const SHOWN: CaseStatus[] = ["SUBMITTED", "INFO_NEEDED", "VISIT_SCHEDULED", "VALID", "INVALID", "REPAIR_BOOKED", "PENDING_SIGNOFF", "CLOSED", "REOPENED", "ESCALATION_PENDING", "EXTRA_INSPECTION"];

export default function Manual() {
  return (
    <div>
      <MobileHeader title="User Manual" back="/buyer" />
      <div className="space-y-4 p-4">
        <Section title="How defect reporting works">
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

        <Link href="/buyer/inspection-sheet" className="block rounded-2xl bg-red-50 p-4 text-sm ring-1 ring-red-100">
          <span className="font-semibold text-brand">Inspection sheet</span>
          <span className="block text-zinc-700">What to check in each room, by defect type, with FAQs.</span>
        </Link>

        <Section title="Taking a good photo">
          <ul className="space-y-2.5">
            {TIPS.map((t) => (
              <li key={t.text} className="flex gap-2.5 text-sm text-zinc-700">
                <t.icon className="mt-0.5 size-4 shrink-0 text-brand" /> {t.text}
              </li>
            ))}
          </ul>
          <p className="mt-3 flex gap-2 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-900">
            <Lightbulb className="size-3.5 shrink-0" /> You can write in English, Bahasa Malaysia or a mix of both.
          </p>
        </Section>

        <Section title="What each status means">
          <ul className="space-y-3">
            {SHOWN.map((s) => (
              <li key={s}>
                <StatusBadge status={s} buyer />
                <p className="mt-1 text-xs text-zinc-600">{BUYER_EXPLAIN[s]}</p>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </div>
  );
}
