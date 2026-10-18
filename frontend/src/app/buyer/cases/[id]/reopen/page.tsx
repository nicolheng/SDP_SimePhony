import { Suspense } from "react";
import { ReopenCase } from "./reopen";

export default function Page() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-zinc-500">Loading…</div>}>
      <ReopenCase />
    </Suspense>
  );
}
