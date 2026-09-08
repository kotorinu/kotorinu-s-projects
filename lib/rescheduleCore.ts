import type { TimeBlock, TimeBlockOverride } from "./types";

// The pure half of a reschedule (2026-09-09, §2/§3/§41-A).
//
// §3 asks for a real transaction: "途中までしか更新されない状態は禁止". The way
// to get that is to compute the WHOLE next state first and only then hand it
// to the store, so there is no window where the block has moved but the work
// date has not. This function is that computation — and because it touches no
// React, a test can run the exact code production runs.

export interface ReschedulePlanArgs {
  taskId: string;
  taskTitle: string;
  /** The live plan, used to find which block is being replaced. */
  planBlocks: TimeBlock[];
  today: string;
  date: string;
  startTime: string;
  endTime: string;
  reason: string;
  nowIso: string;
}

export interface ReschedulePlan {
  /** The new block. Always created — moving work always moves a block. */
  block: TimeBlockOverride;
  /** The block it replaces, or null when the Task had no time yet. */
  replaced: TimeBlock | null;
  /** Where the Task now belongs, for day views. */
  workDate: string;
}

/** The block a Task is currently scheduled in: today or next, else its last. */
export function currentBlockOf(planBlocks: TimeBlock[], taskId: string, today: string): TimeBlock | null {
  const blocks = planBlocks
    .filter((b) => b.taskId === taskId && b.lifecycle === "ACTIVE")
    .sort((a, b) => (a.date + a.startTime < b.date + b.startTime ? -1 : 1));
  return blocks.find((b) => b.date >= today) ?? blocks[blocks.length - 1] ?? null;
}

export function newBlockId(taskId: string, nowIso: string): string {
  return `tbo-${taskId}-${Date.parse(nowIso)}`;
}

export function planReschedule(args: ReschedulePlanArgs): ReschedulePlan {
  const replaced = currentBlockOf(args.planBlocks, args.taskId, args.today);
  return {
    block: {
      id: newBlockId(args.taskId, args.nowIso),
      taskId: args.taskId,
      label: args.taskTitle,
      date: args.date,
      startTime: args.startTime,
      endTime: args.endTime,
      createdOnDate: args.today,
      createdAt: args.nowIso,
      replacesBlockId: replaced?.id ?? null,
      reason: args.reason,
    },
    replaced,
    workDate: args.date,
  };
}

/** §5: a move without both a date AND a time is not a move. */
export function isCompleteReschedule(date: string, startTime: string, endTime: string): boolean {
  const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(date);
  const timeOk = /^\d{2}:\d{2}$/.test(startTime) && /^\d{2}:\d{2}$/.test(endTime);
  return dateOk && timeOk && startTime < endTime;
}
