"use client";
import { Activity, BarChart3, ClipboardList, LayoutDashboard, Layers, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AppName, BrandMark } from "@/components/brand";
import { DemoControls } from "@/components/demo-controls";
import { RoleSwitcher } from "@/components/role-switcher";
import { API_URL, useDemo } from "@/lib/store";
import { cn } from "@/lib/utils";

type HealthStatus = "checking" | "healthy" | "degraded" | "offline";
type HealthResponse = {
  status: "healthy" | "degraded";
  checks: Record<string, { status: string; message: string }>;
};

function HealthIndicator() {
  const [status, setStatus] = useState<HealthStatus>("checking");
  const [details, setDetails] = useState("Checking backend health");

  useEffect(() => {
    let active = true;
    const checkHealth = async () => {
      try {
        const response = await fetch(`${API_URL}/health`, { cache: "no-store" });
        if (!response.ok) throw new Error(`Health endpoint returned ${response.status}`);
        const result = await response.json() as HealthResponse;
        const failed = Object.entries(result.checks)
          .filter(([, check]) => check.status !== "ok" && check.status !== "disabled")
          .map(([name, check]) => `${name}: ${check.message}`);
        if (active) {
          setStatus(result.status === "healthy" ? "healthy" : "degraded");
          setDetails(failed.length ? failed.join("; ") : "All system checks are healthy");
        }
      } catch {
        if (active) {
          setStatus("offline");
          setDetails("Health endpoint is unreachable");
        }
      }
    };

    void checkHealth();
    const interval = window.setInterval(checkHealth, 30_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  const dotClass = {
    checking: "bg-zinc-400",
    healthy: "bg-emerald-400",
    degraded: "bg-amber-400",
    offline: "bg-red-500",
  }[status];

  return (
    <span
      role="status"
      aria-label={`System health: ${status}`}
      title={details}
      className="inline-flex items-center gap-2 text-sm text-zinc-400"
    >
      <span className={cn("size-2.5 rounded-full", dotClass)} aria-hidden="true" />
      <span className="hidden sm:inline">System health</span>
    </span>
  );
}

export function SdpSidebar() {
  const path = usePathname();
  const approvals = useDemo((s) => s.approvals);
  const pending = useMemo(() => approvals.filter((a) => a.status === "pending").length, [approvals]);
  const items = [
    { href: "/sdp", label: "Overview", icon: LayoutDashboard },
    { href: "/sdp/defects", label: "Defects", icon: ClipboardList },
    { href: "/sdp/analytics", label: "Analytics", icon: BarChart3 },
    { href: "/sdp/approvals", label: "Approvals", icon: ShieldCheck, badge: pending },
    { href: "/sdp/systemic", label: "Systemic issues", icon: Layers },
    { href: "/sdp/trace", label: "Agent trace", icon: Activity },
  ];
  const isActive = (href: string) => (href === "/sdp" ? path === "/sdp" : path.startsWith(href));

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col bg-ink p-4 text-zinc-300 lg:flex">
        <div className="flex items-center gap-2.5 px-1">
          <BrandMark size="sm" />
          <div className="leading-tight">
            <AppName className="text-white" />
            <p className="text-sm text-zinc-500">Defect management</p>
          </div>
        </div>
        <RoleSwitcher dark className="mt-5 w-full" />
        <nav className="mt-6 space-y-1">
          {items.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-base",
                isActive(i.href) ? "bg-brand text-white" : "hover:bg-white/10 hover:text-white",
              )}
            >
              <i.icon className="size-4" />
              {i.label}
              {!!i.badge && <span className="ml-auto rounded-full bg-white px-1.5 text-sm font-semibold text-brand">{i.badge}</span>}
            </Link>
          ))}
        </nav>
        <div className="mt-auto space-y-3">
          <div className="px-3"><HealthIndicator /></div>
          <DemoControls />
        </div>
      </aside>

      {/* Narrow screens: top bar */}
      <div className="fixed inset-x-0 top-0 z-20 flex h-14 items-center gap-2 overflow-x-auto bg-ink px-3 lg:hidden">
        <BrandMark size="sm" />
        <RoleSwitcher dark className="w-40 shrink-0" />
        <HealthIndicator />
        {items.map((i) => (
          <Link
            key={i.href}
            href={i.href}
            className={cn("shrink-0 rounded-md px-2.5 py-1.5 text-sm", isActive(i.href) ? "bg-brand text-white" : "text-zinc-300")}
          >
            {i.label}
            {!!i.badge && ` (${i.badge})`}
          </Link>
        ))}
      </div>
    </>
  );
}
