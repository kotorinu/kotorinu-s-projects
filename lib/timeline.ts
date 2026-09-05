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
export function buildTimeline(
  timeBlocksToday: TimeBlock[],
  tasks: Task[],
  recurringRules: RecurringRule[],
  timedFixedEventsToday: FixedCalendarEvent[],
  nowHm: string
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
  const nowIndex = taskIndices.find((i) => drafts[i].startTime <= nowHm && nowHm < drafts[i].endTime) ?? -1;
  const nextIndex =
    nowIndex !== -1
      ? (taskIndices.find((i) => i > nowIndex) ?? -1)
      : (taskIndices.find((i) => drafts[i].startTime > nowHm) ?? -1);

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
