// ECharts options for Actions and Insights. Plain objects, rendered by <EChart>.
// Colour roles, kept flat (no gradients): brand red = the thing to act on; light red = the same measure, not
// highlighted; greys = everything else; blue / aqua = identity only (one colour per contractor).
import type { EChartsOption } from "echarts";

export const C = {
  brand: "#d71920",
  brandSoft: "#f4a3a6",
  ink: "#18181b",
  axis: "#71717a",
  grid: "#f4f4f5",
  muted: "#d4d4d8",
  mutedDark: "#a1a1aa",
  blue: "#2a78d6",
  aqua: "#1baf7a",
  amber: "#eda100",
};

const AXIS_LABEL = { color: C.axis, fontSize: 13 };
const SPLIT = { lineStyle: { color: C.grid } };
const LEGEND = { top: 0, right: 0, icon: "roundRect", itemWidth: 12, itemHeight: 12, textStyle: { color: C.axis, fontSize: 13 } };

/** Stacked monthly bars (confirmed + not a defect); the peak month in the brand colour, a 12-month average line. */
export function monthlyOption(data: { month: string; confirmed: number; notDefect: number }[]): EChartsOption {
  const totals = data.map((d) => d.confirmed + d.notDefect);
  const peak = totals.indexOf(Math.max(...totals));
  const avg = totals.reduce((a, b) => a + b, 0) / totals.length;
  return {
    grid: { left: 8, right: 16, top: 40, bottom: 8, containLabel: true },
    legend: LEGEND,
    tooltip: { trigger: "axis", axisPointer: { type: "shadow", shadowStyle: { color: "rgba(24,24,27,0.04)" } } },
    xAxis: { type: "category", data: data.map((d) => d.month), axisLine: { lineStyle: { color: C.muted } }, axisTick: { show: false }, axisLabel: AXIS_LABEL },
    yAxis: { type: "value", splitLine: SPLIT, axisLabel: AXIS_LABEL, minInterval: 1 },
    series: [
      {
        name: "Confirmed defect",
        type: "bar",
        stack: "r",
        barWidth: "56%",
        itemStyle: { color: C.brandSoft },
        data: data.map((d, i) => (i === peak ? { value: d.confirmed, itemStyle: { color: C.brand } } : d.confirmed)),
        markLine: {
          silent: true,
          symbol: "none",
          lineStyle: { color: C.mutedDark, type: "dashed" },
          label: { formatter: `Avg ${avg.toFixed(1)}`, color: C.axis, position: "insideStartTop" },
          data: [{ yAxis: avg }],
        },
      },
      {
        name: "Not a defect",
        type: "bar",
        stack: "r",
        data: data.map((d) => d.notDefect),
        itemStyle: { color: C.muted, borderRadius: [4, 4, 0, 0] },
        label: { show: true, position: "top", color: C.ink, fontWeight: "bold", formatter: (p) => (p.dataIndex === peak ? String(totals[peak]) : "") },
      },
    ],
  };
}

/** One horizontal bar split into the stages of a case; the slowest stage in the brand colour, the rest grey. */
export function stagesOption(stages: { label: string; days: number }[]): EChartsOption {
  const slowest = Math.max(...stages.map((s) => s.days));
  return {
    grid: { left: 0, right: 0, top: 0, bottom: 0 },
    tooltip: {
      trigger: "item",
      formatter: (p) => {
        const q = p as { seriesName: string; value: number };
        return `${q.seriesName}<br/><b>${q.value.toFixed(1)} days</b>`;
      },
    },
    xAxis: { type: "value", show: false, max: stages.reduce((n, s) => n + s.days, 0) },
    yAxis: { type: "category", show: false, data: ["case"] },
    series: stages.map((s, i) => ({
      name: s.label,
      type: "bar",
      stack: "t",
      barWidth: 36,
      data: [s.days],
      itemStyle: {
        color: s.days === slowest ? C.brand : i === 0 ? C.mutedDark : C.muted,
        borderRadius: i === 0 ? [6, 0, 0, 6] : i === stages.length - 1 ? [0, 6, 6, 0] : 0,
        borderColor: "#fff",
        borderWidth: 2,
      },
      label: { show: true, color: s.days === slowest ? "#fff" : C.ink, fontWeight: "bold", fontSize: 13, formatter: (p) => `${(p.value as number).toFixed(1)}d` },
    })),
  };
}

/** Horizontal stacked bars per category: fixed first time (grey) + came back (brand). */
export function categoriesOption(data: { name: string; firstTime: number; cameBack: number }[]): EChartsOption {
  const rows = [...data].reverse(); // ECharts draws the first category at the bottom
  return {
    grid: { left: 8, right: 32, top: 32, bottom: 0, containLabel: true },
    legend: LEGEND,
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow", shadowStyle: { color: "rgba(24,24,27,0.04)" } },
      formatter: (ps) => {
        const p = ps as { name: string; value: number; seriesName: string; marker: string }[];
        const total = p.reduce((n, x) => n + x.value, 0);
        const back = p.find((x) => x.seriesName === "Came back")?.value ?? 0;
        return `<b>${p[0].name}</b><br/>${p.map((x) => `${x.marker}${x.seriesName}: <b>${x.value}</b>`).join("<br/>")}<br/>Came back: <b>${Math.round((back / total) * 100)}%</b>`;
      },
    },
    xAxis: { type: "value", splitLine: SPLIT, axisLabel: AXIS_LABEL, minInterval: 1 },
    yAxis: { type: "category", data: rows.map((d) => d.name), axisLine: { show: false }, axisTick: { show: false }, axisLabel: { ...AXIS_LABEL, color: C.ink } },
    series: [
      { name: "Fixed first time", type: "bar", stack: "c", barWidth: 14, data: rows.map((d) => d.firstTime), itemStyle: { color: C.muted } },
      {
        name: "Came back",
        type: "bar",
        stack: "c",
        data: rows.map((d) => d.cameBack),
        itemStyle: { color: C.brand, borderRadius: [0, 4, 4, 0] },
        label: { show: true, position: "right", color: C.ink, fontWeight: "bold", formatter: (p) => ((p.value as number) ? `${p.value}` : "") },
      },
    ],
  };
}

