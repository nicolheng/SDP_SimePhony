"use client";
import { Bell, ClipboardList, Home, UserRound } from "lucide-react";
import { useMemo } from "react";
import { BottomNav } from "@/components/mobile";
import { TECH_TODO } from "@/lib/status";
import { useMyJobs } from "./use-my-jobs";

export function TechNav() {
  const { jobs } = useMyJobs();
  const todo = useMemo(() => jobs.filter((c) => TECH_TODO.includes(c.status)).length, [jobs]);
  return (
    <BottomNav
      items={[
        { href: "/technician", label: "Home", icon: <Home className="size-5" /> },
        { href: "/technician/jobs", label: "My Jobs", icon: <ClipboardList className="size-5" />, badge: todo },
        { href: "/technician/inbox", label: "Inbox", icon: <Bell className="size-5" /> },
        { href: "/technician/profile", label: "Profile", icon: <UserRound className="size-5" /> },
      ]}
    />
  );
}
