"use client";
import { Bot, Check, ShieldCheck, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PhotoThumb } from "@/components/photo";
import { ReviewPanel } from "@/components/review-panel";
import { PageTitle, Panel } from "@/components/sdp-ui";
import { StatusBadge } from "@/components/status-badge";
import { decideApproval } from "@/lib/api";
import { FLOORS, getUnit } from "@/lib/constants";
import { fmtDateTime } from "@/lib/dates";
import { useDemo, useOffline } from "@/lib/store";
import type { Approval, Case, SystemicIssue } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function Approvals() {
  const approvals = useDemo((s) => s.approvals);
  const cases = useDemo((s) => s.cases);
  const issues = useDemo((s) => s.systemicIssues);
  const pending = useMemo(() => approvals.filter((a) => a.status === "pending").reverse(), [approvals]);
  const decided = useMemo(() => approvals.filter((a) => a.status !== "pending").reverse(), [approvals]);
  const held = useMemo(() => cases.filter((c) => c.status === "PENDING_REVIEW"), [cases]);

  return (
    <div className="mx-auto max-w-5xl">
      <PageTitle title="Approvals" sub="Cases the AI agents want a person to decide: held for review when unsure, and extra inspection requests." />
      {held.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-3 text-xl font-semibold">Held for review · {held.length}</h2>
          <p className="mb-4 text-base text-zinc-600">An AI agent was not confident enough to continue, so it paused these cases. Approve to let the case carry on, or reject it.</p>
          <div className="space-y-6">
            {held.map((c) => (
              <ReviewPanel key={c.id} c={c} showCase />
            ))}
          </div>
        </div>
      )}
      {pending.length > 0 && held.length > 0 && <h2 className="mb-3 text-xl font-semibold">Extra inspection requests · {pending.length}</h2>}
      {pending.length === 0 && held.length === 0 && (
        <Panel>
          <div className="py-8 text-center">
            <ShieldCheck className="mx-auto size-8 text-zinc-300" />
            <p className="mt-2 text-base text-zinc-500">No requests waiting. They appear here when a case recurs a 3rd time or a stack cluster is detected.</p>
          </div>
        </Panel>
      )}
      <div className="space-y-6">
        {pending.map((a) => {
          const c = cases.find((x) => x.id === a.caseId);
          return c ? <ApprovalCard key={a.id} a={a} c={c} si={issues.find((s) => s.id === a.systemicIssueId)} cases={cases} /> : null;
        })}
      </div>
      {decided.length > 0 && (
        <Panel title="Decided" className="mt-8">
          <ul className="divide-y text-base">
            {decided.map((a) => (
              <li key={a.id} className="flex items-center gap-3 py-2">
                <span className={cn("rounded-full px-2 py-0.5 text-sm font-medium", a.status === "approved" ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-600")}>
                  {a.status}
                </span>
                <Link href={`/sdp/defects/${a.caseId}`} className="font-mono text-sm hover:underline">
                  {a.caseId}
                </Link>
                <span className="text-zinc-600">{a.systemicIssueId}</span>
                <span className="ml-auto text-sm text-zinc-500">{a.decidedAt && fmtDateTime(a.decidedAt)}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}

function ApprovalCard({ a, c, si, cases }: { a: Approval; c: Case; si?: SystemicIssue; cases: Case[] }) {
  const [busy, setBusy] = useState(false);
  const offline = useOffline();
  const unit = getUnit(c.unitId);
  const stackUnits = useMemo(() => {
    const ids = new Set(
      cases
        .filter((x) => {
          const u = getUnit(x.unitId);
          return x.category === c.category && u.block === unit.block && u.stack === unit.stack && x.status !== "INVALID";
        })
        .map((x) => x.unitId),
    );
    return Array.from({ length: FLOORS }, (_, i) => FLOORS - i).map((floor) => ({ floor, id: `${unit.block}-${floor}-${unit.stack}` })).map((u) => ({ ...u, hit: ids.has(u.id) }));
  }, [cases, c.category, unit.block, unit.stack]);
  const original = c.photos.find((p) => p.kind === "original");
  const reopen = [...c.photos].reverse().find((p) => p.kind === "reopen");

  async function decide(approve: boolean) {
    setBusy(true);
    try {
      await decideApproval(a.id, approve);
      toast.success(approve ? "Approved — inspection brief is ready" : "Rejected — normal repair booking");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setBusy(false);
    }
  }

  return (
    <Panel id={a.id} className="scroll-mt-6 ring-2 ring-violet-200">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-violet-700">
            {a.id} · {si?.id} · raised {fmtDateTime(a.createdAt)}
          </p>
          <h2 className="mt-1 text-lg font-semibold">Extra inspection for {c.unitId}?</h2>
          <p className="text-base text-zinc-600">
            <Link href={`/sdp/defects/${c.id}`} className="font-mono hover:underline">
              {c.id}
            </Link>{" "}
            · {c.summary}
          </p>
        </div>
        <StatusBadge status={c.status} />
      </div>

      <div className="mt-5 grid gap-6 md:grid-cols-[1fr_auto]">
        <div className="space-y-4">
          <div className="rounded-xl bg-violet-50 p-4">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-violet-800">
              <Bot className="size-3.5" /> Why the agent is asking
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-base text-violet-950">
              {a.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
            {si && <p className="mt-3 text-base text-violet-950"><span className="font-medium">Recommended:</span> {si.recommendedAction}</p>}
            {si && <p className="mt-1 text-sm text-violet-700">Confidence {(si.confidence * 100).toFixed(0)}%</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {original && <PhotoThumb photo={original} className="aspect-[4/3]" />}
            {reopen && <PhotoThumb photo={reopen} className="aspect-[4/3]" />}
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-sm font-medium text-zinc-500">
            Stack {unit.block}-{unit.stack}
          </p>
          <ol className="space-y-0.5">
            {stackUnits.map((u) => (
              <li key={u.id} className="flex items-center gap-2 text-sm">
                <span className="w-7 text-right text-zinc-400">L{u.floor}</span>
                <span className={cn("h-3.5 w-14 rounded-sm", u.id === c.unitId ? "bg-red-600 cell-pulse" : u.hit ? "bg-orange-400" : "bg-zinc-100")} />
                {u.hit && <span className="font-mono text-zinc-600">{u.id}</span>}
              </li>
            ))}
          </ol>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={busy || offline}
          onClick={() => decide(true)}
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-emerald-600 px-5 text-base font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          <Check className="size-4" /> Approve extra inspection
        </button>
        <button
          type="button"
          disabled={busy || offline}
          onClick={() => decide(false)}
          className="inline-flex h-11 items-center gap-2 rounded-xl border border-zinc-300 bg-white px-5 text-base font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
        >
          <X className="size-4" /> Reject (normal repair)
        </button>
      </div>
    </Panel>
  );
}