export const CONTRACTOR_COLOURS = [C.brand, C.blue, C.aqua];

/** Radar comparing the contractors; each axis its own scale, further out = worse. */
export function radarOption(r: { axes: { name: string; max: number }[]; series: { name: string; values: number[] }[] }): EChartsOption {
  return {
    legend: { bottom: 0, icon: "circle", itemWidth: 10, itemHeight: 10, textStyle: { color: C.ink, fontSize: 13 } },
    tooltip: { trigger: "item" },
    radar: {
      indicator: r.axes,
      radius: "66%",
      center: ["50%", "46%"],
      splitNumber: 4,
      axisName: { color: C.axis, fontSize: 12 },
      splitLine: { lineStyle: { color: "#e4e4e7" } },
      splitArea: { show: false },
      axisLine: { lineStyle: { color: "#e4e4e7" } },
    },
    series: [
      {
        type: "radar",
        symbolSize: 5,
        data: r.series.map((s, i) => ({
          name: s.name,
          value: s.values,
          lineStyle: { color: CONTRACTOR_COLOURS[i], width: 2 },
          itemStyle: { color: CONTRACTOR_COLOURS[i] },
          areaStyle: { color: CONTRACTOR_COLOURS[i], opacity: 0.08 },
        })),
        emphasis: { lineStyle: { width: 3 }, areaStyle: { opacity: 0.2 } },
      },
    ],
  };
}

/** Buyer ratings, 5 stars at the top: 1-2 stars in the brand colour, the rest amber. */
export function ratingsOption(dist: { stars: number; count: number }[]): EChartsOption {
  const rows = [...dist].reverse();
  return {
    grid: { left: 8, right: 36, top: 0, bottom: 0, containLabel: true },
    tooltip: { trigger: "item", formatter: "{b}<br/><b>{c}</b> ratings" },
    xAxis: { type: "value", show: false },
    yAxis: { type: "category", data: rows.map((d) => `${d.stars}★`), axisLine: { show: false }, axisTick: { show: false }, axisLabel: { ...AXIS_LABEL, color: C.ink } },
    series: [
      {
        type: "bar",
        barWidth: 12,
        data: rows.map((d) => ({ value: d.count, itemStyle: { color: d.stars <= 2 ? C.brand : C.amber } })),
        itemStyle: { borderRadius: 6 },
        showBackground: true,
        backgroundStyle: { color: C.grid, borderRadius: 6 },
        label: { show: true, position: "right", color: C.ink, fontWeight: "bold" },
      },
    ],
  };
}

/** Simple horizontal bars (largest first): the largest in the brand colour, the rest light red, value at the end. */
export function hbarOption(data: { name: string; count: number }[], series = "Count"): EChartsOption {
  const rows = [...data].reverse();
  const max = Math.max(...data.map((d) => d.count));
  return {
    grid: { left: 8, right: 36, top: 4, bottom: 4, containLabel: true },
    tooltip: { trigger: "item", formatter: `{b}<br/><b>{c}</b> ${series.toLowerCase()}` },
    xAxis: { type: "value", show: false, max },
    yAxis: { type: "category", data: rows.map((d) => d.name), axisLine: { show: false }, axisTick: { show: false }, axisLabel: { ...AXIS_LABEL, color: C.ink } },
    series: [
      {
        type: "bar",
        name: series,
        barWidth: 12,
        data: rows.map((d) => ({ value: d.count, itemStyle: { color: d.count === max ? C.brand : C.brandSoft } })),
        itemStyle: { borderRadius: 6 },
        showBackground: true,
        backgroundStyle: { color: C.grid, borderRadius: 6 },
        label: { show: true, position: "right", color: C.ink, fontWeight: "bold" },
      },
    ],
  };
}

/** Actions: open repairs by time left on the 30-day clock, as a doughnut with one number in the middle. */
export function clockOption(parts: { label: string; n: number; colour: string }[], centre: { value: number; label: string }): EChartsOption {
  return {
    tooltip: { trigger: "item", formatter: "{b}: <b>{c}</b> ({d}%)" },
    title: {
      text: String(centre.value),
      subtext: centre.label,
      left: "center",
      top: "34%",
      textStyle: { fontSize: 30, fontWeight: "bold", color: C.ink },
      subtextStyle: { fontSize: 13, color: C.axis },
    },
    series: [
      {
        type: "pie",
        radius: ["64%", "86%"],
        padAngle: 2,
        itemStyle: { borderRadius: 4 },
        label: { show: false },
        data: parts.filter((p) => p.n).map((p) => ({ name: p.label, value: p.n, itemStyle: { color: p.colour } })),
      },
    ],
  };
}
