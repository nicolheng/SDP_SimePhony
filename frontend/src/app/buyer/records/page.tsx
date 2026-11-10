"use client";
import { ChevronRight, FileText } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { Stars } from "@/components/rating";
import { EmptyState, MobileHeader } from "@/components/mobile";
import { DEMO_BUYER, PROJECT_NAME } from "@/lib/constants";
import { fmtDateTime } from "@/lib/dates";
import { buyerUnits } from "@/lib/constants";
import { useDemo } from "@/lib/store";

/** Buyer: one defect rectification record per unit sign-off (signed by the buyer, or closed automatically). */
export default function Records() {
  const all = useDemo((s) => s.rectificationRecords);
  const records = useMemo(() => {
    const units = new Set(buyerUnits(DEMO_BUYER));
    return (all ?? []).filter((r) => r.buyerId === DEMO_BUYER.id || units.has(r.unitId));
  }, [all]);

  return (
    <div>
      <MobileHeader title="Rectification Records" back="/buyer" />
      <div className="space-y-4 p-4">
        <div>
          <h2 className="font-semibold">Sign-off Records</h2>
          <p className="text-sm text-zinc-600">A record of every defect closed each time your unit was signed off.</p>
        </div>
        {records.length === 0 ? (
          <EmptyState icon={<FileText className="size-16" strokeWidth={1.5} />} text="Your rectification record appears here after you sign off your unit." />
        ) : (
          <ul className="space-y-3">
            {records.map((r) => (
              <li key={r.id}>
                <Link href={`/buyer/records/${r.id}`} className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-zinc-200">
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-red-50 text-brand">
                    <FileText className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">
                      {PROJECT_NAME} · Unit {r.unitId}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {r.kind === "signed" ? "Signed off" : "Closed automatically"} {fmtDateTime(r.signedAt)}
                    </p>
                    <div className="mt-1 flex items-center gap-2 text-xs text-zinc-600">
                      <span>
                        {r.caseIds.length} defect{r.caseIds.length > 1 ? "s" : ""}
                      </span>
                      {r.rating ? <Stars value={r.rating} className="text-sm" /> : null}
                    </div>
                  </div>
                  <ChevronRight className="size-4 text-zinc-400" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
