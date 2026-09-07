import { daysBetween, minutesSince } from "./date";
import { computeVariance } from "./execution";
import type {
  Task,
  TaskCompletionRecord,
  TaskDispositionRecord,
  TaskLifecycle,
  TaskLifecycleRecord,
} from "./types";

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
  // 2026-09-08: Archive / Merge / Delete decisions made from Task Detail.
  // The fixture's own `lifecycle` is the authored baseline; this is what the
  // user has since decided.
  lifecycleOverrides?: Record<string, TaskLifecycleRecord>;
}

/** The Task's lifecycle right now: a user decision wins over the fixture. */
export function effectiveLifecycle(
  task: Task,
  overlays: Pick<TaskStateOverlays, "lifecycleOverrides">
): TaskLifecycle {
  return overlays.lifecycleOverrides?.[task.id]?.lifecycle ?? task.lifecycle;
}

/**
 * Whether this Task belongs to the plan the user is executing. Only ACTIVE
 * and BACKLOG Tasks are still "live" work; SUPERSEDED / MERGED / ARCHIVED /
 * DELETED ones are history and must not be counted in progress, overdue,
 * carryover or Area totals — deleting them would erase what happened, so
 * they are filtered instead.
 */
export function isTaskLive(task: Task, overlays: Pick<TaskStateOverlays, "lifecycleOverrides">): boolean {
  const lifecycle = effectiveLifecycle(task, overlays);
  return lifecycle === "ACTIVE" || lifecycle === "BACKLOG";
}

/** Committed to the live plan: has a decided date and time (§2). */
export function isTaskCommitted(task: Task, overlays: Pick<TaskStateOverlays, "lifecycleOverrides">): boolean {
  return effectiveLifecycle(task, overlays) === "ACTIVE";
}

/**
 * A Task that has produced real execution evidence can never be hard-deleted
 * (§4-B) — only archived, so the measurement history survives.
 */
export function hasExecutionHistory(
  task: Task,
  overlays: Pick<TaskStateOverlays, "completions">,
  startedTaskIds: Set<string>
): boolean {
  return (
    overlays.completions[task.id] !== undefined ||
    startedTaskIds.has(task.id) ||
    task.actualMinutes !== null ||
    task.completedAt !== null
  );
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
 * "Still needs doing": live work, not completed and not dropped. Blocked
 * Tasks are still open — being blocked is a reason it hasn't moved, not a
 * reason to hide it. Superseded/merged/archived ones are not open: they were
 * decided about, and counting them again is how the old 未完了 numbers stayed
 * inflated forever.
 */
export function isTaskOpen(task: Task, overlays: TaskStateOverlays): boolean {
  return isTaskLive(task, overlays) && !isTaskDone(task, overlays) && !isTaskDropped(task, overlays);
}

/**
 * OVERDUE is derived, never a stored status (per the round's rule:
 * "deadline < now かつ status != DONE かつ status != CANCELLED"). So a Task
 * completed late immediately stops being overdue, without anyone rewriting
 * its deadline or pretending it was on time.
 */
export function isTaskOverdue(task: Task, today: string, overlays: TaskStateOverlays): boolean {
  if (!isTaskOpen(task, overlays)) return false;
  // 2026-09-08: only a commitment can be overdue. A BACKLOG Task has no
  // decided execution time, so a date sitting on it is a target, not a
  // promise that was broken — putting those in the overdue inbox is how the
  // list filled up with work the user never actually planned. They stay
  // visible on TASK MAP (未スケジュール / 全部), just not as failures.
  if (!isTaskCommitted(task, overlays)) return false;
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
