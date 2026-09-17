import test from "node:test";
import assert from "node:assert/strict";
import { initialLedger, createTask } from "../lib/work/model";
import { workCoverage } from "../lib/work/coverage";
test("Coverage distinguishes missing goal references and criteria from overdue tasks", () => {
  const task = createTask({ title: "確認", goalId: "missing", deadline: "2026-09-17" }, "t", "2026-09-18T00:00:00Z");
  const c = workCoverage([task], [], [], "2026-09-18");
  assert.equal(c.unlinked.length, 1); assert.equal(c.noCriteria.length, 1); assert.equal(c.overdue.length, 1);
  assert.equal(workCoverage([{ ...task, deadline: null }], [], [], "2026-09-18").overdue.length, 0);
});
test("Coverage excludes historical and completed work from current gaps and AI decisions", () => {
  const l = initialLedger(); const task = createTask({ title: "確認" }, "t", "2026-09-18T00:00:00Z");
  const run = { ...l.runs[0], taskId: "t", status: "REVIEW" as const };
  assert.equal(workCoverage([{ ...task, status: "完了" }], [], [run], "2026-09-18").review.length, 0);
  assert.equal(workCoverage([{ ...task, lifecycle: "SUPERSEDED" }], [], [], "2026-09-18").pending.length, 0);
});
test("Coverage reports direct-task gaps without claiming a parent goal failed", () => {
  const goal = { ...initialLedger().goals[0], id: "g", status: "進行中" as const, achievementCriteria: "基準" };
  const c = workCoverage([], [goal], [], "2026-09-18");
  assert.equal(c.goalsWithoutWork.length, 1); assert.equal(c.goalsWithoutCriteria.length, 0);
  assert.equal(goal.status, "進行中");
});
