import { Suspense } from "react";
import { SdpCaseDetail } from "./case-detail";

export default function Page() {
  return (
    <Suspense fallback={<p className="text-base text-zinc-500">Loading…</p>}>
      <SdpCaseDetail />
    </Suspense>
  );
}
