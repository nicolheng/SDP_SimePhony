"use client";
import { useParams } from "next/navigation";
import { UnitRecordView } from "@/components/unit-record";
import { DEMO_BUYER } from "@/lib/constants";

export default function RecordDetail() {
  const id = useParams<{ id: string }>().id;
  return <UnitRecordView id={id} viewer={`Buyer (${DEMO_BUYER.name})`} back="/buyer/records" />;
}
