import type { ExecutionEnvironment, TimeBlock } from "./types";

// Scheduling constraints (2026-09-08).
//
// The user is employed during weekday daytime. Personal Tasks (RIALA / 営業 /
// GENESIS / AI Work OS) must not be placed there — a plan that books
// 09:20-10:20 for RIALA is not a plan, it is a fiction. The one weekday
// daytime slot that is genuinely usable is the lunch break, and only from a
// phone.
//
// This module is the constraint model, not a planner. Nothing here places
// Tasks; it only answers "is this slot usable, and by what kind of Task" so
// that a planner (not yet built) and the data in dummy-data.ts can be checked
// against the same rule.

export const LUNCH_WINDOW = {
  // Confirmed by the user: 平日 11:30-13:30 の範囲内で最大60分、スマホのみ。
  startTime: "11:30",
  endTime: "13:30",
  maxMinutes: 60,
  environment: "MOBILE_ONLY" as ExecutionEnvironment,
};

// The outer bounds of the employment block. The user stated that weekday
// daytime is work time and named 09:20-10:20 as an example that must be
// excluded, but did not state exact start/end times — so these are PROVISIONAL
// and should be replaced with the real hours when confirmed. Nothing is
// deleted on the strength of them; they are only used to flag placements for
// review.
export const EMPLOYMENT_BLOCK_PROVISIONAL = {
  startTime: "09:00",
  endTime: "18:00",
  confirmed: false,
};

export function isWeekday(date: string): boolean {
  const day = new Date(date + "T00:00:00").getDay();
  return day >= 1 && day <= 5;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function blockMinutes(block: Pick<TimeBlock, "startTime" | "endTime">): number {
  return toMinutes(block.endTime) - toMinutes(block.startTime);
}

// True when the slot sits inside the confirmed weekday lunch window.
export function isLunchSlot(block: Pick<TimeBlock, "date" | "startTime" | "endTime">): boolean {
  if (!isWeekday(block.date)) return false;
  return (
    toMinutes(block.startTime) >= toMinutes(LUNCH_WINDOW.startTime) &&
    toMinutes(block.endTime) <= toMinutes(LUNCH_WINDOW.endTime)
  );
}

// True when the slot collides with the (provisional) employment block and is
// not the lunch window — i.e. a placement the user cannot actually execute.
export function conflictsWithEmployment(block: Pick<TimeBlock, "date" | "startTime" | "endTime">): boolean {
  if (!isWeekday(block.date)) return false;
  if (isLunchSlot(block)) return false;
  const start = toMinutes(block.startTime);
  const end = toMinutes(block.endTime);
  return (
    start < toMinutes(EMPLOYMENT_BLOCK_PROVISIONAL.endTime) &&
    end > toMinutes(EMPLOYMENT_BLOCK_PROVISIONAL.startTime)
  );
}

// What a Task needs vs what the slot offers. MOBILE_ONLY slots accept only
// MOBILE_ONLY / ANY Tasks. A Task with no judged requirement is NOT waved
// through — "unknown" is not "fine anywhere".
export function canRunIn(
  required: ExecutionEnvironment | null,
  available: ExecutionEnvironment
): boolean {
  if (required === null) return false;
  if (available === "ANY" || required === "ANY") return true;
  return required === available;
}

export type PlacementIssue = {
  blockId: string;
  reason: "EMPLOYMENT_HOURS" | "LUNCH_OVER_MAX" | "ENVIRONMENT_MISMATCH";
  detail: string;
};

// Audits already-placed blocks against the constraints above. Used to check
// the fixture; a future planner should run the same check before committing a
// plan rather than "filling empty time".
export function auditPlacements(
  blocks: TimeBlock[],
  requiredEnvironmentByTaskId: (taskId: string) => ExecutionEnvironment | null
): PlacementIssue[] {
  const issues: PlacementIssue[] = [];
  for (const b of blocks) {
    if (conflictsWithEmployment(b)) {
      issues.push({
        blockId: b.id,
        reason: "EMPLOYMENT_HOURS",
        detail: `${b.date} ${b.startTime}〜${b.endTime} は平日の勤務時間帯`,
      });
    }
    if (isLunchSlot(b) && blockMinutes(b) > LUNCH_WINDOW.maxMinutes) {
      issues.push({
        blockId: b.id,
        reason: "LUNCH_OVER_MAX",
        detail: `昼枠は最大${LUNCH_WINDOW.maxMinutes}分（実際 ${blockMinutes(b)}分）`,
      });
    }
    if (b.taskId && b.executionEnvironment === "MOBILE_ONLY") {
      const required = requiredEnvironmentByTaskId(b.taskId);
      if (!canRunIn(required, "MOBILE_ONLY")) {
        issues.push({
          blockId: b.id,
          reason: "ENVIRONMENT_MISMATCH",
          detail: `スマホのみの枠に requiredEnvironment=${required ?? "未判定"} のTaskが入っている`,
        });
      }
    }
  }
  return issues;
}
