"use client";
// Which technician is "signed in" on this device (demo only; no real login).
import { useSyncExternalStore } from "react";
import { TECHNICIANS } from "./constants";

const KEY = "simephony-technician";
const DEFAULT = TECHNICIANS[0].id;
const listeners = new Set<() => void>();

function read() {
  try {
    const v = localStorage.getItem(KEY);
    if (v && TECHNICIANS.some((t) => t.id === v)) return v;
  } catch {}
  return DEFAULT;
}

export function setTechnicianId(id: string) {
  try {
    localStorage.setItem(KEY, id);
  } catch {}
  listeners.forEach((l) => l());
}

export function useTechnicianId() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    read,
    () => DEFAULT,
  );
}
