import { daysBetween, minutesSince } from "./date";
import { computeVariance } from "./execution";
import type { Task, TaskCompletionRecord, TaskDispositionRecord } from "./types";

// Single source of truth for "what state is this Task actually in right
// now" (2026-09-06 Execution Management round).
//
// The `tasks` fixture is immutable — its `status` is the originally-authored
// one and is never rewritten — so every runtime decision (completed,
// blocked, dropped, deadline re-set, moved to another day) lives in the
// execution store as an overlay. Before this module those overlays were
// read ad-hoc per screen, which is why an OVERDUE Task could be completed
// on TODAY and still show up as overdue: the overdue list was reading the
// fixture status while completion was written to a day-scoped `done` set.
// Everything now derives from these helpers so the screens agree.

export interface TaskStateOverlays {
  completions: Record<string, TaskCompletionRecord>;
  dispositions: Record<string, TaskDispositionRecord>;
  deadlineOverrides: Record<string, string>;
  workDateOverrides: Record<string, string>;
}

/** The deadline that applies now: a 期限再設定 wins, else the authored one. */
export function effectiveDeadline(task: Task, overlays: Pick<TaskStateOverlays, "deadlineOverrides">): string | null {
  return overlays.deadlineOverrides[task.id] ?? task.deadline;
}

/** The day this Task is currently placed on: a Carryover move wins. */
export function effectiveWorkDate(task: Task, overlays: Pick<TaskStateOverlays, "workDateOverrides">): string | null {
  return overlays.workDateOverrides[task.id] ?? task.workDate;
}

/**
 * Done means: a durable completion record exists, or the fixture itself
 * authored it as finished. Deliberately NOT "is in today's done set" —
 * that set is day-scoped and would make a Task look unfinished again
 * tomorrow.
 */
export function isTaskDone(task: Task, overlays: Pick<TaskStateOverlays, "completions">): boolean {
  return overlays.completions[task.id] !== undefined || task.status === "完了";
}

export function isTaskDropped(task: Task, overlays: Pick<TaskStateOverlays, "dispositions">): boolean {
  return overlays.dispositions[task.id]?.disposition === "DROPPED" || task.status === "Archive";
}

export function isTaskBlocked(task: Task, overlays: Pick<TaskStateOverlays, "dispositions">): boolean {
  return overlays.dispositions[task.id]?.disposition === "BLOCKED";
}

/**
 * "Still needs doing": not completed and not dropped. Blocked Tasks are
 * still open — being blocked is a reason it hasn't moved, not a reason to
 * hide it.
 */
export function isTaskOpen(task: Task, overlays: TaskStateOverlays): boolean {
  return !isTaskDone(task, overlays) && !isTaskDropped(task, overlays);
}

/**
 * OVERDUE is derived, never a stored status (per the round's rule:
 * "deadline < now かつ status != DONE かつ status != CANCELLED"). So a Task
 * completed late immediately stops being overdue, without anyone rewriting
 * its deadline or pretending it was on time.
 */
export function isTaskOverdue(task: Task, today: string, overlays: TaskStateOverlays): boolean {
  if (!isTaskOpen(task, overlays)) return false;
  const deadline = effectiveDeadline(task, overlays);
  if (deadline === null) return false;
  return daysBetween(today, deadline) < 0;
}

export function overdueTasks(tasks: Task[], today: string, overlays: TaskStateOverlays): Task[] {
  return tasks
    .filter((t) => isTaskOverdue(t, today, overlays))
    .sort((a, b) => {
      const da = effectiveDeadline(a, overlays) ?? "";
      const db = effectiveDeadline(b, overlays) ?? "";
      return da < db ? -1 : da > db ? 1 : 0;
    });
}

/** How many days late a completion was. Positive = late, 0 = on the day. */
export function delayDaysFor(deadline: string | null, completedOnDate: string): number | null {
  if (deadline === null) return null;
  const diff = daysBetween(deadline, completedOnDate);
  return diff > 0 ? diff : 0;
}

/**
 * Builds the durable record written on completion. actualMinutes is only
 * ever a real measured span (start→now) — never estimated, never inferred
 * from the plan — so a Task completed without ever being started records
 * null rather than a fabricated duration.
 */
export function buildCompletionRecord(
  task: Task,
  args: {
    today: string;
    startedIso: string | undefined;
    metDefinitionOfDone: boolean;
    deadlineOverrides: Record<string, string>;
  }
): TaskCompletionRecord {
  const deadlineAtCompletion = args.deadlineOverrides[task.id] ?? task.deadline;
  const actualMinutes = args.startedIso ? minutesSince(args.startedIso) : null;
  const { varianceMinutes } =
    actualMinutes !== null
      ? computeVariance(task.estimateMinutes, actualMinutes)
      : { varianceMinutes: null };
  return {
    taskId: task.id,
    completedAt: new Date().toISOString(),
    completedOnDate: args.today,
    originalDeadline: task.deadline,
    deadlineAtCompletion,
    delayDays: delayDaysFor(deadlineAtCompletion, args.today),
    metDefinitionOfDone: args.metDefinitionOfDone,
    estimateMinutes: task.estimateMinutes,
    actualMinutes,
    varianceMinutes,
  };
}
