import assert from "node:assert/strict";
import { test } from "node:test";
import { fakeClock } from "../lib/clock";
import { tasksEffectiveOnDate } from "../lib/dayPlan";
import { activeTimeBlocks, tasks } from "../lib/dummy-data";
import { liveTimeBlocks, supersededByReschedule } from "../lib/livePlan";
import { validatePlan } from "../lib/planValidator";
import { planReschedule } from "../lib/rescheduleCore";
import { completion, makeBlock, makeTask, noOverlays } from "./helpers";

// §41-D / §17 — 置き換え済みブロックが TODAY にも TASK MAP にも出ないこと、
// そして計画の自己矛盾を Validator が検出すること。

const TODAY = "2026-09-09";

test("D: a superseded block never appears in the live plan", () => {
  const target = activeTimeBlocks.find((b) => b.date === "2026-09-09" && b.taskId !== null);
  assert.ok(target, "fixture has a 9/9 block");

  const plan = planReschedule({
    taskId: target.taskId as string,
    taskTitle: target.label,
    planBlocks: activeTimeBlocks,
    today: TODAY,
    date: "2026-09-11",
    startTime: "20:00",
    endTime: "21:00",
    reason: "9/11へ",
    nowIso: "2026-09-09T07:27:00+09:00",
  });
  const overlays = { [plan.block.id]: plan.block };
  const superseded = new Set([target.id]);

  const live = liveTimeBlocks({ timeBlockOverrides: overlays, supersededBlockIds: superseded });
  assert.equal(live.some((b) => b.id === target.id), false, "not in the live plan");
  assert.equal(
    live.filter((b) => b.date === TODAY).some((b) => b.id === target.id),
    false,
    "not on TODAY"
  );

  const history = supersededByReschedule({ timeBlockOverrides: overlays, supersededBlockIds: superseded });
  const kept = history.find((b) => b.id === target.id);
  assert.ok(kept, "kept as history — nothing is deleted");
  assert.equal(kept.lifecycle, "SUPERSEDED");
});

test("D: the live plan for a date is sorted and free of duplicates", () => {
  const live = liveTimeBlocks({ timeBlockOverrides: {}, supersededBlockIds: new Set() });
  const ids = live.map((b) => b.id);
  assert.equal(new Set(ids).size, ids.length, "no duplicate block ids");
  for (let i = 1; i < live.length; i++) {
    const prev = live[i - 1].date + live[i - 1].startTime;
    const cur = live[i].date + live[i].startTime;
    assert.ok(prev <= cur, `blocks out of order at ${i}`);
  }
});

test("§17: the shipped fixture plan has no consistency errors", () => {
  const live = liveTimeBlocks({ timeBlockOverrides: {}, supersededBlockIds: new Set() });
  const issues = validatePlan(tasks, live, noOverlays(), fakeClock(TODAY, "07:27"));
  const summary = issues.map((i) => `${i.code} ${i.taskTitle}: ${i.detail}`).join("\n");
  assert.deepEqual(issues, [], `plan is inconsistent:\n${summary}`);
});

test("§17: a superseded block left in the plan is an ERROR", () => {
  const stale = makeBlock({
    id: "b-stale",
    taskId: "t-x",
    date: TODAY,
    startTime: "19:00",
    endTime: "20:00",
    lifecycle: "SUPERSEDED",
  });
  const task = makeTask({ id: "t-x", title: "テスト", area: "営業代行" });
  const issues = validatePlan([task], [stale], noOverlays(), fakeClock(TODAY, "07:27"));
  assert.ok(issues.some((i) => i.code === "SUPERSEDED_BLOCK_IN_PLAN"));
});

test("§17: two live blocks on the same day for one task is an ERROR", () => {
  const task = makeTask({ id: "t-x", title: "テスト", area: "営業代行" });
  const a = makeBlock({ id: "b-a", taskId: "t-x", date: TODAY, startTime: "19:00", endTime: "20:00" });
  const b = makeBlock({ id: "b-b", taskId: "t-x", date: TODAY, startTime: "20:00", endTime: "21:00" });
  const issues = validatePlan([task], [a, b], noOverlays(), fakeClock(TODAY, "07:27"));
  assert.ok(issues.some((i) => i.code === "MULTIPLE_ACTIVE_BLOCKS"));
});

test("§17: a work date that disagrees with the block date is an ERROR", () => {
  const task = makeTask({ id: "t-x", title: "テスト", area: "営業代行", workDate: TODAY });
  const block = makeBlock({ id: "b-a", taskId: "t-x", date: "2026-09-11", startTime: "19:00", endTime: "20:00" });
  const issues = validatePlan([task], [block], noOverlays(), fakeClock(TODAY, "07:27"));
  assert.ok(issues.some((i) => i.code === "WORKDATE_BLOCK_MISMATCH"));
});

test("§17: a DONE task still holding a future block is an ERROR", () => {
  const task = makeTask({ id: "t-x", title: "テスト", area: "営業代行" });
  const block = makeBlock({ id: "b-a", taskId: "t-x", date: "2026-09-11", startTime: "19:00", endTime: "20:00" });
  const overlays = noOverlays();
  overlays.completions["t-x"] = completion("t-x", TODAY);
  const issues = validatePlan([task], [block], overlays, fakeClock(TODAY, "07:27"));
  assert.ok(issues.some((i) => i.code === "DONE_TASK_SCHEDULED"));
});

test("§17: a DONE task keeping its PAST block is fine — that is history", () => {
  const task = makeTask({ id: "t-x", title: "テスト", area: "営業代行" });
  const block = makeBlock({ id: "b-a", taskId: "t-x", date: "2026-09-08", startTime: "19:00", endTime: "20:00" });
  const overlays = noOverlays();
  overlays.completions["t-x"] = completion("t-x", "2026-09-08");
  const issues = validatePlan([task], [block], overlays, fakeClock(TODAY, "07:27"));
  assert.deepEqual(issues, []);
});

test("§17: after a real reschedule the plan is still consistent", () => {
  const target = activeTimeBlocks.find((b) => b.id === "tb-0909-sales-17phase-v1") ??
    activeTimeBlocks.find((b) => b.date === "2026-09-09" && b.taskId !== null);
  assert.ok(target);
  const plan = planReschedule({
    taskId: target.taskId as string,
    taskTitle: target.label,
    planBlocks: activeTimeBlocks,
    today: TODAY,
    date: "2026-09-10",
    startTime: "20:00",
    endTime: "21:00",
    reason: "翌日へ",
    nowIso: "2026-09-09T21:00:00+09:00",
  });
  const live = liveTimeBlocks({
    timeBlockOverrides: { [plan.block.id]: plan.block },
    supersededBlockIds: new Set([target.id]),
  });
  const overlays = noOverlays();
  overlays.workDateOverrides[target.taskId as string] = plan.workDate;

  const issues = validatePlan(tasks, live, overlays, fakeClock(TODAY, "21:00"));
  const summary = issues.map((i) => `${i.code} ${i.taskTitle}: ${i.detail}`).join("\n");
  assert.deepEqual(issues, [], `reschedule broke plan consistency:\n${summary}`);

  // …and the moved task really is gone from today.
  const onToday = tasksEffectiveOnDate(TODAY, tasks, live, overlays.workDateOverrides);
  assert.equal(onToday.some((t) => t.id === target.taskId), false);
});
