"use client";
import { Plus, Trash2, UserRound, X } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { DEMO_BUYER } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Avatar } from "./brand";
import { Overlay } from "./overlay";

/** People the buyer has given access to a unit (an interior designer, a defect-check agent...), so they can report
 *  and follow defects on the buyer's behalf. Demo only: kept on this device, no invitation is sent. */
export interface Member {
  id: string;
  name: string;
  email: string;
  role: string;
  access: "submit" | "view";
  invitedAt: string;
}

export const MEMBER_ROLES = ["Interior designer", "Defect check agent", "Family member", "Tenant", "Contractor", "Other"];
const COLOURS = ["bg-sky-600", "bg-violet-600", "bg-amber-600", "bg-emerald-600", "bg-rose-600", "bg-indigo-600"];
const key = (unitId: string) => `simephony-members-${unitId}`;
const listeners = new Set<() => void>();
const cache = new Map<string, Member[]>();
const EMPTY: Member[] = [];

function read(unitId: string): Member[] {
  if (!cache.has(unitId)) {
    try {
      cache.set(unitId, JSON.parse(localStorage.getItem(key(unitId)) ?? "[]") as Member[]);
    } catch {
      cache.set(unitId, []);
    }
  }
  return cache.get(unitId) ?? EMPTY;
}

function write(unitId: string, members: Member[]) {
  cache.set(unitId, members);
  try {
    localStorage.setItem(key(unitId), JSON.stringify(members));
  } catch {}
  listeners.forEach((l) => l());
}

/** Members of a unit, shared by the report page, the case pages and the chat. */
export function useMembers(unitId: string): Member[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => read(unitId),
    () => EMPTY,
  );
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

export function MemberBubble({ m, i, className }: { m: Member; i: number; className?: string }) {
  return (
    <span className={cn("grid shrink-0 place-items-center rounded-full font-semibold text-white", COLOURS[i % COLOURS.length], className)}>{initials(m.name) || <UserRound className="size-5" />}</span>
  );
}

/** "Who can report for this unit": the owner plus members, Netflix-profile style, with an Add tile. */
export function CaseMembers({ unitId }: { unitId: string }) {
  const members = useMembers(unitId);
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<Member | null>(null);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold text-zinc-900">Shared Access</p>
        <p className="text-[11px] text-zinc-500">People who can report for Unit {unitId}</p>
      </div>
      <div className="no-scrollbar -mx-1 flex gap-3 overflow-x-auto px-1 pb-1 pt-1">
        <div className="flex w-16 shrink-0 flex-col items-center gap-1">
          <Avatar who="buyer" className="size-14 ring-2 ring-brand" />
          <span className="w-full truncate text-center text-[11px] font-medium text-zinc-800">{DEMO_BUYER.name.split(" ")[0]}</span>
          <span className="text-[10px] text-zinc-500">Owner</span>
        </div>
        {members.map((m, i) => (
          <button key={m.id} type="button" onClick={() => setSelected(m)} className="flex w-16 shrink-0 flex-col items-center gap-1">
            <MemberBubble m={m} i={i} className="size-14 text-lg" />
            <span className="w-full truncate text-center text-[11px] font-medium text-zinc-800">{m.name.split(" ")[0]}</span>
            <span className="w-full truncate text-center text-[10px] text-zinc-500">{m.role}</span>
          </button>
        ))}
        <button type="button" onClick={() => setAdding(true)} className="flex w-16 shrink-0 flex-col items-center gap-1">
          <span className="grid size-14 place-items-center rounded-full border-2 border-dashed border-zinc-300 text-zinc-500 hover:border-brand hover:text-brand">
            <Plus className="size-6" />
          </span>
          <span className="text-[11px] font-medium text-zinc-700">Add</span>
        </button>
      </div>
      {adding && (
        <AddMember
          onClose={() => setAdding(false)}
          onAdd={(m) => {
            write(unitId, [...members, m]);
            setAdding(false);
          }}
        />
      )}
      {selected && (
        <MemberSheet
          m={selected}
          onClose={() => setSelected(null)}
          onRemove={() => {
            write(
              unitId,
              members.filter((x) => x.id !== selected.id),
            );
            setSelected(null);
          }}
        />
      )}
    </div>
  );
}

