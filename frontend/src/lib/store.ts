"use client";
// App state comes from the FastAPI backend (data/simephony.db). Every action returns the fresh state; the store also
// refreshes every few seconds so other open roles/tabs see changes. If the API can't be reached, the built-in demo
// data is shown read-only so the screens still render.
import { useSyncExternalStore } from "react";
import { applyReference } from "./constants";
import { buildSeed } from "./seed";
import type { DemoState } from "./types";

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8001").replace(/\/$/, "");
const POLL_MS = 3000;

let fallback: DemoState | null = null;
const getFallback = () => (fallback ??= buildSeed());

let state: DemoState | null = null;
const listeners = new Set<() => void>();

export type LoadStatus = "loading" | "ready";
let status: LoadStatus = "loading";
let apiError: string | null = null;
let started = false;

function emit() {
  listeners.forEach((l) => l());
}

export function getState(): DemoState {
  return state ?? getFallback();
}

export function setState(next: DemoState) {
  applyReference(next.reference, next.workers);
  state = next;
  apiError = null;
  status = "ready";
  emit();
}

/** Call the API; JSON errors come back as Error(detail). */
export async function apiFetch<T = { state: DemoState }>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  } catch {
    throw new Error(`Can't reach the backend at ${API_URL}. Start it with: cd backend; uvicorn main:app --port 8001`);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof body.detail === "string" ? body.detail : `Request failed (${res.status})`);
  return body as T;
}

// Other tabs and frames (e.g. the side-by-side /demo page) get the new state straight away instead of on their next poll.
let channel: BroadcastChannel | null = null;

/** POST an action and adopt the state the backend returns. */
export async function apiAction<T extends object = object>(path: string, payload?: unknown): Promise<T & { state: DemoState }> {
  const r = await apiFetch<T & { state: DemoState }>(path, { method: "POST", body: payload === undefined ? undefined : JSON.stringify(payload) });
  setState(r.state);
  channel?.postMessage(r.state);
  return r;
}

let inFlight = false;
export async function refresh() {
  if (inFlight) return;
  inFlight = true;
  try {
    setState((await apiFetch("/api/state")).state);
  } catch (err) {
    apiError = err instanceof Error ? err.message : String(err);
    if (status === "loading") {
      console.warn("[SimePhony] Showing built-in demo data:", apiError);
      status = "ready";
    }
    emit();
  } finally {
    inFlight = false;
  }
}

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  if ("BroadcastChannel" in window) {
    channel = new BroadcastChannel("simephony-state");
    channel.onmessage = (e: MessageEvent<DemoState>) => setState(e.data);
  }
  void refresh();
  setInterval(() => {
    if (document.visibilityState === "visible") void refresh();
  }, POLL_MS);
  window.addEventListener("focus", () => void refresh());
}

function subscribe(l: () => void) {
  listeners.add(l);
  start();
  return () => {
    listeners.delete(l);
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

/** "loading" until the first response from the API (or the fallback after it fails). */
export function useLoadStatus(): LoadStatus {
  return useSyncExternalStore(subscribe, () => status, () => "loading");
}

/** Why the API couldn't be used (null while connected). */
export function useApiError(): string | null {
  return useSyncExternalStore(subscribe, () => apiError, () => null);
}
