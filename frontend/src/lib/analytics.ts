// SDP console figures come from the backend (backend/demo_api/analytics.py), so the dashboard and the
// RecurrenceAgent's escalations use the same rules. This file only lays them out for display.
import { FLOORS, STACKS } from "./constants";
import { useDemo } from "./store";
import type { Analytics, Category } from "./types";

/** The backend's figures, or null when it can't be reached (the offline demo data has none). */
export function useAnalytics(): Analytics | null {
  return useDemo((s) => s.analytics ?? null);
}

export interface HeatCell {
  unitId: string;
  floor: number;
  stack: string;
  count: number;
  open: boolean;
  /** Part of the selected systemic issue (false = shown muted). */
  inIssue: boolean;
}

/** One block as a floor × stack grid, from the backend's per-unit counts. */
export function stackHeatmap(stats: Analytics["unitStats"], block: string, category: Category | "all", issueUnits?: Set<string>): HeatCell[][] {
  const byUnit = new Map<string, { count: number; open: boolean }>();
  for (const s of stats) {
    if (category !== "all" && s.category !== category) continue;
    const cur = byUnit.get(s.unitId) ?? { count: 0, open: false };
    byUnit.set(s.unitId, { count: cur.count + s.count, open: cur.open || s.open });
  }
  const rows: HeatCell[][] = [];
  for (let floor = FLOORS; floor >= 1; floor--) {
    rows.push(
      STACKS.map((stack) => {
        const unitId = `${block}-${floor}-${stack}`;
        const hit = byUnit.get(unitId);
        return { unitId, floor, stack, count: hit?.count ?? 0, open: hit?.open ?? false, inIssue: !issueUnits || issueUnits.has(unitId) };
      }),
    );
  }
  return rows;
}
