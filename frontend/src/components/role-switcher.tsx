"use client";
import { ChevronDown, Users } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

const ROLES = [
  { href: "/sdp", label: "Sime Darby Property staff" },
  { href: "/buyer", label: "Buyer" },
  { href: "/technician", label: "Technician" },
];

/** Demo role picker shown on every view. */
export function RoleSwitcher({ dark, className }: { dark?: boolean; className?: string }) {
  const path = usePathname();
  const router = useRouter();
  const current = ROLES.find((r) => path.startsWith(r.href))?.href ?? "/sdp";
  return (
    <label className={cn("relative inline-flex items-center", className)}>
      <Users className={cn("pointer-events-none absolute left-2.5 size-3.5", dark ? "text-zinc-400" : "text-zinc-500")} />
      <select
        value={current}
        onChange={(e) => router.push(e.target.value)}
        aria-label="Switch role"
        className={cn(
          "h-8 w-full appearance-none rounded-lg pl-8 pr-8 text-xs font-medium outline-none",
          dark ? "bg-white/10 text-white ring-1 ring-white/15 [&>option]:text-zinc-900" : "bg-white text-zinc-800 ring-1 ring-zinc-300",
        )}
      >
        {ROLES.map((r) => (
          <option key={r.href} value={r.href}>
            {r.label}
          </option>
        ))}
      </select>
      <ChevronDown className={cn("pointer-events-none absolute right-2.5 size-3.5", dark ? "text-zinc-400" : "text-zinc-500")} />
    </label>
  );
}
