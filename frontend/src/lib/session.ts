"use client";
// Which technician is "signed in" on this device (demo only; no real login).
import { useSyncExternalStore } from "react";
import { buyerUnits, DEMO_BUYER, TECHNICIANS, WORKERS } from "./constants";

const KEY = "simephony-technician";
const DEFAULT = TECHNICIANS[0].id;
const listeners = new Set<() => void>();

function read() {
  try {
    const v = localStorage.getItem(KEY);
    if (v && WORKERS.some((t) => t.id === v)) return v;
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

// Which of the buyer's registered units (assets) is selected on this device (home card and Submit Defect).
const UNIT_KEY = "simephony-buyer-unit";
const unitListeners = new Set<() => void>();

function readUnit() {
  try {
    const v = localStorage.getItem(UNIT_KEY);
    if (v && buyerUnits(DEMO_BUYER).includes(v)) return v;
  } catch {}
  return DEMO_BUYER.unitId;
}

export function setBuyerUnit(id: string) {
  try {
    localStorage.setItem(UNIT_KEY, id);
  } catch {}
  unitListeners.forEach((l) => l());
}

export function useBuyerUnit() {
  return useSyncExternalStore(
    (l) => {
      unitListeners.add(l);
      return () => unitListeners.delete(l);
    },
    readUnit,
    () => DEMO_BUYER.unitId,
  );
}
