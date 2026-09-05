import type { CarryoverRecord, Task, TimeBlock } from "./types";

// "Raw" — what a given date's plan originally was, ignoring any later
// Carryover decision. Used to compute Yesterday Summary totals and which of
// yesterday's Tasks are still undecided. Never use this for "today"'s live
// list — a Task moved onto today via Carryover needs tasksEffectiveOnDate
// below to actually show up there.
export function tasksScheduledOnDate(date: string, tasks: Task[], timeBlocks: TimeBlock[]): Task[] {
  const dayBlocks = timeBlocks.filter((tb) => tb.date === date);
  const scheduledIds = new Set(dayBlocks.map((tb) => tb.taskId).filter((id): id is string => id !== null));
  return tasks.filter(
    (t) =>
      t.status !== "完了" &&
      t.status !== "Archive" &&
      (t.workDate === date || t.deadline === date || scheduledIds.has(t.id))
  );
}

// What should actually render as `date`'s TODAY list: the raw plan plus any
// Task re-placed onto this date via a Carryover decision (§10/§11 — "今日
// やる"/"別日に移す"), without duplicating a Task that's already there for
// its own original reason.
export function tasksEffectiveOnDate(
  date: string,
  tasks: Task[],
  timeBlocks: TimeBlock[],
  workDateOverrides: Record<string, string>
): Task[] {
  const raw = tasksScheduledOnDate(date, tasks, timeBlocks);
  const rawIds = new Set(raw.map((t) => t.id));
  const moved = tasks.filter(
    (t) => !rawIds.has(t.id) && t.status !== "完了" && t.status !== "Archive" && workDateOverrides[t.id] === date
  );
  return [...raw, ...moved];
}

// A Task that was on `date`'s original plan, wasn't completed that day, and
// has no Carryover decision recorded yet for it — i.e. still needs the user
// to choose 今日やる／別日に移す／今回はやめる. Never auto-resolved.
export function pendingCarryoverTasks(
  date: string,
  tasks: Task[],
  timeBlocks: TimeBlock[],
  completedIdsOnDate: Set<string>,
  carryover: Record<string, CarryoverRecord>
): Task[] {
  const scheduled = tasksScheduledOnDate(date, tasks, timeBlocks);
  return scheduled.filter((t) => !completedIdsOnDate.has(t.id) && !carryover[`${date}:${t.id}`]);
}
