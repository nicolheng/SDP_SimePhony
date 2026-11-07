"use client";
import { Building2, Check, X } from "lucide-react";
import { buyerUnits, DEMO_BUYER, getUnit, PROJECT_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Overlay } from "./overlay";

/** Bottom sheet listing the buyer's registered properties (assets); picking one reports the defect against it. */
export function AssetPicker({ value, onPick, onClose }: { value: string; onPick: (unitId: string) => void; onClose: () => void }) {
  const units = buyerUnits(DEMO_BUYER);
  return (
    <Overlay label="Select asset" onClick={onClose} className="flex items-end bg-black/40">
      <div onClick={(e) => e.stopPropagation()} className="w-full rounded-t-2xl bg-white p-4 pb-6 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">Select Asset</h2>
          <button type="button" onClick={onClose} className="grid size-8 place-items-center rounded-full hover:bg-zinc-100" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>
        <ul className="space-y-2">
          {units.map((id) => {
            const u = getUnit(id);
            const on = id === value;
            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => {
                    onPick(id);
                    onClose();
                  }}
                  className={cn("flex w-full items-center gap-3 rounded-xl p-3 text-left ring-1", on ? "bg-red-50 ring-brand" : "ring-zinc-200 hover:ring-brand")}
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-zinc-100 text-zinc-600">
                    <Building2 className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{PROJECT_NAME}</span>
                    <span className="block text-xs text-zinc-500">
                      Unit {id} · Block {u.block}, level {u.floor}
                    </span>
                  </span>
                  {on && <Check className="size-5 text-brand" />}
                </button>
              </li>
            );
          })}
        </ul>
        {units.length === 1 && <p className="mt-3 text-center text-xs text-zinc-500">Only one property is registered to your account.</p>}
      </div>
    </Overlay>
  );
}
