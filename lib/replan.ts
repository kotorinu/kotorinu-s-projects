import { daysBetween } from "./date";
import type { ReplanFlag, ReplanReason, Task, TimeBlock } from "./types";

// Replan (2026-09-08, §11/§12).
//
// A plan that quietly stops matching reality is worse than no plan. Whenever
// something happens that makes the current schedule wrong — a postponement, a
// deadline that can no longer be met, a block, a large overrun, a changed
// Outcome, new information — the Task is flagged NEEDS_REPLAN and appears at
// the top of TASK MAP. Nothing is rescheduled automatically: the flag says
// "this needs a decision", and the decision stays the user's.

export const REPLAN_REASON_LABEL: Record<ReplanReason, string> = {
  POSTPONED: "予定を後ろへ動かした",
  DEADLINE_AT_RISK: "このままでは期限に間に合わない",
  BLOCKED: "進められない",
  LARGE_OVERRUN: "予定時間を大幅に超過した",
  OUTCOME_CHANGED: "上位Outcomeが変わった",
  NEW_INFORMATION: "新しい情報が入った",
};

/**
 * Does moving this Task to `newDate` push it past its deadline? (§11)
 * Returns null when there is no deadline to miss.
 */
export function deadlineRisk(
  task: Task,
  newDate: string,
  effectiveDeadline: string | null
): { overshootDays: number; deadline: string } | null {
  if (effectiveDeadline === null) return null;
  const overshoot = daysBetween(effectiveDeadline, newDate);
  return overshoot > 0 ? { overshootDays: overshoot, deadline: effectiveDeadline } : null;
}

/** A postponement is any move to a later date than the block it replaces. */
export function isPostponement(oldBlock: TimeBlock | null, newDate: string): boolean {
  return oldBlock !== null && newDate > oldBlock.date;
}

export function buildReplanFlag(
  taskId: string,
  reason: ReplanReason,
  detail: string,
  today: string
): ReplanFlag {
  return { taskId, reason, detail, raisedOnDate: today, raisedAt: new Date().toISOString() };
}

// A run that overshot its estimate badly enough to be worth re-planning
// around, rather than just noting. Deliberately higher than the threshold for
// *asking why* (§15) — a 20% overrun deserves a reason, a 50% one means the
// plan itself was wrong.
export const LARGE_OVERRUN_PERCENT = 50;

export function isLargeOverrun(estimateMinutes: number | null, actualMinutes: number | null): boolean {
  if (estimateMinutes === null || actualMinutes === null || estimateMinutes <= 0) return false;
  return (actualMinutes - estimateMinutes) / estimateMinutes >= LARGE_OVERRUN_PERCENT / 100;
}
