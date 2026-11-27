"use client";
// The defect knowledge base (GET /api/kb): limit rules from kb/tolerances.yaml and the reasons a defect can be
// invalid from kb/invalid_defect_reasons.yaml. Plain data, fetched once and shared.
import { useEffect, useState } from "react";
import { apiFetch } from "./store";
import type { Category } from "./types";

export interface KbRule {
  id: string;
  category: Category | string;
  condition: string;
  check: "measure" | "yes_no";
  metric: string | null;
  question: string | null;
  unit: string | null;
  op: string | null;
  threshold: number | null;
  escalateOver: number | null;
  tool: string;
  howToMeasure: string;
  photoCanDecide: boolean;
  source: { id: string; title: string; authority: string; clause: string | null };
  verified: boolean;
  /** The repair method for this defect (kb/repair_methods.yaml). */
  repairMethodId: string | null;
}

/** A repair guide for technicians only: never shown to buyers. */
export interface KbMethod {
  id: string;
  title: string;
  categories: string[];
  steps: string[];
  expectedOutcome: string | null;
  materials: string[];
  dryingTime: string | null;
  callSpecialistIf: string[];
  specialistTrade: string | null;
}

/** How to verify a defect type that has no limit rule (kb/verify_methods.yaml). Technicians only. */
export interface KbVerifyMethod {
  id: string;
  category: string;
  tool: string;
  steps: string[];
  defectIf: string;
  /** Source titles. */
  sources: string[];
  verified: boolean;
}

export interface Kb {
  rules: KbRule[];
  methods: KbMethod[];
  verifyMethods?: KbVerifyMethod[];
  reasons: { code: string; label: string; description: string }[];
}

let cache: Promise<Kb | null> | null = null;

/** The KB, or null while loading or when the backend is offline. */
export function useKb(): Kb | null {
  const [kb, setKb] = useState<Kb | null>(null);
  useEffect(() => {
    cache ??= apiFetch<Kb>("/api/kb").catch(() => {
      cache = null; // try again next time
      return null;
    });
    let live = true;
    cache.then((k) => live && setKb(k));
    return () => {
      live = false;
    };
  }, []);
  return kb;
}

/** Short labels for the technician's "No" reasons and for showing a saved reason. Codes match kb/invalid_defect_reasons.yaml. */
export const INVALID_REASON_LABEL: Record<string, string> = {
  WEAR_AND_TEAR: "Normal wear and tear",
  OWNER_DAMAGE: "Damage caused by the owner",
  OWNER_RENOVATION: "Owner's own renovation",
  WITHIN_TOLERANCE: "Within normal limits",
  LACK_OF_MAINTENANCE: "Lack of maintenance",
  NATURAL_CHARACTERISTIC: "Natural material variation",
  THIRD_PARTY_UTILITY: "Utility or outside service",
  ACT_OF_GOD: "Extreme weather or outside force",
  DUPLICATE_REPORT: "Duplicate report",
  POST_DLP_SUBMISSION: "After the defect period",
};

/** The reason buttons the technician picks from when the answer is No. */
export const INVALID_REASON_CHOICES = [
  "WEAR_AND_TEAR",
  "OWNER_DAMAGE",
  "OWNER_RENOVATION",
  "WITHIN_TOLERANCE",
  "POST_DLP_SUBMISSION",
] as const;

/** Signs on site that would make a defect not the developer's fault (shown before the visit). */
export const NOT_DEVELOPER_SIGNS = ["OWNER_RENOVATION", "OWNER_DAMAGE", "LACK_OF_MAINTENANCE", "WEAR_AND_TEAR"] as const;

/** The one repair method to suggest: the matching rule's method, else the first method for the defect's category. */
export function methodFor(kb: Kb, category: string): KbMethod | undefined {
  const ruled = kb.rules.find((r) => r.category === category && r.repairMethodId)?.repairMethodId;
  return kb.methods?.find((m) => m.id === ruled) ?? kb.methods?.find((m) => m.categories?.includes(category));
}
