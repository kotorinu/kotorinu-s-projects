import type { FixedCalendarEvent, RecurringRule, Task, TimeBlock } from "./types";

export type TimelineStatus = "PAST" | "NOW" | "NEXT" | "LATER";

export interface TimelineTaskItem {
  kind: "task";
  startTime: string;
  endTime: string;
  timeBlock: TimeBlock;
  task: Task;
  status: TimelineStatus;
}

export interface TimelineRecurringItem {
  kind: "recurring";
  startTime: string;
  endTime: string;
  timeBlock: TimeBlock;
  rule: RecurringRule;
  status: TimelineStatus;
}

// A TimeBlock with no Task/RecurringRule behind it — meals, commute, sleep
// prep. Occupies time on the Timeline but has no completion concept.
export interface TimelinePlainItem {
  kind: "plain";
  startTime: string;
  endTime: string;
  timeBlock: TimeBlock;
  status: TimelineStatus;
}

export interface TimelineFixedItem {
  kind: "fixed";
  startTime: string;
  endTime: string;
  event: FixedCalendarEvent;
  status: TimelineStatus;
}

export type TimelineItem = TimelineTaskItem | TimelineRecurringItem | TimelinePlainItem | TimelineFixedItem;

// Merges today's TimeBlocks (resolved against Task/RecurringRule/plain
// label) and today's *timed* Fixed Calendar Events into one time-sorted
// list, then classifies each slot against the current clock time. All-day
// Fixed Events don't belong in a time-sorted list — filter those out first.
//
// startedTaskId (2026-09-05, "Early Start"): a Task the user has actually
// pressed 今から開始 on always wins NOW, regardless of its own planned
// startTime/endTime — Plan (予定) and Actual (実績) are never conflated, so
// this never rewrites the TimeBlock's own time, only which slot renders as
// NOW. When set, no other Task slot can become NOW (see priority order in
// PRD.md's Execution UX section) — it may still be NEXT/LATER/PAST by time.
export function buildTimeline(
  timeBlocksToday: TimeBlock[],
  tasks: Task[],
  recurringRules: RecurringRule[],
  timedFixedEventsToday: FixedCalendarEvent[],
  nowHm: string,
  startedTaskId: string | null = null
): TimelineItem[] {
  type Draft =
    | Omit<TimelineTaskItem, "status">
    | Omit<TimelineRecurringItem, "status">
    | Omit<TimelinePlainItem, "status">
    | Omit<TimelineFixedItem, "status">;
  const drafts: Draft[] = [];

  for (const tb of timeBlocksToday) {
    if (tb.taskId) {
      const task = tasks.find((t) => t.id === tb.taskId);
      if (task) {
        drafts.push({ kind: "task", startTime: tb.startTime, endTime: tb.endTime, timeBlock: tb, task });
        continue;
      }
    }
    if (tb.recurringRuleId) {
      const rule = recurringRules.find((r) => r.id === tb.recurringRuleId);
      if (rule) {
        drafts.push({ kind: "recurring", startTime: tb.startTime, endTime: tb.endTime, timeBlock: tb, rule });
        continue;
      }
    }
    drafts.push({ kind: "plain", startTime: tb.startTime, endTime: tb.endTime, timeBlock: tb });
  }
  for (const e of timedFixedEventsToday) {
    if (!e.startTime || !e.endTime) continue;
    drafts.push({ kind: "fixed", startTime: e.startTime, endTime: e.endTime, event: e });
  }

  drafts.sort((a, b) => (a.startTime < b.startTime ? -1 : a.startTime > b.startTime ? 1 : 0));

  // NOW/NEXT are about "what Task am I doing right now" — only Task slots
  // compete for those. A Fixed Calendar Event, recurring block, or plain
  // block's window can overlap a Task's (e.g. a broad appointment block
  // containing a shorter scheduled Task) and must never steal the NOW/NEXT
  // slot from the Task actually happening then.
  const taskIndices = drafts.map((d, i) => (d.kind === "task" ? i : -1)).filter((i) => i !== -1);
  const startedIndex =
    startedTaskId !== null
      ? (taskIndices.find((i) => (drafts[i] as Omit<TimelineTaskItem, "status">).task.id === startedTaskId) ?? -1)
      : -1;
  const timeBasedNowIndex = taskIndices.find((i) => drafts[i].startTime <= nowHm && nowHm < drafts[i].endTime) ?? -1;
  // STARTED beats the time-based slot (priority order: 1. actually-started
  // Task, 2. current-time TimeBlock, 3. next upcoming). If a Task is started
  // but isn't in today's TimeBlocks at all, startedIndex is -1 here — the
  // caller (TODAY page) renders that case as a separate pinned NOW card and
  // this function still suppresses time-based NOW for everything else below.
  const nowIndex = startedTaskId !== null ? startedIndex : timeBasedNowIndex;
  // NEXT always means "the next thing coming up by wall-clock time" — never
  // "whatever's positioned right after NOW in the list." Early Start can
  // make nowIndex point at a slot far in the past, where "the next index"
  // would itself already be over; anchoring on nowHm instead keeps NEXT
  // meaningful (and simply reduces to the old behavior when nowIndex is the
  // real current-time slot, since the slot right after it is always upcoming).
  const nextIndex = taskIndices.find((i) => i !== nowIndex && drafts[i].startTime > nowHm) ?? -1;

  return drafts.map((d, i) => {
    let status: TimelineStatus;
    if (i === nowIndex) status = "NOW";
    else if (d.endTime <= nowHm) status = "PAST";
    else if (i === nextIndex) status = "NEXT";
    else status = "LATER";
    return { ...d, status } as TimelineItem;
  });
}

// Minutes remaining until endTime, from nowHm. Negative once past.
export function minutesUntil(endTime: string, nowHm: string): number {
  const [eh, em] = endTime.split(":").map(Number);
  const [nh, nm] = nowHm.split(":").map(Number);
  return eh * 60 + em - (nh * 60 + nm);
}
