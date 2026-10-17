"use client";
import { Camera, ChevronRight, Lightbulb, MapPin, Sun } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { BrandMark } from "@/components/brand";
import { primaryButtonClass, Section } from "@/components/mobile";
import { StatusBadge } from "@/components/status-badge";
import { DEMO_BUYER, getUnit, PROJECT_NAME } from "@/lib/constants";
import { relative } from "@/lib/dates";
import { isOpen } from "@/lib/status";
import { useDemo } from "@/lib/store";

const TIPS = [
  { icon: Sun, text: "Take the photo in daylight or with the lights on." },
  { icon: Camera, text: "One close-up of the defect, plus one wider shot showing where it is." },
  { icon: MapPin, text: "Say which room and where (e.g. ceiling above the wardrobe)." },
];

export default function BuyerHome() {
  const cases = useDemo((s) => s.cases);
  const now = useDemo((s) => s.now);
  const mine = useMemo(() => cases.filter((c) => c.buyerId === DEMO_BUYER.id && !c.historical).reverse(), [cases]);
  const open = mine.filter((c) => isOpen(c.status));
  const unit = getUnit(DEMO_BUYER.unitId);

  return (
    <div className="pb-6">
      <div className="bg-gradient-to-br from-brand to-brand-dark px-4 pb-16 pt-5 text-white">
        <div className="flex items-center justify-between">
          <BrandMark size="sm" className="bg-white text-brand" />
          <span className="text-xs text-white/80">Hi, {DEMO_BUYER.name.split(" ")[0]}</span>
        </div>
        <h1 className="mt-5 text-xl font-semibold">My Home</h1>
      </div>

      <div className="-mt-12 space-y-4 px-4">
        <Section className="flex items-center gap-3">
          <div className="grid size-16 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-emerald-200 to-sky-200 text-[10px] font-semibold text-emerald-900">
            Block {unit.block}
          </div>
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-semibold uppercase tracking-wide">{PROJECT_NAME}</p>
            <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 text-xs text-zinc-600">
              <dt className="text-zinc-400">Unit</dt>
              <dd className="font-medium text-zinc-800">{unit.id}</dd>
              <dt className="text-zinc-400">Floor</dt>
              <dd>Level {unit.floor}, stack {unit.stack}</dd>
            </dl>
          </div>
        </Section>

        {open.length > 0 && (
          <Section title="Ongoing defects">
            <ul className="divide-y">
              {open.map((c) => (
                <li key={c.id}>
                  <Link href={`/buyer/cases/${c.id}`} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{c.summary}</p>
                      <p className="text-xs text-zinc-500">
                        {c.id} · {relative(c.createdAt, now)}
                      </p>
                    </div>
                    <StatusBadge status={c.status} buyer />
                    <ChevronRight className="size-4 text-zinc-400" />
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
        )}

        <Section title="Guides">
          <div className="mb-3 grid h-28 place-items-center rounded-xl bg-gradient-to-br from-zinc-100 to-zinc-200">
            <Camera className="size-8 text-zinc-400" />
          </div>
          <p className="text-sm font-semibold">Guide on how to snap the defects</p>
          <ul className="mt-2 space-y-2">
            {TIPS.map((t) => (
              <li key={t.text} className="flex gap-2 text-xs text-zinc-600">
                <t.icon className="mt-0.5 size-3.5 shrink-0 text-brand" /> {t.text}
              </li>
            ))}
          </ul>
          <p className="mt-3 flex gap-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">
            <Lightbulb className="size-3.5 shrink-0" /> You can write in English, Bahasa Malaysia or a mix of both.
          </p>
        </Section>

        <Link href="/buyer/report" className={primaryButtonClass}>
          Submit Defects
        </Link>
        <Link href="/buyer/cases" className="block text-center text-sm font-semibold text-brand">
          View Reported Defects List
        </Link>
      </div>
    </div>
  );
}
