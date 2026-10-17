import { Suspense } from "react";
import { JobDetail } from "./job-detail";

export default function Page() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-zinc-500">Loading…</div>}>
      <JobDetail />
    </Suspense>
  );
}
