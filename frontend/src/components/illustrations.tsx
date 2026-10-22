import { PROJECT_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";

/** Project photo (Serenia City) shown on the buyer home and report screens. */
export function BuildingBanner({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- small local banner; fills whatever box the caller gives it
    <img src="/serenia-city.jpg" alt={PROJECT_NAME} className={cn("block h-full w-full object-cover", className)} />
  );
}
