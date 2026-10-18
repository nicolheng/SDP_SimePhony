// Derived numbers for the SDP console (P4's get_recurring_stats will replace these).
import { CATEGORY_LABEL, FLOORS, getUnit, RULES, STACKS } from "./constants";
import { addDays, daysBetween } from "./dates";
import { isOpen } from "./status";
import type { Case, Category, SystemicIssue } from "./types";

export function kpis(cases: Case[]) {
  const open = cases.filter((c) => isOpen(c.status));
  const closed = cases.filter((c) => c.status === "CLOSED" || c.status === "INVALID");
  const reopened = cases.filter((c) => c.reopenCount > 0);
  const durations = cases.filter((c) => c.status === "CLOSED" && c.closedAt).map((c) => daysBetween(c.createdAt, c.closedAt!));
  return {
    open: open.length,
    closed: closed.length,
    reopened: reopened.length,
    reopenRate: closed.length ? reopened.length / (closed.length + open.length) : 0,
    avgDaysToClose: durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0,
    highOpen: open.filter((c) => c.urgency === "high").length,
  };
}

export function byCategory(cases: Case[]) {
  const m = new Map<Category, number>();
  for (const c of cases) m.set(c.category, (m.get(c.category) ?? 0) + 1);
  return [...m.entries()].map(([k, v]) => ({ key: k, name: CATEGORY_LABEL[k], count: v })).sort((a, b) => b.count - a.count);
}

export function byBlock(cases: Case[]) {
  const m = new Map<string, { open: number; total: number }>();
  for (const c of cases) {
    const b = getUnit(c.unitId).block;
    const cur = m.get(b) ?? { open: 0, total: 0 };
    cur.total++;
    if (isOpen(c.status)) cur.open++;
    m.set(b, cur);
  }
  return [...m.entries()].sort().map(([b, v]) => ({ name: `Block ${b}`, ...v }));
}

export function monthly(cases: Case[], now: string, months = 12) {
  const out: { month: string; count: number }[] = [];
  const fmt = new Intl.DateTimeFormat("en-MY", { month: "short", timeZone: "Asia/Kuala_Lumpur" });
  for (let i = months - 1; i >= 0; i--) {
    const end = addDays(now, -30 * i);
    const start = addDays(end, -30);
    out.push({ month: fmt.format(new Date(end)), count: cases.filter((c) => c.createdAt > start && c.createdAt <= end).length });
  }
  return out;
}

/** Units with the most repeat reports of the same category. */
export function topRecurring(cases: Case[], limit = 6) {
  const m = new Map<string, { unitId: string; category: Category; count: number; reopens: number; open: boolean }>();
  for (const c of cases) {
    if (c.status === "INVALID") continue;
    const k = `${c.unitId}|${c.category}`;
    const cur = m.get(k) ?? { unitId: c.unitId, category: c.category, count: 0, reopens: 0, open: false };
    cur.count++;
    cur.reopens += c.reopenCount;
    cur.open ||= isOpen(c.status);
    m.set(k, cur);
  }
  return [...m.values()]
    .map((x) => ({ ...x, score: x.count + x.reopens }))
    .filter((x) => x.score > 1)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
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

export function stackHeatmap(cases: Case[], block: string, category: Category | "all", issueUnits?: Set<string>): HeatCell[][] {
  const rows: HeatCell[][] = [];
  for (let floor = FLOORS; floor >= 1; floor--) {
    rows.push(
      STACKS.map((stack) => {
        const unitId = `${block}-${floor}-${stack}`;
        const hits = cases.filter((c) => c.unitId === unitId && c.status !== "INVALID" && (category === "all" || c.category === category));
        return {
          unitId,
          floor,
          stack,
          count: hits.length + hits.reduce((a, c) => a + c.reopenCount, 0),
          open: hits.some((c) => isOpen(c.status)),
          inIssue: !issueUnits || issueUnits.has(unitId),
        };
      }),
    );
  }
  return rows;
}

/** Clusters below this confidence go on the watchlist instead of being called systemic. */
export const SYSTEMIC_CONFIDENCE = 0.7;

export interface DetectedIssue {
  key: string;
  block: string;
  stack: string;
  category: Category;
  caseIds: string[];
  units: string[];
  reopened: number;
  openCases: number;
  confidence: number;
  headline: string;
  /** The escalated systemic issue record, once the RecurrenceAgent has raised one. */
  record?: SystemicIssue;
}

/**
 * Systemic issue detection: cluster valid cases by block + stack + category and keep clusters that
 * reach the stack threshold in rules.yaml. The heatmap visualises these clusters, not raw cases.
 */
export function detectSystemicIssues(cases: Case[], records: SystemicIssue[]): DetectedIssue[] {
  const groups = new Map<string, Case[]>();
  for (const c of cases) {
    if (c.status === "INVALID") continue;
    const u = getUnit(c.unitId);
    const key = `${u.block}|${u.stack}|${c.category}`;
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }
  const out: DetectedIssue[] = [];
  for (const [key, list] of groups) {
    const units = [...new Set(list.map((c) => c.unitId))];
    if (units.length < RULES.stackClusterThreshold) continue;
    const [block, stack, category] = key.split("|") as [string, string, Category];
    const reopened = list.reduce((a, c) => a + c.reopenCount, 0);
    const openCases = list.filter((c) => isOpen(c.status)).length;
    const repeatUnits = units.filter((u) => list.filter((c) => c.unitId === u).length > 1).length;
    out.push({
      key,
      block,
      stack,
      category,
      caseIds: list.map((c) => c.id),
      units: units.sort((a, b) => getUnit(b).floor - getUnit(a).floor),
      reopened,
      openCases,
      confidence: Math.min(0.95, 0.35 + units.length * 0.08 + repeatUnits * 0.05 + reopened * 0.05),
      headline: `${list.length} related ${CATEGORY_LABEL[category].toLowerCase()} cases concentrated in Block ${block} / Stack ${stack}`,
      record: records.find((r) => r.block === block && r.stack === stack && r.category === category),
    });
  }
  return out.sort((a, b) => b.confidence - a.confidence || b.caseIds.length - a.caseIds.length);
}

/** Short "analytics insight" text for the overview, led by the strongest detected systemic issue. */
export function insight(cases: Case[], records: SystemicIssue[] = []) {
  const top = detectSystemicIssues(cases, records).find((d) => d.confidence >= SYSTEMIC_CONFIDENCE);
  if (!top) return "No systemic issues detected. Defects are spread out with no stack clusters.";
  return `Systemic issue detected: ${top.headline} (${top.units.length} units${top.reopened ? `, ${top.reopened} reopen(s)` : ""}). Units stacked vertically share risers and bathrooms, so this points to a shared source rather than separate defects.`;
}
