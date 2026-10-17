"use client";
import { ChevronRight, Inbox } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { MobileHeader, primaryButtonClass } from "@/components/mobile";
import { PhotoThumb } from "@/components/photo";
import { StatusBadge } from "@/components/status-badge";
import { DEMO_BUYER } from "@/lib/constants";
import { fmtDate } from "@/lib/dates";
import { useDemo } from "@/lib/store";

export default function MyCases() {
  const cases = useDemo((s) => s.cases);
  const mine = useMemo(() => cases.filter((c) => c.buyerId === DEMO_BUYER.id).reverse(), [cases]);
  const current = mine.filter((c) => !c.historical);
  const past = mine.filter((c) => c.historical);

  return (
    <div>
      <MobileHeader title="Reported Defects" back="/buyer" />
      <div className="space-y-5 p-4">
        {current.length === 0 && (
          <div className="rounded-2xl bg-white p-6 text-center ring-1 ring-zinc-200">
            <Inbox className="mx-auto size-8 text-zinc-300" />
            <p className="mt-2 text-sm text-zinc-600">No defects reported yet.</p>
            <Link href="/buyer/report" className={`${primaryButtonClass} mt-4`}>
              Submit Defects
            </Link>
          </div>
        )}
        {current.length > 0 && (
          <ul className="space-y-2">
            {current.map((c) => (
              <li key={c.id}>
                <Link href={`/buyer/cases/${c.id}`} className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-zinc-200/70">
                  <PhotoThumb photo={c.photos[0]} className="size-16 shrink-0" label={false} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{c.summary}</p>
                    <p className="text-xs text-zinc-500">
                      {c.id} · {fmtDate(c.createdAt)}
                    </p>
                    <StatusBadge status={c.status} buyer className="mt-1" />
                  </div>
                  <ChevronRight className="size-4 text-zinc-400" />
                </Link>
              </li>
            ))}
          </ul>
        )}
        {past.length > 0 && (
          <div>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Past reports for your unit</h2>
            <ul className="divide-y rounded-2xl bg-white ring-1 ring-zinc-200/70">
              {past.map((c) => (
                <li key={c.id} className="flex items-center justify-between px-3 py-2.5 text-sm">
                  <span>
                    {c.summary}
                    <span className="block text-xs text-zinc-500">
                      {c.id} · {fmtDate(c.createdAt)}
                    </span>
                  </span>
                  <StatusBadge status={c.status} buyer />
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
