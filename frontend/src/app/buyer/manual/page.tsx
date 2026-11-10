"use client";
import { Camera, Lightbulb, MapPin, Sun } from "lucide-react";
import Link from "next/link";
import { MobileHeader, Section } from "@/components/mobile";
import { StatusBadge } from "@/components/status-badge";
import { RULES } from "@/lib/constants";
import { BUYER_EXPLAIN } from "@/lib/status";
import type { CaseStatus } from "@/lib/types";

const FLOW = [
  { title: "Report the Defect", text: "Take or upload a photo and describe the problem. You can add several defects in one go; each photo becomes its own case. Our assistant categorises each one and checks nothing is missing." },
  { title: "Technician Assigned", text: "We arrange a qualified technician and a visit time for you. You will see their name and the time once they confirm." },
  { title: "Inspection Visit", text: "The technician inspects and marks the defect as confirmed or not a defect. You get an update in the app and by email." },
  { title: "Repair Arranged", text: "If confirmed, we arrange the repair automatically. You will see the technician and the time once they confirm." },
  { title: "Repair", text: "The technician fixes the defect and marks it done." },
  { title: "Verify Each Repair", text: "The developer approves every repaired defect in your unit first; the Sign Off button on your home page then turns red. Open each defect in the Pending tab, follow its short checklist and tap Fixed to verify it, or report that it is not fixed with a new photo." },
  { title: "Sign Off Your Unit", text: `Once every defect in your unit is verified, the Sign Off button in My Defects turns red. Sign off the unit once; all its defects close together. Please sign off within ${RULES.signoffPeriodDays} days of the developer's last approval. We remind you ${RULES.signoffReminderDaysBefore} days before the deadline; if you don't sign off, the defects close automatically.` },
  { title: "Defects Closed", text: "Your defects close once the developer has approved them and you have signed off the unit." },
  { title: "Came Back?", text: `Within ${RULES.gracePeriodDays} days of closing, reopen the same case with a new photo. No need to report again.` },
];

const TIPS = [
  { icon: Sun, text: "Take the photo in daylight or with the lights on." },
  { icon: Camera, text: "One close-up of the defect, plus one wider shot showing where it is." },
  { icon: MapPin, text: "Say which room and where (e.g. ceiling above the wardrobe)." },
];

const SHOWN: CaseStatus[] = ["SUBMITTED", "INFO_NEEDED", "PENDING_REVIEW", "VISIT_SCHEDULED", "VALID", "INVALID", "REPAIR_BOOKED", "PENDING_SIGNOFF", "CLOSED", "REOPENED", "ESCALATION_PENDING", "EXTRA_INSPECTION"];

export default function Manual() {
  return (
    <div>
      <MobileHeader title="User Manual" back="/buyer" />
      <div className="space-y-4 p-4">
        <Section title="How Defect Reporting Works">
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

        <Section title="Taking a Good Photo">
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

        <Section title="What Each Status Means">
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
