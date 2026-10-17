"use client";
import { Bell, ClipboardList, Home, PlusCircle } from "lucide-react";
import { useMemo } from "react";
import { BottomNav } from "@/components/mobile";
import { DEMO_BUYER } from "@/lib/constants";
import { buyerNeedsAction } from "@/lib/status";
import { useDemo } from "@/lib/store";


export function BuyerNav() {
  const cases = useDemo((s) => s.cases);
  const action = useMemo(() => cases.filter((c) => c.buyerId === DEMO_BUYER.id && buyerNeedsAction(c)).length, [cases]);
  return (
    <BottomNav
      items={[
        { href: "/buyer", label: "Home", icon: <Home className="size-5" /> },
        { href: "/buyer/report", label: "Report", icon: <PlusCircle className="size-5" /> },
        { href: "/buyer/cases", label: "My defects", icon: <ClipboardList className="size-5" />, badge: action },
        { href: "/buyer/inbox", label: "Inbox", icon: <Bell className="size-5" /> },
      ]}
    />
  );
}
