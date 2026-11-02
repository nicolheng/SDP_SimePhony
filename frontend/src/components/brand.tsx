import { Building2, UserRound } from "lucide-react";
import type { Technician } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Sime Darby Property logo (public/brand/sdp-logo.png). */
export function BrandMark({ className, size = "md" }: { className?: string; size?: "sm" | "md" | "lg" }) {
  const box = { sm: "size-9", md: "size-12", lg: "size-20" }[size];
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/brand/sdp-logo.png" alt="Sime Darby Property" className={cn("shrink-0 object-contain", box, className)} />
  );
}

const AVATARS = {
  buyer: { src: "/avatars/buyer.png", fit: "object-cover object-[50%_25%] scale-150" },
  technician: { src: "/avatars/technician.png", fit: "object-cover object-top" },
} as const;

/** Round profile picture for the demo buyer / technician. */
export function Avatar({ who, className }: { who: keyof typeof AVATARS; className?: string }) {
  const a = AVATARS[who];
  return (
    <span className={cn("block overflow-hidden rounded-full bg-white", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={a.src} alt={`${who} profile picture`} className={cn("size-full", a.fit)} />
    </span>
  );
}

/** Only the technician named Olaf has a profile picture; everyone else keeps the plain icon. */
export const hasTechPhoto = (t: Pick<Technician, "name">) => t.name.trim().toLowerCase() === "olaf";

export function TechAvatar({ tech, className, iconClassName }: { tech: Pick<Technician, "name" | "kind">; className?: string; iconClassName?: string }) {
  if (hasTechPhoto(tech)) return <Avatar who="technician" className={className} />;
  const Icon = tech.kind === "subcontractor" ? Building2 : UserRound;
  return (
    <span className={cn("grid place-items-center rounded-full bg-zinc-300 text-zinc-500", className)}>
      <Icon className={iconClassName} />
    </span>
  );
}

export function AppName({ className }: { className?: string }) {
  return (
    <span className={cn("font-semibold tracking-tight", className)}>
      Sime<span className="text-brand">Phony</span>
    </span>
  );
}
