"use client";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PageTitle } from "@/components/sdp-ui";
import { UnitRecordView } from "@/components/unit-record";
import { SDP_STAFF } from "@/lib/constants";

/** SDP console: one unit sign-off record (the same record and PDF the buyer gets). */
export default function StaffRecord() {
  const id = useParams<{ id: string }>().id;
  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/sdp/defects?view=records" className="mb-2 inline-flex items-center gap-1 text-base text-zinc-500 hover:text-zinc-800">
        <ArrowLeft className="size-4" /> Sign-off Records
      </Link>
      <PageTitle title="Rectification Record" sub="Every defect closed by this unit sign-off, as the buyer sees it" />
      <UnitRecordView id={id} viewer={`${SDP_STAFF.name} (${SDP_STAFF.title})`} large />
    </div>
  );
}
