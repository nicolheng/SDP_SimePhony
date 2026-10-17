"use client";
import { Mail, MessageSquare } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { MobileHeader } from "@/components/mobile";
import { DEMO_BUYER } from "@/lib/constants";
import { fmtDateTime } from "@/lib/dates";
import { useDemo } from "@/lib/store";
import { cn } from "@/lib/utils";

export default function Inbox() {
  const cases = useDemo((s) => s.cases);
  const messages = useDemo((s) => s.messages);
  const outbox = useDemo((s) => s.outbox);
  const [tab, setTab] = useState<"updates" | "emails">("updates");
  const mineIds = useMemo(() => new Set(cases.filter((c) => c.buyerId === DEMO_BUYER.id).map((c) => c.id)), [cases]);
  const updates = useMemo(() => messages.filter((m) => mineIds.has(m.caseId)).reverse(), [messages, mineIds]);
  const emails = useMemo(() => outbox.filter((e) => e.to === DEMO_BUYER.email).reverse(), [outbox]);

  return (
    <div>
      <MobileHeader title="Inbox" back="/buyer" />
      <div className="sticky top-14 z-10 grid grid-cols-2 border-b bg-white text-sm font-medium">
        {(["updates", "emails"] as const).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} className={cn("h-11 capitalize", tab === t ? "border-b-2 border-brand text-brand" : "text-zinc-500")}>
            {t === "emails" ? "Email outbox" : "App updates"}
          </button>
        ))}
      </div>
      <ul className="space-y-2 p-4">
        {tab === "updates" &&
          updates.map((m) => (
            <li key={m.id}>
              <Link href={`/buyer/cases/${m.caseId}`} className="flex gap-3 rounded-2xl bg-white p-3 ring-1 ring-zinc-200/70">
                <MessageSquare className="mt-0.5 size-4 shrink-0 text-brand" />
                <div>
                  <p className="text-sm font-medium">{m.title}</p>
                  <p className="text-xs text-zinc-600">{m.body}</p>
                  <p className="mt-1 text-[11px] text-zinc-400">{fmtDateTime(m.at)}</p>
                </div>
              </Link>
            </li>
          ))}
        {tab === "emails" &&
          emails.map((e) => (
            <li key={e.id} className="rounded-2xl bg-white p-3 ring-1 ring-zinc-200/70">
              <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                <Mail className="size-3.5 text-sky-600" /> To {e.to}
                <span className="ml-auto rounded bg-zinc-100 px-1.5 py-0.5">{e.status}</span>
              </div>
              <p className="mt-1 text-sm font-medium">{e.subject}</p>
              <p className="text-xs text-zinc-600">{e.body}</p>
              <p className="mt-1 text-[11px] text-zinc-400">{fmtDateTime(e.at)}</p>
            </li>
          ))}
        {(tab === "updates" ? updates : emails).length === 0 && <li className="py-10 text-center text-sm text-zinc-500">Nothing here yet.</li>}
      </ul>
    </div>
  );
}
