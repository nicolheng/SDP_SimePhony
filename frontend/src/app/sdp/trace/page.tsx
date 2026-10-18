"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { EventTimeline } from "@/components/case-views";
import { PageTitle, Panel } from "@/components/sdp-ui";
import { useDemo } from "@/lib/store";
import { cn } from "@/lib/utils";

const FILTERS = [
  { id: "all", label: "Everything" },
  { id: "agent", label: "Agent steps" },
  { id: "email", label: "Emails" },
] as const;

export default function AgentTrace() {
  const events = useDemo((s) => s.events);
  const outbox = useDemo((s) => s.outbox);
  const [f, setF] = useState<(typeof FILTERS)[number]["id"]>("agent");
  const shown = useMemo(
    () => events.filter((e) => (f === "all" ? true : f === "agent" ? e.type === "agent.step" : e.type === "email.sent")).slice(-150),
    [events, f],
  );

  return (
    <div className="mx-auto max-w-6xl">
      <PageTitle title="Agent trace" sub="Live log of every agent step, case event and email. Updates as the demo runs." />
      <div className="grid gap-6 lg:grid-cols-3">
        <Panel
          className="lg:col-span-2"
          action={
            <div className="flex rounded-lg bg-zinc-100 p-0.5 text-sm">
              {FILTERS.map((x) => (
                <button key={x.id} type="button" onClick={() => setF(x.id)} className={cn("rounded-md px-2.5 py-1", f === x.id ? "bg-white font-medium shadow-sm" : "text-zinc-500")}>
                  {x.label}
                </button>
              ))}
            </div>
          }
          title={`${shown.length} entries`}
        >
          <EventTimeline large events={shown} />
        </Panel>
        <Panel title="Outbox">
          <ul className="space-y-3">
            {[...outbox].reverse().slice(0, 30).map((e) => (
              <li key={e.id} className="rounded-lg p-2 text-sm ring-1 ring-zinc-200">
                <p className="text-zinc-500">
                  To {e.to} · <span className="rounded bg-zinc-100 px-1">{e.status}</span>
                </p>
                <p className="mt-0.5 font-medium text-zinc-800">{e.subject}</p>
                {e.caseId && (
                  <Link href={`/sdp/defects/${e.caseId}`} className="text-brand hover:underline">
                    {e.caseId}
                  </Link>
                )}
              </li>
            ))}
            {outbox.length === 0 && <p className="text-base text-zinc-500">No emails yet.</p>}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
