"use client";

import { useEffect, useState } from "react";

// Respects the OS-level prefers-reduced-motion setting (PRD.md §28) — used
// to skip Confetti bursts without hiding the celebration text/state itself.
export function usePrefersReducedMotion(): boolean {
  // Always starts false — matching what the (window-less) server render
  // produces — so the client's hydration-comparison pass can't disagree
  // with it. The real value (which may differ per-viewer) is only read
  // client-side, after mount, inside the effect below.
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mql.matches);
    const firstSync = setTimeout(sync, 0);
    mql.addEventListener("change", sync);
    return () => {
      clearTimeout(firstSync);
      mql.removeEventListener("change", sync);
    };
  }, []);

  return reduced;
}
