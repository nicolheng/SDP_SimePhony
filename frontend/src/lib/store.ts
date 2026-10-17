"use client";
// Mock data store: localStorage-backed, synced across tabs so the buyer phone view and the
// SDP dashboard can run side by side. Swap lib/api.ts for FastAPI calls when the backend lands.
import { useSyncExternalStore } from "react";
import { buildSeed } from "./seed";
import type { DemoState } from "./types";

const KEY = "simephony-demo-v1";

let seed: DemoState | null = null;
const getSeed = () => (seed ??= buildSeed());

let state: DemoState | null = null;
const listeners = new Set<() => void>();

function load(): DemoState {
  if (typeof window === "undefined") return getSeed();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DemoState;
      if (parsed.version === getSeed().version) return parsed;
    }
  } catch {}
  return getSeed();
}

export function getState(): DemoState {
  return (state ??= load());
}

function emit() {
  listeners.forEach((l) => l());
}

export function setState(next: DemoState) {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Quota exceeded (large photos): keep going in memory.
  }
  emit();
}

export function update(fn: (draft: DemoState) => void) {
  const draft = structuredClone(getState());
  fn(draft);
  setState(draft);
}

export function resetState() {
  seed = null;
  setState(structuredClone(getSeed()));
}

function subscribe(l: () => void) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    state = null;
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
    () => select(getSeed()),
  );
}
