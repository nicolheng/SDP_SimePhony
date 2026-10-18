"use client";
import { ArrowLeft, Check, UserRound } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { TECHNICIANS } from "@/lib/constants";
import { setTechnicianId } from "@/lib/session";
import { cn } from "@/lib/utils";
import { useMyJobs } from "../use-my-jobs";

export default function TechnicianProfile() {
  const { tech, jobs } = useMyJobs();
  const live = jobs.filter((c) => !c.historical).length;

  return (
    <div>
      <header className="relative flex flex-col items-center rounded-b-[2rem] bg-ink px-4 pb-8 pt-6 text-white">
        <Link href="/technician" className="absolute left-4 top-6 grid size-9 place-items-center rounded-full hover:bg-white/10" aria-label="Back">
          <ArrowLeft className="size-5" />
        </Link>
        <span className="grid size-24 place-items-center rounded-full bg-zinc-300 text-zinc-500">
          <UserRound className="size-14" />
        </span>
        <p className="mt-4 text-2xl font-semibold">{tech.name}</p>
        <p className="mt-1 text-sm capitalize text-zinc-400">{tech.skills.join(" · ")}</p>
        <p className="text-xs text-zinc-500">
          Blocks {tech.blocks.join(", ")} · {live} active job(s)
        </p>
      </header>
      <div className="px-5 py-4">
        <h2 className="border-b border-zinc-200 pb-3 pt-2 text-sm text-zinc-500">Signed in as (demo)</h2>
        <ul>
          {TECHNICIANS.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => {
                  setTechnicianId(t.id);
                  toast.success(`Now viewing ${t.name}'s jobs`);
                }}
                className="flex w-full items-center gap-3 py-3 text-left"
              >
                <span className={cn("grid size-9 place-items-center rounded-full", t.id === tech.id ? "bg-brand text-white" : "bg-zinc-100 text-zinc-500")}>
                  {t.id === tech.id ? <Check className="size-4" /> : <UserRound className="size-4" />}
                </span>
                <span className="flex-1">
                  <span className="block text-[15px]">{t.name}</span>
                  <span className="text-xs capitalize text-zinc-500">
                    {t.skills.join(", ")} · Blocks {t.blocks.join(", ")}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
