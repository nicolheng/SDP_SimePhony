"use client";
import { Loader2 } from "lucide-react";
import { useLoadStatus } from "@/lib/store";

/** Covers the screen until the first response from the backend, so the fallback data never flashes. */
export function DataGate() {
  if (useLoadStatus() === "ready") return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-white/90 backdrop-blur-sm">
      <p className="flex items-center gap-2 text-base text-zinc-600">
        <Loader2 className="size-5 animate-spin text-brand" /> Loading data from the database…
      </p>
    </div>
  );
}
