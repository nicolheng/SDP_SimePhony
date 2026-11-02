import { PROJECT_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";

/** Residensi Harmoni project photo (public/brand/residensi-harmoni.jpg). */
export function BuildingBanner({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/brand/residensi-harmoni.jpg" alt={PROJECT_NAME} className={cn("block h-full w-full object-cover object-[50%_35%]", className)} />
  );
}
