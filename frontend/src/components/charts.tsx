"use client";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const AXIS = { fontSize: 14, fill: "#52525b" };
const TOOLTIP = { contentStyle: { borderRadius: 10, border: "1px solid #e4e4e7", fontSize: 14 }, cursor: { fill: "#f4f4f5" } };

/** Single-series horizontal bars: one hue, rounded data ends, hover tooltip. */
export function HBars({ data, dataKey = "count", height = 280 }: { data: { name: string }[]; dataKey?: string; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }} barCategoryGap={6}>
        <CartesianGrid horizontal={false} stroke="#f4f4f5" />
        <XAxis type="number" tick={AXIS} axisLine={false} tickLine={false} allowDecimals={false} />
        <YAxis type="category" dataKey="name" tick={AXIS} axisLine={false} tickLine={false} width={130} />
        <Tooltip {...TOOLTIP} />
        <Bar dataKey={dataKey} name="Defects" fill="var(--brand)" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function TrendLine({ data, height = 220 }: { data: { month: string; count: number }[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ left: -16, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} stroke="#f4f4f5" />
        <XAxis dataKey="month" tick={AXIS} axisLine={false} tickLine={false} />
        <YAxis tick={AXIS} axisLine={false} tickLine={false} allowDecimals={false} />
        <Tooltip {...TOOLTIP} cursor={{ stroke: "#d4d4d8" }} />
        <Line type="monotone" dataKey="count" name="New defects" stroke="var(--brand)" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
