import { blockPhase, type Clock } from "./clock";
import { effectiveLifecycle, effectiveWorkDate, isTaskDone, type TaskStateOverlays } from "./taskState";
import type { Task, TimeBlock } from "./types";

// Plan Consistency Validator (2026-09-09, §17).
//
// The bugs that hurt most were never crashes — they were the app confidently
// showing a plan that contradicted itself: a Task on today's timeline whose
// block had already moved, a finished Task offered as "next", two live blocks
// for one Task. Those states are cheap to detect and expensive to notice by
// eye, so they get checked explicitly.
//
// This runs over the LIVE plan, the same data the screens render, so a green
// result means the screens agree.

export type PlanIssueCode =
  | "ACTIVE_WITHOUT_BLOCK"
  | "MULTIPLE_ACTIVE_BLOCKS"
  | "SUPERSEDED_BLOCK_IN_PLAN"
  | "WORKDATE_BLOCK_MISMATCH"
  | "DONE_TASK_SCHEDULED";

export interface PlanIssue {
  code: PlanIssueCode;
  taskId: string;
  taskTitle: string;
  detail: string;
}

export const PLAN_ISSUE_LABEL: Record<PlanIssueCode, string> = {
  ACTIVE_WITHOUT_BLOCK: "実行予定なのに時間が決まっていない",
  MULTIPLE_ACTIVE_BLOCKS: "同じTaskに現在の予定が複数ある",
  SUPERSEDED_BLOCK_IN_PLAN: "置き換え済みの予定が現在計画に残っている",
  WORKDATE_BLOCK_MISMATCH: "実行日と予定の日付が食い違っている",
  DONE_TASK_SCHEDULED: "完了したTaskがまだ予定に残っている",
};

export function validatePlan(
  tasks: Task[],
  planBlocks: TimeBlock[],
  overlays: TaskStateOverlays,
  clock: Clock
): PlanIssue[] {
  const issues: PlanIssue[] = [];
  const blocksByTask = new Map<string, TimeBlock[]>();
  for (const b of planBlocks) {
    if (b.taskId === null) continue;
    const list = blocksByTask.get(b.taskId) ?? [];
    list.push(b);
    blocksByTask.set(b.taskId, list);
  }

  // §18: a superseded block is history and must not be in the live plan at all.
  for (const b of planBlocks) {
    if (b.lifecycle !== "ACTIVE") {
      const task = tasks.find((t) => t.id === b.taskId);
      issues.push({
        code: "SUPERSEDED_BLOCK_IN_PLAN",
        taskId: b.taskId ?? b.id,
        taskTitle: task?.title ?? b.label,
        detail: `${b.date} ${b.startTime}〜${b.endTime}（lifecycle=${b.lifecycle}）`,
      });
    }
  }

  for (const task of tasks) {
    const lifecycle = effectiveLifecycle(task, overlays);
    const blocks = (blocksByTask.get(task.id) ?? []).filter((b) => b.lifecycle === "ACTIVE");
    const done = isTaskDone(task, overlays);

    if (done) {
      // A completed Task may keep its past blocks — that is its history. What
      // it must not have is a block still ahead of the clock.
      const future = blocks.filter((b) => blockPhase(b, clock) !== "PAST");
      if (future.length > 0) {
        issues.push({
          code: "DONE_TASK_SCHEDULED",
          taskId: task.id,
          taskTitle: task.title,
          detail: `完了済みだが ${future[0].date} ${future[0].startTime} の予定が残っている`,
        });
      }
      continue;
    }

    if (lifecycle !== "ACTIVE") continue;

    if (blocks.length === 0) {
      issues.push({
        code: "ACTIVE_WITHOUT_BLOCK",
        taskId: task.id,
        taskTitle: task.title,
        detail: "実行時間が決まっていないのに実行計画へ入っている",
      });
      continue;
    }

    // Several blocks are fine when the work is genuinely split across
    // sessions — what is not fine is several on the SAME day, which means a
    // reschedule left a duplicate behind.
    const byDate = new Map<string, number>();
    for (const b of blocks) byDate.set(b.date, (byDate.get(b.date) ?? 0) + 1);
    for (const [date, count] of byDate) {
      if (count > 1) {
        issues.push({
          code: "MULTIPLE_ACTIVE_BLOCKS",
          taskId: task.id,
          taskTitle: task.title,
          detail: `${date} に現在の予定が${count}件ある`,
        });
      }
    }

    const workDate = effectiveWorkDate(task, overlays);
    if (workDate !== null && !blocks.some((b) => b.date === workDate)) {
      issues.push({
        code: "WORKDATE_BLOCK_MISMATCH",
        taskId: task.id,
        taskTitle: task.title,
        detail: `実行日 ${workDate} に対し、予定は ${blocks.map((b) => b.date).join(" / ")}`,
      });
    }
  }

  return issues;
}
