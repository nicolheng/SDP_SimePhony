// Derived numbers for the SDP console (P4's get_recurring_stats will replace these).
import { CATEGORY_LABEL, FLOORS, getUnit, STACKS } from "./constants";
import { addDays, daysBetween } from "./dates";
import { isOpen } from "./status";
import type { Case, Category } from "./types";

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
}

export function stackHeatmap(cases: Case[], block: string, category: Category | "all"): HeatCell[][] {
  const rows: HeatCell[][] = [];
  for (let floor = FLOORS; floor >= 1; floor--) {
    rows.push(
      STACKS.map((stack) => {
        const unitId = `${block}-${floor}-${stack}`;
        const hits = cases.filter((c) => c.unitId === unitId && c.status !== "INVALID" && (category === "all" || c.category === category));
        return { unitId, floor, stack, count: hits.length + hits.reduce((a, c) => a + c.reopenCount, 0), open: hits.some((c) => isOpen(c.status)) };
      }),
    );
  }
  return rows;
}

/** Short "analytics insight" text — placeholder for P1's AI summary. */
export function insight(cases: Case[]) {
  const top = topRecurring(cases, 1)[0];
  if (!top) return "No recurring problems detected.";
  const u = getUnit(top.unitId);
  const stack = cases.filter((c) => {
    const x = getUnit(c.unitId);
    return c.category === top.category && x.block === u.block && x.stack === u.stack && c.status !== "INVALID";
  });
  const units = new Set(stack.map((c) => c.unitId)).size;
  return `${CATEGORY_LABEL[top.category]} is the top recurring problem: ${top.unitId} has ${top.count} reports${
    top.reopens ? ` and ${top.reopens} reopen(s)` : ""
  }. ${units} units in stack ${u.block}-${u.stack} share it, which points to a shared source (e.g. the riser or the bathroom waterproofing above) rather than separate defects.`;
}
