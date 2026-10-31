"use client";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

/** Set on MobileFrame's screen, so pop-ups in the buyer/technician apps stay inside the phone. */
export const PHONE_SCREEN_ID = "phone-screen";

/** Full-screen layer for dialogs: covers the phone screen when there is one, otherwise the browser window. */
export function Overlay({ children, className, onClick, label }: { children: ReactNode; className?: string; onClick?: () => void; label?: string }) {
  const phone = document.getElementById(PHONE_SCREEN_ID);
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={label} onClick={onClick} className={cn(phone ? "absolute" : "fixed", "inset-0 z-[100]", className)}>
      {children}
    </div>,
    phone ?? document.body,
  );
}
