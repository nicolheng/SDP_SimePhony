import { Building2, ChevronRight, HardHat, Smartphone } from "lucide-react";
import Link from "next/link";
import { AppName, BrandMark } from "@/components/brand";
import { ResetDemoButton } from "@/components/demo-controls";

const ROLES = [
  {
    href: "/buyer",
    title: "Buyer",
    who: "Aisyah Rahman · Unit A-12-08",
    desc: "Report a defect with a photo, book visits, verify repairs, reopen if it comes back.",
    icon: Smartphone,
    device: "Mobile",
  },
  {
    href: "/technician",
    title: "Technician",
    who: "Field team",
    desc: "Today's jobs, valid/invalid verdicts, mark repaired, read AI inspection briefs.",
    icon: HardHat,
    device: "Mobile",
  },
  {
    href: "/sdp",
    title: "Sime Darby Property staff",
    who: "Defect management team",
    desc: "KPIs, defect list, recurring-problem analytics, stack heatmap, approve extra inspections.",
    icon: Building2,
    device: "Dashboard",
  },
];

export default function Home() {
  return (
    <main className="flex min-h-dvh flex-1 flex-col bg-zinc-50">
      <section className="relative overflow-hidden bg-gradient-to-br from-brand to-brand-dark px-6 pb-24 pt-10 text-white">
        <div className="mx-auto flex max-w-5xl items-center gap-4">
          <BrandMark className="bg-white text-brand" />
          <div>
            <AppName className="text-2xl text-white [&>span]:text-white/80" />
            <p className="text-sm text-white/80">Defect management, powered by AI agents</p>
          </div>
        </div>
        <div className="mx-auto mt-10 max-w-5xl">
          <h1 className="max-w-xl text-3xl font-semibold leading-tight sm:text-4xl">
            Don&apos;t just close the ticket.
            <br />
            Close the problem.
          </h1>
          <p className="mt-3 max-w-xl text-white/85">Choose a role to open its view. Open two roles in separate tabs to see them update each other live.</p>
        </div>
      </section>

      <section className="mx-auto -mt-16 grid w-full max-w-5xl gap-4 px-6 sm:grid-cols-3">
        {ROLES.map((r) => (
          <Link
            key={r.href}
            href={r.href}
            className="group flex flex-col rounded-2xl bg-white p-5 shadow-lg ring-1 ring-zinc-200 transition hover:-translate-y-0.5 hover:ring-brand"
          >
            <div className="flex items-center justify-between">
              <span className="grid size-11 place-items-center rounded-xl bg-brand/10 text-brand">
                <r.icon className="size-5" />
              </span>
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600">{r.device}</span>
            </div>
            <h2 className="mt-4 text-lg font-semibold">{r.title}</h2>
            <p className="text-xs text-zinc-500">{r.who}</p>
            <p className="mt-2 flex-1 text-sm text-zinc-600">{r.desc}</p>
            <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand">
              Continue <ChevronRight className="size-4 transition group-hover:translate-x-0.5" />
            </span>
          </Link>
        ))}
      </section>

      <footer className="mx-auto mt-auto flex w-full max-w-5xl items-center justify-between px-6 py-8 text-xs text-zinc-500">
        <span>Demo build · mock data (no backend yet)</span>
        <ResetDemoButton />
      </footer>
    </main>
  );
}
