import { Suspense } from "react";
import { BookRepair } from "./book";

export default function Page() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-zinc-500">Loading…</div>}>
      <BookRepair />
    </Suspense>
  );
}
