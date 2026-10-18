import { TZ } from "./constants";

const DAY = 86_400_000;

export const addDays = (iso: string, days: number) => new Date(new Date(iso).getTime() + days * DAY).toISOString();
export const daysBetween = (a: string, b: string) => (new Date(b).getTime() - new Date(a).getTime()) / DAY;

const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-MY", { timeZone: TZ, ...opts });
const dateFmt = fmt({ day: "numeric", month: "short", year: "numeric" });
const shortFmt = fmt({ day: "numeric", month: "short" });
const dayFmt = fmt({ weekday: "short", day: "numeric", month: "short" });
const timeFmt = fmt({ hour: "numeric", minute: "2-digit", hour12: true });
const keyFmt = fmt({ year: "numeric", month: "2-digit", day: "2-digit" });

export const fmtDate = (iso: string) => dateFmt.format(new Date(iso));
export const fmtShort = (iso: string) => shortFmt.format(new Date(iso));
export const fmtDay = (iso: string) => dayFmt.format(new Date(iso));
export const fmtTime = (iso: string) => timeFmt.format(new Date(iso));
export const fmtDateTime = (iso: string) => `${fmtDay(iso)}, ${fmtTime(iso)}`;

/** YYYY-MM-DD in Malaysia time. */
export const dayKey = (iso: string) => {
  const p = keyFmt.formatToParts(new Date(iso));
  const get = (t: string) => p.find((x) => x.type === t)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
};

/** ISO for a Malaysia-local date + HH:MM. */
export const slotIso = (day: string, time: string) => new Date(`${day}T${time}:00+08:00`).toISOString();

export const relative = (iso: string, now: string) => {
  const d = daysBetween(iso, now);
  if (d < 1 / 24) return "just now";
  if (d < 1) return `${Math.round(d * 24)}h ago`;
  if (d < 30) return `${Math.round(d)}d ago`;
  return fmtDate(iso);
};
