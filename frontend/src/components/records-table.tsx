"use client";
import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Stars } from "@/components/rating";
import { BLOCKS, getBuyer, getUnit } from "@/lib/constants";
import { fmtDateTime } from "@/lib/dates";
import { useDemo } from "@/lib/store";

const selectCls = "h-9 rounded-lg border border-zinc-300 bg-white px-2.5 text-base outline-none focus:border-brand";

/** SDP console: every unit sign-off record (signed by the buyer or closed automatically), newest first. */
export function RecordsTable() {
  const records = useDemo((s) => s.rectificationRecords);
  const router = useRouter();
  const [q, setQ] = useState("");
  const [block, setBlock] = useState("");
  const [kind, setKind] = useState<"" | "signed" | "auto_closed">("");

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (records ?? [])
      .filter((r) => !block || getUnit(r.unitId).block === block)
      .filter((r) => !kind || r.kind === kind)
      .filter((r) => !needle || `${r.id} ${r.unitId} ${r.caseIds.join(" ")}`.toLowerCase().includes(needle));
  }, [records, q, block, kind]);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 size-4 text-zinc-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search record, unit, case" className={`${selectCls} w-56 pl-8`} />
        </div>
        <select value={block} onChange={(e) => setBlock(e.target.value)} className={selectCls} aria-label="Block">
          <option value="">All blocks</option>
          {BLOCKS.map((b) => (
            <option key={b} value={b}>
              Block {b}
            </option>
          ))}
        </select>
        <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className={selectCls} aria-label="Sign-off">
          <option value="">Signed and closed automatically</option>
          <option value="signed">Signed by the buyer</option>
          <option value="auto_closed">Closed automatically</option>
        </select>
        <span className="ml-auto text-sm text-zinc-500">
          {rows.length} of {records?.length ?? 0} records
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-base">
          <thead>
            <tr className="border-b text-left text-sm uppercase tracking-wide text-zinc-500">
              <th className="py-2 pr-3 font-medium">Record</th>
              <th className="py-2 pr-3 font-medium">Unit</th>
              <th className="py-2 pr-3 font-medium">Owner</th>
              <th className="py-2 pr-3 font-medium">Sign-off</th>
              <th className="py-2 pr-3 font-medium">Defects</th>
              <th className="py-2 font-medium">Rating</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 200).map((r) => (
              <tr key={r.id} onClick={() => router.push(`/sdp/records/${r.id}`)} className="cursor-pointer border-b border-zinc-100 hover:bg-zinc-50">
                <td className="py-2.5 pr-3 font-mono text-sm">{r.id}</td>
                <td className="py-2.5 pr-3 font-mono text-sm">{r.unitId}</td>
                <td className="py-2.5 pr-3">{(r.buyerId && getBuyer(r.buyerId)?.name) || "—"}</td>
                <td className="py-2.5 pr-3">
                  <span className={r.kind === "signed" ? "text-zinc-900" : "text-amber-700"}>{r.kind === "signed" ? "Signed" : "Closed automatically"}</span>
                  <span className="block text-sm text-zinc-500">{fmtDateTime(r.signedAt)}</span>
                </td>
                <td className="py-2.5 pr-3">
                  {r.caseIds.length}
                  <span className="block font-mono text-xs text-zinc-500">{r.caseIds.slice(0, 4).join(", ")}{r.caseIds.length > 4 ? "…" : ""}</span>
                </td>
                <td className="py-2.5">{r.rating ? <Stars value={r.rating} className="text-base" /> : <span className="text-sm text-zinc-400">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="py-8 text-center text-base text-zinc-500">No sign-off records match.</p>}
      </div>
    </>
  );
}
