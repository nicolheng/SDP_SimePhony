"use client";
import { Activity, ArrowLeftRight, BarChart3, ClipboardList, LayoutDashboard, Layers, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { AppName, BrandMark } from "@/components/brand";
import { DemoControls } from "@/components/demo-controls";
import { useDemo } from "@/lib/store";
import { cn } from "@/lib/utils";

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
            <p className="text-[11px] text-zinc-500">Defect management</p>
          </div>
        </div>
        <nav className="mt-8 space-y-1">
          {items.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm",
                isActive(i.href) ? "bg-brand text-white" : "hover:bg-white/10 hover:text-white",
              )}
            >
              <i.icon className="size-4" />
              {i.label}
              {!!i.badge && <span className="ml-auto rounded-full bg-white px-1.5 text-[11px] font-semibold text-brand">{i.badge}</span>}
            </Link>
          ))}
        </nav>
        <div className="mt-auto space-y-3">
          <DemoControls />
          <Link href="/" className="flex items-center gap-2 px-2.5 text-xs text-zinc-400 hover:text-white">
            <ArrowLeftRight className="size-3.5" /> Switch role
          </Link>
        </div>
      </aside>

      {/* Narrow screens: top bar */}
      <div className="fixed inset-x-0 top-0 z-20 flex h-14 items-center gap-2 overflow-x-auto bg-ink px-3 lg:hidden">
        <BrandMark size="sm" />
        {items.map((i) => (
          <Link
            key={i.href}
            href={i.href}
            className={cn("shrink-0 rounded-md px-2.5 py-1.5 text-xs", isActive(i.href) ? "bg-brand text-white" : "text-zinc-300")}
          >
            {i.label}
            {!!i.badge && ` (${i.badge})`}
          </Link>
        ))}
      </div>
    </>
  );
}