const field = "h-10 w-full rounded-xl border border-zinc-300 px-3 text-sm outline-none focus:border-brand";

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <Overlay label={title} onClick={onClose} className="flex items-end bg-black/40">
      <div onClick={(e) => e.stopPropagation()} className="w-full rounded-t-2xl bg-white p-4 pb-6 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">{title}</h2>
          <button type="button" onClick={onClose} className="grid size-8 place-items-center rounded-full hover:bg-zinc-100" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>
        {children}
      </div>
    </Overlay>
  );
}

function AddMember({ onAdd, onClose }: { onAdd: (m: Member) => void; onClose: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState(MEMBER_ROLES[0]);
  const [access, setAccess] = useState<Member["access"]>("submit");
  const ok = name.trim() && /^\S+@\S+\.\S+$/.test(email.trim());

  return (
    <Sheet title="Add a Member" onClose={onClose}>
      <p className="mb-3 text-xs text-zinc-500">Give someone helping you, such as an interior designer or a defect check agent, access to report and follow defects for this unit.</p>
      <div className="space-y-3">
        <label className="block text-xs font-medium text-zinc-600">
          Name <span className="text-brand">*</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Anna Lim" className={cn(field, "mt-1")} />
        </label>
        <label className="block text-xs font-medium text-zinc-600">
          Email <span className="text-brand">*</span>
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="name@example.com" className={cn(field, "mt-1")} />
        </label>
        <div>
          <p className="text-xs font-medium text-zinc-600">Role</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {MEMBER_ROLES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRole(r)}
                className={cn("rounded-full px-3 py-1.5 text-xs font-medium ring-1", role === r ? "bg-brand text-white ring-brand" : "bg-white text-zinc-700 ring-zinc-200")}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs font-medium text-zinc-600">Access</p>
          <div className="mt-1 grid grid-cols-2 gap-2">
            {(
              [
                ["submit", "Can submit defects"],
                ["view", "View only"],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                onClick={() => setAccess(v)}
                className={cn("h-10 rounded-xl text-xs font-semibold ring-1", access === v ? "bg-red-50 text-brand ring-brand" : "bg-white text-zinc-700 ring-zinc-200")}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <button
        type="button"
        disabled={!ok}
        onClick={() => onAdd({ id: `${Date.now()}`, name: name.trim(), email: email.trim(), role, access, invitedAt: new Date().toISOString() })}
        className="mt-4 h-12 w-full rounded-xl bg-brand text-sm font-semibold text-white disabled:opacity-50"
      >
        Send Invite
      </button>
      <p className="mt-2 text-center text-[11px] text-zinc-400">Demo: the member is saved on this device; no email is sent.</p>
    </Sheet>
  );
}

function MemberSheet({ m, onRemove, onClose }: { m: Member; onRemove: () => void; onClose: () => void }) {
  return (
    <Sheet title={m.name} onClose={onClose}>
      <dl className="space-y-2 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-zinc-500">Role</dt>
          <dd className="font-medium">{m.role}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-zinc-500">Email</dt>
          <dd className="truncate font-medium">{m.email}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-zinc-500">Access</dt>
          <dd className="font-medium">{m.access === "submit" ? "Can submit defects" : "View only"}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-zinc-500">Status</dt>
          <dd className="font-medium text-amber-700">Invited</dd>
        </div>
      </dl>
      <button type="button" onClick={onRemove} className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold text-brand ring-1 ring-brand/40">
        <Trash2 className="size-4" /> Remove Access
      </button>
    </Sheet>
  );
}
