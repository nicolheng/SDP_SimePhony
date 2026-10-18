"use client";
import { Mail, MailOpen } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { EmptyState, MobileHeader } from "@/components/mobile";
import { fmtDateTime } from "@/lib/dates";
import { useDemo } from "@/lib/store";
import { useMyJobs } from "../use-my-jobs";

export default function TechnicianInbox() {
  const { tech } = useMyJobs();
  const outbox = useDemo((s) => s.outbox);
  const mail = useMemo(() => outbox.filter((e) => e.to === tech.email).reverse(), [outbox, tech.email]);

  return (
    <div>
      <MobileHeader title="My Inbox" back="/technician" badge={mail.length} />
      {mail.length === 0 ? (
        <EmptyState icon={<MailOpen className="size-16" strokeWidth={1.5} />} text="You're all caught up! There are no new notifications." />
      ) : (
        <ul className="space-y-2 p-4">
          {mail.map((e) => (
            <li key={e.id}>
              <Link href={e.caseId ? `/technician/jobs/${e.caseId}` : "/technician"} className="block rounded-2xl bg-white p-3 ring-1 ring-zinc-200">
                <p className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                  <Mail className="size-3.5 text-sky-600" /> {fmtDateTime(e.at)}
                  <span className="ml-auto rounded bg-zinc-100 px-1.5 py-0.5">{e.status}</span>
                </p>
                <p className="mt-1 text-sm font-medium">{e.subject}</p>
                <p className="whitespace-pre-line text-xs text-zinc-600">{e.body}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
