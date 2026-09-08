"use client";

import { liveTimeBlocks } from "./livePlan";
import { buildReplanFlag, deadlineRisk, isPostponement } from "./replan";
import { effectiveDeadline } from "./taskState";
import { useTodayExecution } from "./todayExecutionStore";
import type { Task, TimeBlock } from "./types";

// Rescheduling, in exactly one place (2026-09-09, P0/P0-1).
//
// THE BUG THIS FIXES: 「未達のまま終了 → この日にやる」 wrote only a Carryover
// record. The Task's original TimeBlock was never superseded and no new block
// was created, so:
//   - it stayed on today's Timeline (the block is what puts it there)
//   - the ▶ button stayed on today
//   - nothing appeared on the target day
//   - the deadline-risk check never ran
// A Carryover is a decision, not a schedule. Moving work has to move the
// block, and every entry point — Task Detail, the completion dialog, the
// overdue inbox — now goes through this one function.

export interface RescheduleArgs {
  date: string;
  startTime: string;
  endTime: string;
  /** Proceed even though the new date is past the deadline (→ NEEDS_REPLAN). */
  acceptDeadlineMiss: boolean;
  /** Only set when the user explicitly chose to move the deadline too. */
  newDeadline: string | null;
  reason: string;
}

export interface RescheduleResult {
  date: string;
  startTime: string;
  endTime: string;
  movedFrom: string | null;
  raisedReplan: boolean;
}

function newBlockId(taskId: string): string {
  return `tbo-${taskId}-${Date.now()}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

export function useReschedule() {
  const store = useTodayExecution();
  const {
    currentDate: today,
    timeBlockOverrides,
    supersededBlockIds,
    deadlineOverrides,
    startedTaskId,
    rescheduleTimeBlock,
    setDeadlineOverride,
    raiseReplan,
    recordCarryover,
    endWork,
  } = store;

  /** The block this Task is currently scheduled in, today or next. */
  function currentBlockFor(task: Task): TimeBlock | null {
    const blocks = liveTimeBlocks({ timeBlockOverrides, supersededBlockIds }).filter(
      (b) => b.taskId === task.id
    );
    return blocks.find((b) => b.date >= today) ?? blocks[blocks.length - 1] ?? null;
  }

  function reschedule(task: Task, args: RescheduleArgs): RescheduleResult {
    const replaced = currentBlockFor(task);
    const taskDeadline = effectiveDeadline(task, { deadlineOverrides });

    // A Task that is running cannot keep running on a day it no longer
    // belongs to — close its session before the block moves (P0-4).
    if (startedTaskId === task.id) endWork(task.id, "RESCHEDULE");

    rescheduleTimeBlock(
      {
        id: newBlockId(task.id),
        taskId: task.id,
        label: task.title,
        date: args.date,
        startTime: args.startTime,
        endTime: args.endTime,
        createdOnDate: today,
        createdAt: nowIso(),
        replacesBlockId: replaced?.id ?? null,
        reason: args.reason,
      },
      replaced?.id ?? null
    );

    // Keep the work date in step so day views agree with the block.
    recordCarryover(
      replaced?.date ?? today,
      task.id,
      args.date === today ? "MOVED_TODAY" : "RESCHEDULED",
      args.date
    );

    // The deadline only moves when the user explicitly said so.
    if (args.newDeadline) setDeadlineOverride(task.id, args.newDeadline);

    let raisedReplan = false;
    if (args.acceptDeadlineMiss) {
      raiseReplan(
        buildReplanFlag(
          task.id,
          "DEADLINE_AT_RISK",
          `${args.date} へ移動したため、期限 ${taskDeadline ?? "-"} に間に合わない見込み`,
          today
        )
      );
      raisedReplan = true;
    } else if (isPostponement(replaced, args.date)) {
      raiseReplan(
        buildReplanFlag(task.id, "POSTPONED", `${replaced!.date} から ${args.date} へ移動`, today)
      );
      raisedReplan = true;
    }

    return {
      date: args.date,
      startTime: args.startTime,
      endTime: args.endTime,
      movedFrom: replaced?.date ?? null,
      raisedReplan,
    };
  }

  function riskFor(task: Task, date: string) {
    return deadlineRisk(task, date, effectiveDeadline(task, { deadlineOverrides }));
  }

  return { reschedule, currentBlockFor, riskFor };
}
