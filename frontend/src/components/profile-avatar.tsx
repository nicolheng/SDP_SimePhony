import type { ReactNode } from "react";

// Profile pictures for the demo accounts (buyer B-0118, technician T-01); everyone else keeps the icon.
const AVATARS: Record<string, string> = {
  "B-0118": "/avatars/elsa.png",
  "T-01": "/avatars/olaf.png",
};

/** The person's picture if they have one, otherwise `fallback` (an icon). Fills the round box the caller draws. */
export function ProfileAvatar({ id, fallback }: { id?: string; fallback: ReactNode }) {
  const src = id ? AVATARS[id] : undefined;
  // eslint-disable-next-line @next/next/no-img-element -- tiny local images inside a fixed-size circle
  return src ? <img src={src} alt="" className="size-full rounded-full object-cover" /> : <>{fallback}</>;
}
