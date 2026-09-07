import { daysBetween } from "./date";

// Execution Baseline (2026-09-08, §1/§28).
//
// Everything before this date was the period while the Execution OS was still
// being built: half-finished fixtures, Tasks that were never really planned,
// completion state that was scoped to a single day. None of it describes how
// the user actually executes, so none of it may leak into today's numbers.
//
// 9/8 is DAY 1. Streaks, "今日の前進", carryover and overdue all start here.
// The pre-baseline records are still kept (nothing is deleted) — they are just
// never counted.
export const EXECUTION_BASELINE_DATE = "2026-09-08";

/** 1 on the baseline date itself, 2 the next day, … null before it started. */
export function executionDayNumber(today: string): number | null {
  const elapsed = daysBetween(EXECUTION_BASELINE_DATE, today);
  return elapsed < 0 ? null : elapsed + 1;
}

export function isBeforeBaseline(date: string): boolean {
  return date < EXECUTION_BASELINE_DATE;
}

/**
 * Consecutive days of real execution, counted backwards from today and
 * stopping at the baseline. A day counts when something was actually
 * completed on it — never a hardcoded number, and never a day from before the
 * baseline.
 *
 * Today is included only once something has been completed on it, so the
 * streak doesn't claim a day the user hasn't executed yet; `todayCounted`
 * says which it is, so the UI can be honest about "まだ今日は入っていない".
 */
export function executionStreak(
  today: string,
  didExecuteOn: (date: string) => boolean
): { days: number; todayCounted: boolean } {
  const dayNumber = executionDayNumber(today);
  if (dayNumber === null) return { days: 0, todayCounted: false };

  const todayCounted = didExecuteOn(today);
  let days = 0;
  let cursor = todayCounted ? 0 : 1; // start from yesterday when today is still empty
  while (cursor < dayNumber) {
    const date = shiftDays(today, -cursor);
    if (date < EXECUTION_BASELINE_DATE) break;
    if (!didExecuteOn(date)) break;
    days++;
    cursor++;
  }
  return { days, todayCounted };
}

function shiftDays(date: string, delta: number): string {
  const d = new Date(date + "T00:00:00");
  d.setDate(d.getDate() + delta);
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}
