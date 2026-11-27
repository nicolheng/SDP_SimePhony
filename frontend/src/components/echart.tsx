"use client";
import type { EChartsOption, EChartsType } from "echarts";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/** One ECharts chart. The library (~1 MB) is loaded only when a chart mounts, after the page has painted.
 *  Options are plain objects (see insight-charts.ts); the chart resizes with its box and animates on first draw. */
export function EChart({ option, height = 260, className, onClick }: { option: EChartsOption; height?: number; className?: string; onClick?: (name: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const chart = useRef<EChartsType | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let disposed = false;
    let ro: ResizeObserver | null = null;
    import("echarts").then((echarts) => {
      if (disposed || !box.current) return;
      chart.current = echarts.init(box.current, null, { renderer: "canvas" });
      ro = new ResizeObserver(() => chart.current?.resize());
      ro.observe(box.current);
      setReady(true);
    });
    return () => {
      disposed = true;
      ro?.disconnect();
      chart.current?.dispose();
      chart.current = null;
    };
  }, []);

  useEffect(() => {
    if (ready) chart.current?.setOption({ ...BASE, ...option, tooltip: { ...(BASE.tooltip as object), ...(option.tooltip as object) } }, true);
  }, [ready, option]);

  useEffect(() => {
    const c = chart.current;
    if (!ready || !c || !onClick) return;
    const handler = (p: { name?: string }) => {
      if (p.name) onClick(p.name);
    };
    c.on("click", handler);
    return () => {
      c.off("click", handler);
    };
  }, [ready, onClick]);

  return (
    <div className={cn("relative", className)} style={{ height }}>
      {!ready && <div className="absolute inset-0 animate-pulse rounded-xl bg-zinc-100" />}
      <div ref={box} className="size-full" />
    </div>
  );
}

// Shared look: the app's font, recessive axes and a light tooltip card.
const BASE: EChartsOption = {
  textStyle: { fontFamily: "inherit", color: "#52525b" },
  animationDuration: 900,
  animationEasing: "cubicOut",
  tooltip: {
    backgroundColor: "rgba(255,255,255,0.97)",
    borderColor: "#e4e4e7",
    borderWidth: 1,
    padding: [8, 12],
    textStyle: { color: "#18181b", fontSize: 13 },
    extraCssText: "border-radius:10px;box-shadow:0 8px 24px rgba(24,24,27,0.12);",
  },
};
