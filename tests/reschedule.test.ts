import assert from "node:assert/strict";
import { test } from "node:test";
import { tasksEffectiveOnDate } from "../lib/dayPlan";
import { activeTimeBlocks, tasks } from "../lib/dummy-data";
import { liveTimeBlocks } from "../lib/livePlan";
import { isCompleteReschedule, planReschedule } from "../lib/rescheduleCore";
import type { TimeBlockOverride } from "../lib/types";

// §41-A — the bug that started this round, against the real fixture.
//
// 9/8 21:30 の「RIALA 未移行者へDM送信」を 9/9 21:00 へ移す。
// 通ってほしいこと: 9/8 から消え、9/9 に出て、古いブロックは live plan に残らない。

const TASK_ID = "t-riala-0908-dm";
const OLD_BLOCK_ID = "tb-0908-riala-dm";

function move(): { overrides: Record<string, TimeBlockOverride>; superseded: Set<string>; workDates: Record<string, string> } {
  const task = tasks.find((t) => t.id === TASK_ID);
  assert.ok(task, "fixture must still contain the 9/8 RIALA DM task");
  const plan = planReschedule({
    taskId: task.id,
    taskTitle: task.title,
    planBlocks: activeTimeBlocks,
    today: "2026-09-08",
    date: "2026-09-09",
    startTime: "21:00",
    endTime: "21:30",
    reason: "9/8に着手できなかったため翌日へ",
    nowIso: "2026-09-08T22:05:00+09:00",
  });
  return {
    overrides: { [plan.block.id]: plan.block },
    superseded: new Set(plan.replaced ? [plan.replaced.id] : []),
    workDates: { [TASK_ID]: plan.workDate },
  };
}

test("A: reschedule 9/8 → 9/9 replaces the original block", () => {
  const { overrides, superseded } = move();
  assert.equal(superseded.has(OLD_BLOCK_ID), true, "the 9/8 block must be superseded");

  const live = liveTimeBlocks({ timeBlockOverrides: overrides, supersededBlockIds: superseded });
  assert.equal(
    live.some((b) => b.id === OLD_BLOCK_ID),
    false,
    "the superseded 9/8 block must not be in the live plan"
  );
  const moved = live.filter((b) => b.taskId === TASK_ID);
  assert.equal(moved.length, 1, "exactly one live block for the moved task");
  assert.equal(moved[0].date, "2026-09-09");
  assert.equal(moved[0].startTime, "21:00");
  assert.equal(moved[0].endTime, "21:30");
});

test("A: the moved task leaves 9/8 and appears on 9/9", () => {
  const { overrides, superseded, workDates } = move();
  const live = liveTimeBlocks({ timeBlockOverrides: overrides, supersededBlockIds: superseded });

  const on0908 = tasksEffectiveOnDate("2026-09-08", tasks, live, workDates);
  assert.equal(
    on0908.some((t) => t.id === TASK_ID),
    false,
    "TODAY(9/8) must no longer show the moved task"
  );

  const on0909 = tasksEffectiveOnDate("2026-09-09", tasks, live, workDates);
  assert.equal(
    on0909.some((t) => t.id === TASK_ID),
    true,
    "9/9 must show the moved task"
  );
});

test("A: the original block is recoverable as history, not deleted", () => {
  const original = activeTimeBlocks.find((b) => b.id === OLD_BLOCK_ID);
  assert.ok(original, "the fixture is immutable — the 9/8 block still exists");
  assert.equal(original.date, "2026-09-08");
  assert.equal(original.startTime, "21:30");
});

test("§5: a move without a real date AND time is rejected", () => {
  assert.equal(isCompleteReschedule("2026-09-09", "21:00", "21:30"), true);
  assert.equal(isCompleteReschedule("", "21:00", "21:30"), false, "no date");
  assert.equal(isCompleteReschedule("2026-09-09", "", ""), false, "no time");
  assert.equal(isCompleteReschedule("2026-09-09", "21:30", "21:00"), false, "end before start");
  assert.equal(isCompleteReschedule("9/9", "21:00", "21:30"), false, "malformed date");
});
