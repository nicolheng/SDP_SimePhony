"use client";
// Demo data store: starts from data/seed.db (via /api/seed), falls back to the built-in seed if the
// database can't be read. Changes during the demo stay in the browser (localStorage), synced across
// tabs so the buyer phone view and the SDP dashboard can run side by side.
import { useSyncExternalStore } from "react";
import { buildSeed } from "./seed";
import type { DemoState } from "./types";

const KEY = "simephony-demo-v1";
const VERSION = 4;

let fallback: DemoState | null = null;
const getFallback = () => (fallback ??= buildSeed());

let state: DemoState | null = null;
const listeners = new Set<() => void>();

export type LoadStatus = "loading" | "ready";
let status: LoadStatus = "loading";
let seedError: string | null = null;
let loadStarted = false;

function emit() {
  listeners.forEach((l) => l());
}

/** Fetch the starting data from seed.db; on failure use the built-in seed and remember why. */
async function fetchSeed(): Promise<DemoState> {
  try {
    const res = await fetch("/api/seed", { cache: "no-store" });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
    seedError = null;
    return body as DemoState;
  } catch (err) {
    seedError = err instanceof Error ? err.message : String(err);
    console.warn("[SimePhony] Using built-in demo data:", seedError);
    return structuredClone(getFallback());
  }
}

function readSaved(): DemoState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DemoState;
    return parsed.version === VERSION ? parsed : null;
  } catch {
    return null;
  }
}

/** Client only: use saved progress if any, otherwise load seed.db once. */
function ensureLoaded() {
  if (loadStarted || typeof window === "undefined") return;
  loadStarted = true;
  const saved = readSaved();
  if (saved) {
    state = saved;
    status = "ready";
    emit();
    return;
  }
  void fetchSeed().then((s) => {
    status = "ready";
    setState(s);
  });
}

export function getState(): DemoState {
  return state ?? getFallback();
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;

/** Persist after the UI has updated; several quick updates (agent steps) share one write. */
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      // Quota exceeded (large photos): keep going in memory.
    }
  }, 150);
}

export function setState(next: DemoState) {
  state = next;
  emit();
  persist();
}

export function update(fn: (draft: DemoState) => void) {
  const draft = structuredClone(getState());
  fn(draft);
  setState(draft);
}

/** Reset demo: reload seed.db (or the built-in seed if it can't be read). */
export async function resetState() {
  fallback = null;
  setState(await fetchSeed());
  return { source: getState().source, error: seedError };
}

function subscribe(l: () => void) {
  listeners.add(l);
  ensureLoaded();
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    state = readSaved();
    emit();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", onStorage);
  };
}

/** `select` must return a stored reference or a primitive (no .filter/.map) — derive with useMemo. */
export function useDemo<T>(select: (s: DemoState) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => select(getState()),
    () => select(getFallback()),
  );
}

/** "loading" until the first seed.db fetch (or saved progress) is in. */
export function useLoadStatus(): LoadStatus {
  return useSyncExternalStore(
    subscribe,
    () => status,
    () => "loading",
  );
}

/** Why seed.db couldn't be used (null when it loaded fine). */
export function useSeedError(): string | null {
  return useSyncExternalStore(
    subscribe,
    () => seedError,
    () => null,
  );
}
