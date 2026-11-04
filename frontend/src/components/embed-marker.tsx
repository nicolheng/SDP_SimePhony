"use client";
import { useEffect, useSyncExternalStore } from "react";

function isFramed() {
  try {
    return window.self !== window.top;
  } catch {
    return true; // cross-origin parent: still framed
  }
}

/** True when the app runs inside the /split side-by-side view (an iframe). False on the server and first render,
 *  so the server and client HTML match; it flips right after hydration. */
export function useEmbedded(): boolean {
  return useSyncExternalStore(
    () => () => {},
    isFramed,
    () => false,
  );
}

/** Inside the side-by-side view the page itself must not scroll or show a scrollbar: the phone drawn by /split is the
 *  frame, and each screen scrolls inside its own (scrollbar-free) area. */
export function EmbedMarker() {
  useEffect(() => {
    if (!isFramed()) return;
    const root = document.documentElement;
    root.setAttribute("data-embed", "1");
    root.style.overflow = "hidden";
    root.style.scrollbarWidth = "none";
    document.body.style.overflow = "hidden";
  }, []);
  return null;
}
