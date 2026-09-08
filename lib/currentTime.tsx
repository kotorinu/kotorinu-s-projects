"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { nowHm } from "./date";

// One clock for the whole app (2026-09-09, §13/§16).
//
// Every screen used to keep its own `nowHm` state, which meant NOW/NEXT/PAST
// could disagree between TODAY and TASK MAP, and there was no way to test
// "what does this look like at 22:40" without waiting until 22:40.
//
// Two rules this enforces:
//   - the current DATE comes from the execution store (it survives rollover
//     and is the thing history is keyed by)
//   - the current TIME comes from the browser clock, never from SSR or build
//     time. A statically prerendered page would otherwise bake the build
//     machine's clock into the HTML.
//
// So the first render is always a fixed placeholder that is identical on the
// server and in the browser, and the real time arrives in an effect.
const PLACEHOLDER_HM = "00:00";

interface ClockValue {
  /** "HH:mm" in the viewer's local time. PLACEHOLDER_HM until mounted. */
  nowHmValue: string;
  /** False during the first paint, before the real clock is known. */
  clockReady: boolean;
}

const ClockContext = createContext<ClockValue | null>(null);

export function ClockProvider({ children }: { children: ReactNode }) {
  const [nowHmValue, setNowHmValue] = useState(PLACEHOLDER_HM);
  const [clockReady, setClockReady] = useState(false);

  useEffect(() => {
    const tick = () => {
      setNowHmValue(nowHm());
      setClockReady(true);
    };
    const id = setTimeout(tick, 0);
    // Re-read every 30s so NOW/NEXT roll over without a reload; a minute
    // boundary is the smallest unit anything here cares about.
    const interval = setInterval(tick, 30_000);
    return () => {
      clearTimeout(id);
      clearInterval(interval);
    };
  }, []);

  return <ClockContext.Provider value={{ nowHmValue, clockReady }}>{children}</ClockContext.Provider>;
}

export function useClock(): ClockValue {
  const ctx = useContext(ClockContext);
  if (!ctx) throw new Error("useClock must be used inside ClockProvider");
  return ctx;
}

// The pure clock helpers live in ./clock so tests can import them without
// parsing JSX. Re-exported here so screens have one import (§16).
export { realClock, fakeClock, blockPhase, type Clock, type BlockPhase } from "./clock";
