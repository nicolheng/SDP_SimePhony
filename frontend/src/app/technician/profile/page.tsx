"use client";
import { ArrowLeft, Building2, Check, UserRound } from "lucide-react";
import Link from "next/link";
import { hasTechPhoto, TechAvatar } from "@/components/brand";
import { toast } from "sonner";
import { SUBCONTRACTORS, TECHNICIANS } from "@/lib/constants";
import { setTechnicianId } from "@/lib/session";
import { useDemo } from "@/lib/store";
import type { Technician } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useMyJobs } from "../use-my-jobs";

export default function TechnicianProfile() {
  const { tech } = useMyJobs();
  // Read after every state update so the list follows the technicians table.
  useDemo((s) => s.workers);
  const groups: { title: string; note: string; people: Technician[] }[] = [
    { title: "In-House Technicians", note: "Inspection visits and minor repairs", people: TECHNICIANS },
    { title: "Subcontractors", note: "Specialised repairs under contract; join extra inspections", people: SUBCONTRACTORS },
  ];

  return (
    <div>
      <header className="relative flex flex-col items-center rounded-b-[2rem] bg-ink px-4 pb-8 pt-6 text-white">
        <Link
          href="/technician"
          className="absolute left-4 top-6 grid size-9 place-items-center rounded-full hover:bg-white/10"
          aria-label="Back"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <TechAvatar
          tech={tech}
          className="size-24 ring-4 ring-white/80"
          iconClassName={tech.kind === "subcontractor" ? "size-12" : "size-14"}
        />
        <p className="mt-4 text-2xl font-semibold">{tech.name}</p>

      </header>
      <div className="px-5 py-4">
        {groups.map((g) => (
          <section key={g.title} className="mb-3">
            <h2 className="border-b border-zinc-200 pb-2 pt-3 text-sm text-zinc-500">
              {g.title}
              <span className="block text-xs text-zinc-400">{g.note}</span>
            </h2>
            <ul className="divide-y divide-zinc-100">
              {g.people.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setTechnicianId(t.id);
                      toast.success(`Now viewing ${t.name}'s jobs`);
                    }}
                    className="flex w-full items-center gap-3 py-3 text-left"
                  >
                    {t.id !== tech.id && hasTechPhoto(t) ? (
                      <TechAvatar
                        tech={t}
                        className="size-9 ring-1 ring-zinc-200"
                      />
                    ) : (
                      <span
                        className={cn(
                          "grid size-9 place-items-center rounded-full",
                          t.id === tech.id
                            ? "bg-brand text-white"
                            : "bg-zinc-100 text-zinc-500",
                        )}
                      >
                        {t.id === tech.id ? (
                          <Check className="size-4" />
                        ) : t.kind === "subcontractor" ? (
                          <Building2 className="size-4" />
                        ) : (
                          <UserRound className="size-4" />
                        )}
                      </span>
                    )}
                    <span className="flex-1 text-[15px]">{t.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
