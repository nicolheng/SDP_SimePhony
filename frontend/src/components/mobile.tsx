"use client";
import { ArrowLeft, ChevronsRight } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { RoleSwitcher } from "./role-switcher";

/** Phone-sized frame: full screen on phones, a device mock-up on desktop. */
export function MobileFrame({ role, nav, children }: { role: string; nav: ReactNode; children: ReactNode }) {
  return (
    <div className="flex h-dvh flex-1 flex-col items-center bg-zinc-200 md:h-auto md:min-h-dvh md:py-6">
      <div className="flex w-full max-w-[420px] shrink-0 items-center justify-between gap-3 px-3 py-2 text-xs text-zinc-600 md:px-2 md:pb-3 md:pt-0">
        <Suspense fallback={<div className="h-8 w-52" />}>
          <RoleSwitcher className="w-52" />
        </Suspense>
        <span className="hidden md:inline">{role} view (mobile)</span>
      </div>
      <div className="relative flex min-h-0 w-full max-w-[420px] flex-1 flex-col overflow-hidden bg-white md:h-[860px] md:flex-none md:rounded-[2.5rem] md:border-[10px] md:border-zinc-900 md:shadow-2xl">
        <div className="no-scrollbar flex-1 overflow-y-auto">{children}</div>
        <Suspense fallback={<div className="h-16 border-t bg-white" />}>{nav}</Suspense>
      </div>
    </div>
  );
}

/** Charcoal header with rounded bottom corners, as in the SDP app. */
export function MobileHeader({ title, back, right, badge }: { title: string; back?: string; right?: ReactNode; badge?: number }) {
  return (
    <header className="sticky top-0 z-10 flex h-[72px] items-center gap-2 rounded-b-[1.75rem] bg-ink px-4 text-white shadow-sm">
      {back ? (
        <Link href={back} className="grid size-9 place-items-center rounded-full hover:bg-white/10" aria-label="Back">
          <ArrowLeft className="size-5" />
        </Link>
      ) : (
        <span className="size-9" />
      )}
      <h1 className="flex flex-1 items-center justify-center gap-2 truncate text-center text-lg">
        {title}
        {badge !== undefined && <span className="grid size-6 place-items-center rounded-full bg-white text-xs font-semibold text-brand">{badge}</span>}
      </h1>
      <div className="flex size-9 items-center justify-end">{right}</div>
    </header>
  );
}

/** Underlined tabs that scroll sideways (Enquiries screen). */
export function UnderlineTabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string; count?: number }[]; value: T; onChange: (id: T) => void }) {
  return (
    <div className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto border-b border-zinc-200 px-4">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className={cn(
            "relative shrink-0 px-3 pb-2.5 pt-1 text-sm transition",
            value === t.id ? "font-semibold text-brand after:absolute after:inset-x-0 after:-bottom-px after:h-[3px] after:rounded-full after:bg-brand" : "text-zinc-700",
          )}
        >
          {t.label}
          {t.count !== undefined && <span className="ml-1 text-xs text-zinc-400">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

/** Pale summary strip with counts (Total Enquiries / Total Closed). */
export function SummaryStrip({ items }: { items: { label: string; value: number }[] }) {
  return (
    <div className="grid rounded-2xl bg-red-50/70 px-4 py-3" style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }}>
      {items.map((i) => (
        <div key={i.label}>
          <p className="text-2xl tabular-nums text-zinc-900">{i.value}</p>
          <p className="text-xs font-medium text-brand">{i.label}</p>
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center py-14 text-center text-zinc-300">
      {icon}
      <p className="mt-4 max-w-[220px] text-sm text-zinc-400">{text}</p>
    </div>
  );
}

export function FieldLabel({ children, required }: { children: ReactNode; required?: boolean }) {
  return (
    <p className="mb-2 text-sm text-zinc-500">
      {children}
      {required && <span className="ml-0.5 text-brand">*</span>}
    </p>
  );
}

export interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  badge?: number;
}

export function BottomNav({ items }: { items: NavItem[] }) {
  const path = usePathname();
  const active = [...items].sort((a, b) => b.href.length - a.href.length).find((i) => path === i.href || path.startsWith(i.href + "/"));
  return (
    <nav className="grid h-16 shrink-0 border-t bg-white" style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }}>
      {items.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          className={cn(
            "relative flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium",
            active?.href === i.href ? "text-brand" : "text-zinc-500",
          )}
        >
          {i.icon}
          {i.label}
          {!!i.badge && (
            <span className="absolute right-[calc(50%-20px)] top-2 grid min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] text-white">
              {i.badge}
            </span>
          )}
        </Link>
      ))}
    </nav>
  );
}

export function Section({ title, children, className }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200/70", className)}>
      {title && <h2 className="mb-3 text-sm font-semibold text-zinc-900">{title}</h2>}
      {children}
    </section>
  );
}

export const primaryButtonClass =
  "grid h-12 w-full place-items-center rounded-xl bg-brand text-sm font-semibold text-white shadow-sm transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50";

export function PrimaryButton({ className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={cn(primaryButtonClass, className)}
    />
  );
}

export function SecondaryButton({ className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={cn(
        "h-12 w-full rounded-xl border border-zinc-300 bg-white text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50 disabled:opacity-50",
        className,
      )}
    />
  );
}

export function QuickAction({ href, icon, label, badge }: { href: string; icon: ReactNode; label: string; badge?: number }) {
  return (
    <Link href={href} className="relative flex flex-col items-center gap-2 text-center">
      <span className="grid size-14 place-items-center rounded-full bg-red-50 text-brand">{icon}</span>
      <span className="text-xs font-medium leading-tight text-zinc-800">{label}</span>
      {!!badge && <span className="absolute right-2 top-0 grid min-w-5 place-items-center rounded-full bg-brand px-1 text-[10px] font-semibold text-white">{badge}</span>}
    </Link>
  );
}

export function SectionHead({ title, href, more = "View More" }: { title: string; href?: string; more?: string }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-lg text-zinc-900">{title}</h2>
      {href && (
        <Link href={href} className="inline-flex items-center gap-0.5 text-sm text-zinc-800">
          {more} <ChevronsRight className="size-4 text-brand" />
        </Link>
      )}
    </div>
  );
}
