"use client";
import { ArrowLeft, ArrowLeftRight } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Phone-sized frame: full screen on phones, a device mock-up on desktop. */
export function MobileFrame({ role, nav, children }: { role: string; nav: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-1 flex-col items-center bg-zinc-200 md:py-6">
      <div className="hidden w-full max-w-[420px] items-center justify-between px-2 pb-3 text-sm text-zinc-600 md:flex">
        <Link href="/" className="inline-flex items-center gap-1.5 hover:text-brand">
          <ArrowLeftRight className="size-4" /> Switch role
        </Link>
        <span>{role} view (mobile)</span>
      </div>
      <div className="relative flex h-dvh w-full max-w-[420px] flex-col overflow-hidden bg-zinc-50 md:h-[860px] md:rounded-[2.5rem] md:border-[10px] md:border-zinc-900 md:shadow-2xl">
        <div className="flex-1 overflow-y-auto">{children}</div>
        <Suspense fallback={<div className="h-16 border-t bg-white" />}>{nav}</Suspense>
      </div>
    </div>
  );
}

export function MobileHeader({ title, back, right, dark = true }: { title: string; back?: string; right?: ReactNode; dark?: boolean }) {
  return (
    <header
      className={cn(
        "sticky top-0 z-10 flex h-14 items-center gap-2 px-3",
        dark ? "bg-ink text-white" : "border-b bg-white text-zinc-900",
      )}
    >
      {back ? (
        <Link href={back} className="grid size-9 place-items-center rounded-full hover:bg-white/10" aria-label="Back">
          <ArrowLeft className="size-5" />
        </Link>
      ) : (
        <span className="size-9" />
      )}
      <h1 className="flex-1 truncate text-center text-base font-semibold">{title}</h1>
      <div className="flex size-9 items-center justify-end">{right}</div>
    </header>
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
