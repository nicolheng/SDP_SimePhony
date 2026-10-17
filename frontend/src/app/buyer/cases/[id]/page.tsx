import { Suspense } from "react";
import { CaseDetail } from "./case-detail";

export default function Page() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-zinc-500">Loading…</div>}>
      <CaseDetail />
    </Suspense>
  );
}
