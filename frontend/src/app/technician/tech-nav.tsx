"use client";
import { CheckCheck, Wrench } from "lucide-react";
import { BottomNav } from "@/components/mobile";

export function TechNav() {
  return (
    <BottomNav
      items={[
        { href: "/technician", label: "Jobs", icon: <Wrench className="size-5" /> },
        { href: "/technician/done", label: "Completed", icon: <CheckCheck className="size-5" /> },
      ]}
    />
  );
}
