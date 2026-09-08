import { nowHm, todayStr } from "./date";

// Pure clock helpers (2026-09-09, §16).
//
// Kept apart from the React provider in currentTime.tsx on purpose: these are
// the functions the tests need, and a test runner should not have to parse JSX
// to check what 22:40 means.

export interface Clock {
  today: string; // YYYY-MM-DD
  nowHm: string; // HH:mm
}

/** The real clock. Only call this outside render — it is not pure. */
export function realClock(): Clock {
  return { today: todayStr(), nowHm: nowHm() };
}

/** A fixed clock, for tests: `fakeClock("2026-09-09", "22:40")`. */
export function fakeClock(today: string, hm: string): Clock {
  return { today, nowHm: hm };
}

export type BlockPhase = "PAST" | "NOW" | "FUTURE";

/**
 * Where a dated time range sits relative to a clock (§15).
 * A block that has ended is PAST and must never be offered as "next".
 */
export function blockPhase(
  block: { date: string; startTime: string; endTime: string },
  clock: Clock
): BlockPhase {
  if (block.date < clock.today) return "PAST";
  if (block.date > clock.today) return "FUTURE";
  if (block.endTime <= clock.nowHm) return "PAST";
  if (block.startTime <= clock.nowHm) return "NOW";
  return "FUTURE";
}
