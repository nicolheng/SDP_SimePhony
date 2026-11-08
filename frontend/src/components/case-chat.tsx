"use client";
import { ArrowLeft, Building2, Send } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { DEMO_BUYER, getTechnician } from "@/lib/constants";
import { fmtDateTime } from "@/lib/dates";
import { useDemo } from "@/lib/store";
import type { Case } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Avatar, TechAvatar } from "./brand";
import { MemberBubble, useMembers } from "./case-members";
import { Overlay } from "./overlay";

/** Case chat for everyone involved: buyer, technician, SDP staff and the buyer's members.
 *  UI demo only: the opening messages come from the case, and messages you send stay on this device. */
type Who = "buyer" | "technician" | "sdp" | `member:${string}`;
interface Msg {
  id: string;
  who: Who;
  text: string;
  at: string;
}

const key = (caseId: string) => `simephony-chat-${caseId}`;
const listeners = new Set<() => void>();
const cache = new Map<string, Msg[]>();
const EMPTY: Msg[] = [];

function read(caseId: string): Msg[] {
  if (!cache.has(caseId)) {
    try {
      cache.set(caseId, JSON.parse(localStorage.getItem(key(caseId)) ?? "[]") as Msg[]);
    } catch {
      cache.set(caseId, []);
    }
  }
  return cache.get(caseId) ?? EMPTY;
}

function append(caseId: string, msg: Msg) {
  const next = [...read(caseId), msg];
  cache.set(caseId, next);
  try {
    localStorage.setItem(key(caseId), JSON.stringify(next));
  } catch {}
  listeners.forEach((l) => l());
}

function useSent(caseId: string) {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => read(caseId),
    () => EMPTY,
  );
}

/** Opening messages built from what the case already says, so the thread is never empty. */
function opening(c: Case): Msg[] {
  const tech = getTechnician(c.technicianId);
  const msgs: Msg[] = c.description
    .split("\n")
    .map((t) => t.trim())
    .filter(Boolean)
    .map((text, i) => ({ id: `d${i}`, who: "buyer" as const, text, at: c.createdAt }));
  msgs.push({
    id: "sdp",
    who: "sdp",
    text: `Thanks for reporting ${c.id}. Everyone working on this defect can talk here.`,
    at: c.createdAt,
  });
  if (tech && c.visitSlot)
    msgs.push({ id: "tech", who: "technician", text: `Hi, I'm ${tech.name}. See you at the inspection visit on ${fmtDateTime(c.visitSlot)}.`, at: c.createdAt });
  return msgs;
}

export function CaseChat({ c, viewer, onClose }: { c: Case; viewer: "buyer" | "technician"; onClose: () => void }) {
  const now = useDemo((s) => s.now);
  const members = useMembers(c.unitId);
  const sent = useSent(c.id);
  const [text, setText] = useState("");
  const tech = getTechnician(c.technicianId);
  const msgs = [...opening(c), ...sent];
  // Newest message in view, like a messaging app.
  const list = useRef<HTMLUListElement>(null);
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [msgs.length]);

  const name = (w: Who) =>
    w === "buyer" ? DEMO_BUYER.name : w === "technician" ? (tech?.name ?? "Technician") : w === "sdp" ? "SDP Defect Team" : (members.find((m) => `member:${m.id}` === w)?.name ?? "Member");
  const avatar = (w: Who) => {
    if (w === "buyer") return <Avatar who="buyer" className="size-8" />;
    if (w === "technician" && tech) return <TechAvatar tech={tech} className="size-8" iconClassName="size-4" />;
    if (w === "sdp")
      return (
        <span className="grid size-8 place-items-center rounded-full bg-brand text-white">
          <Building2 className="size-4" />
        </span>
      );
    const i = members.findIndex((m) => `member:${m.id}` === w);
    return i >= 0 ? <MemberBubble m={members[i]} i={i} className="size-8 text-xs" /> : <span className="size-8 rounded-full bg-zinc-300" />;
  };

  function send() {
    if (!text.trim()) return;
    append(c.id, { id: `${Date.now()}`, who: viewer, text: text.trim(), at: now });
    setText("");
  }

  return (
    // Covers the whole phone screen, like a messaging app; the back arrow returns to the case.
    <Overlay label={`Chat for ${c.id}`} className="flex flex-col bg-white">
      <header className="flex shrink-0 items-center gap-3 bg-ink px-3 pb-3 pt-4 text-white">
        <button type="button" onClick={onClose} className="grid size-9 shrink-0 place-items-center rounded-full hover:bg-white/10" aria-label="Back to case">
          <ArrowLeft className="size-5" />
        </button>
        <div className="flex -space-x-2">
          <span className="rounded-full ring-2 ring-ink">{avatar("buyer")}</span>
          {tech && <span className="rounded-full ring-2 ring-ink">{avatar("technician")}</span>}
          <span className="rounded-full ring-2 ring-ink">{avatar("sdp")}</span>
          {members.slice(0, 3).map((m) => (
            <span key={m.id} className="rounded-full ring-2 ring-ink">
              {avatar(`member:${m.id}`)}
            </span>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">Chat · {c.id}</p>
          <p className="truncate text-[11px] text-zinc-400">
            {[DEMO_BUYER.name.split(" ")[0], tech?.name.split(" ")[0], "SDP Defect Team", ...members.map((m) => m.name.split(" ")[0])].filter(Boolean).join(", ")}
          </p>
        </div>
      </header>

      <ul ref={list} className="no-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto bg-zinc-50 px-4 py-4">
        {msgs.map((m) => {
          const mine = m.who === viewer;
          return (
            <li key={m.id} className={cn("flex items-end gap-2", mine && "flex-row-reverse")}>
              {avatar(m.who)}
              <div className={cn("max-w-[75%]", mine && "text-right")}>
                <p className="mb-0.5 text-[10px] text-zinc-500">
                  {mine ? "You" : name(m.who)} · {fmtDateTime(m.at)}
                </p>
                <p className={cn("inline-block rounded-2xl px-3 py-2 text-left text-sm", mine ? "rounded-br-sm bg-brand text-white" : "rounded-bl-sm bg-white text-zinc-800 ring-1 ring-zinc-200")}>{m.text}</p>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="shrink-0 border-t border-zinc-100 bg-white px-3 pb-2 pt-3">
        <div className="flex items-center gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Write a message…"
            className="h-10 min-w-0 flex-1 rounded-full border border-zinc-300 px-4 text-sm outline-none focus:border-brand"
          />
          <button type="button" onClick={send} disabled={!text.trim()} aria-label="Send" className="grid size-10 shrink-0 place-items-center rounded-full bg-brand text-white disabled:opacity-40">
            <Send className="size-4" />
          </button>
        </div>
        <p className="pt-1.5 text-center text-[10px] text-zinc-400">Demo chat: messages stay on this device.</p>
      </div>
    </Overlay>
  );
}
