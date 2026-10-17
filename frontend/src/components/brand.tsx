import { cn } from "@/lib/utils";

/** Text wordmark in the style of the Sime Darby Property app (not the official logo artwork). */
export function BrandMark({ className, size = "md" }: { className?: string; size?: "sm" | "md" | "lg" }) {
  const box = { sm: "size-9 text-[7px]", md: "size-12 text-[9px]", lg: "size-20 text-[14px]" }[size];
  return (
    <div className={cn("grid place-items-center rounded-xl bg-brand font-bold leading-[1.05] text-white shadow-sm", box, className)}>
      <span className="text-center">
        Sime
        <br />
        Darby
        <br />
        Property
      </span>
    </div>
  );
}

export function AppName({ className }: { className?: string }) {
  return (
    <span className={cn("font-semibold tracking-tight", className)}>
      Sime<span className="text-brand">Phony</span>
    </span>
  );
}
