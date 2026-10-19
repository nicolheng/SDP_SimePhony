"use client";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";
import { applyTimeRules } from "@/lib/api";
import { useLoadStatus } from "@/lib/store";

/** Covers the screen until the first seed.db load finishes, then applies time-based rules (sign-off period). */
export function DataGate() {
  const status = useLoadStatus();
  useEffect(() => {
    if (status === "ready") applyTimeRules();
  }, [status]);
  if (status === "ready") return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-white/90 backdrop-blur-sm">
      <p className="flex items-center gap-2 text-base text-zinc-600">
        <Loader2 className="size-5 animate-spin text-brand" /> Loading demo data from seed.db…
      </p>
    </div>
  );
}
