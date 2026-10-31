"use client";
import { ArrowLeft, BookOpen, ChevronRight, Headphones, Home, UserRound } from "lucide-react";
import Link from "next/link";
import { DEMO_BUYER, getUnit, PROJECT_NAME } from "@/lib/constants";
import { fmtDate } from "@/lib/dates";

const ITEMS = [
  { group: "My Property", items: [{ href: "/buyer/cases", label: "My Defects", icon: Home }] },
  {
    group: "Help / Support",
    items: [
      { href: "/buyer/manual", label: "User Manual", icon: BookOpen },
      { href: "/buyer#support", label: "Support Team", icon: Headphones },
    ],
  },
];

export default function Profile() {
  const unit = getUnit(DEMO_BUYER.unitId);
  return (
    <div>
      <header className="relative flex flex-col items-center rounded-b-[2rem] bg-ink px-4 pb-8 pt-6 text-white">
        <Link href="/buyer" className="absolute left-4 top-6 grid size-9 place-items-center rounded-full hover:bg-white/10" aria-label="Back">
          <ArrowLeft className="size-5" />
        </Link>
        <span className="grid size-24 place-items-center rounded-full bg-zinc-300 text-zinc-500">
          <UserRound className="size-14" />
        </span>
        <p className="mt-4 text-2xl font-semibold">{DEMO_BUYER.name}</p>
        <p className="mt-1 text-sm text-zinc-400">
          {PROJECT_NAME} · {unit.id}
        </p>
        <p className="text-xs text-zinc-500">{DEMO_BUYER.email}</p>
      </header>
      {unit.vpDate && unit.dlpExpiry && (
        <p className="mx-5 mt-4 rounded-2xl bg-zinc-50 p-3 text-sm text-zinc-700 ring-1 ring-zinc-200">
          Defect Liability Period:{" "}
          <span className="font-semibold">
            {fmtDate(`${unit.vpDate}T12:00:00+08:00`)} to {fmtDate(`${unit.dlpExpiry}T12:00:00+08:00`)}
          </span>
        </p>
      )}
      <div className="px-5 py-4">
        {ITEMS.map((g) => (
          <section key={g.group} className="mb-4">
            <h2 className="border-b border-zinc-200 pb-3 pt-2 text-sm text-zinc-500">{g.group}</h2>
            <ul>
              {g.items.map((i) => (
                <li key={i.label}>
                  <Link href={i.href} className="flex items-center gap-4 py-3.5 text-[15px]">
                    <i.icon className="size-5 text-zinc-400" />
                    <span className="flex-1">{i.label}</span>
                    <ChevronRight className="size-4 text-zinc-300" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
