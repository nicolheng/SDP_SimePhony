"use client";
import { Clock } from "lucide-react";

/** Shown to the buyer until the assigned technician accepts the job; then the technician card takes its place. */
export function ArrangingSoon({ what = "A technician" }: { what?: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-amber-50 text-amber-600 ring-1 ring-amber-200">
        <Clock className="size-5" />
      </span>
      <div className="text-sm">
        <p className="font-medium text-zinc-900">{what} will be arranged soon.</p>
        <p className="mt-0.5 text-xs text-zinc-500">We will show the technician and the time once they confirm.</p>
      </div>
    </div>
  );
}
