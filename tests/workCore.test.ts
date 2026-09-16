import test from "node:test";
import assert from "node:assert/strict";
import { initialLedger, mutateWork, createTask, WorkConflict, ymd, decodeWork } from "../lib/work/model";
import { validSnapshot, decodeExecution } from "../lib/work/execution";
const now = "2026-09-17T01:00:00.000Z";
test("Work core: unknown dates and estimates stay null, unscheduled tasks stay BACKLOG", () => {
  const t = createTask({ title: "確認済みタスク" }, "new", now);
  assert.equal(t.deadline, null); assert.equal(t.estimateMinutes, null); assert.equal(t.workDate, null); assert.equal(t.lifecycle, "BACKLOG");
  assert.throws(() => ymd("2026-02-30"));
});
test("Work core: entity writes preserve initial approved data and reject stale writers", () => {
  const l = initialLedger(); const count = l.tasks.length;
  mutateWork(l, { command: "createTask", version: 0, title: "実タスク" }, now, "task");
  assert.equal(l.tasks.length, count + 1);
  l.version++;
  assert.throws(() => mutateWork(l, { command: "createTask", version: 0, title: "古い更新" }, now, "other"), WorkConflict);
  assert.equal(l.tasks.length, count + 1);
  const reopened = decodeWork(JSON.stringify(l)); assert.equal(reopened.tasks.at(-1)?.title, "実タスク");
});
test("Work core: goals require criteria and task links must point at existing goals", () => {
  const l = initialLedger();
  assert.throws(() => mutateWork(l, { command: "createGoal", version: 0, title: "目標", desiredState: "状態" }, now, "g"));
  mutateWork(l, { command: "createGoal", version: 0, title: "目標", desiredState: "状態", achievementCriteria: "基準" }, now, "g");
  mutateWork(l, { command: "createTask", version: 0, title: "行動", goalId: "g" }, now, "t");
  assert.equal(l.tasks.at(-1)?.goalId, "g");
  assert.throws(() => mutateWork(l, { command: "createTask", version: 0, title: "行動", goalId: "missing" }, now, "bad"));
});
test("Work core: retrying an uncertain create with the same request does not duplicate the task", () => {
  const l = initialLedger(); const body = { command: "createTask", version: 0, requestId: "same-request", title: "実タスク" };
  const count = l.tasks.length; mutateWork(l, body, now, "one"); l.version++;
  const replay = mutateWork(l, body, now, "two");
  assert.equal(l.tasks.length, count + 1); assert.ok("replayed" in replay && replay.replayed);
  assert.throws(() => mutateWork(l, { ...body, title: "違う内容" }, now, "three"), WorkConflict);
});
test("Work core: AI draft is queued, claimed once, reviewed with evidence; human task remains open", () => {
  const l = initialLedger();
  mutateWork(l, { command: "createTask", version: 0, title: "下書き", description: "確認済みの文面", definitionOfDone: ["根拠あり"], aiCapability: "AI_DRAFT" }, now, "t");
  assert.equal(l.runs.at(-1)?.status, "QUEUED");
  mutateWork(l, { command: "claim", version: 0, provider: "fixture", taskId: "t" }, now, "claim");
  assert.equal(l.runs.at(-1)?.claim, "claim");
  assert.deepEqual(mutateWork(l, { command: "claim", version: 0, provider: "other", taskId: "t" }, now, "other"), { run: null });
  assert.throws(() => mutateWork(l, { command: "result", version: 0, id: "t:run", claim: "other", output: "bad" }, now, "result"));
  mutateWork(l, { command: "result", version: 0, id: "t:run", claim: "claim", output: "下書き", evidence: ["確認済み入力"] }, now, "result");
  assert.equal(l.tasks.at(-1)?.aiStatus, "人間確認待ち");
  assert.throws(() => mutateWork(l, { command: "accept", version: 0, id: "t:run" }, now, "accept"));
  mutateWork(l, { command: "accept", version: 0, id: "t:run", factsChecked: true }, now, "accept");
  assert.equal(l.tasks.at(-1)?.status, "未着手"); assert.equal(l.runs.at(-1)?.status, "ACCEPTED");
});
test("Work core: missing input blocks AI, expired lease never silently re-executes", () => {
  const l = initialLedger();
  mutateWork(l, { command: "createTask", version: 0, title: "情報不足", aiCapability: "AI_EXECUTE" }, now, "t");
  mutateWork(l, { command: "claim", version: 0, provider: "fixture", taskId: "t" }, now, "claim");
  assert.equal(l.runs.at(-1)?.status, "BLOCKED");
  assert.equal(l.tasks.at(-1)?.status, "未着手");
  const l2 = initialLedger();
  mutateWork(l2, { command: "createTask", version: 0, title: "実行", description: "入力", definitionOfDone: ["確認"], aiCapability: "AI_EXECUTE" }, now, "t");
  mutateWork(l2, { command: "claim", version: 0, provider: "fixture", taskId: "t" }, now, "claim");
  assert.throws(() => mutateWork(l2, { command: "result", version: 0, id: "t:run", claim: "claim", output: "遅い" }, "2026-09-17T02:00:00.000Z", "result"));
  assert.equal(l2.runs.at(-1)?.status, "RUNNING");
});
test("Work core: execution snapshot decoder rejects corrupt tuple and preserves history", () => {
  assert.equal(validSnapshot({ currentDate: "2026-09-17", taskStartedAt: ["bad"] }), false);
  const snapshot = { currentDate: "2026-09-17", done: ["t"], history: { "2026-09-16": { completedTaskIds: ["old"] } } };
  const record = decodeExecution(JSON.stringify({ version: 2, snapshot, updatedAt: now }));
  assert.deepEqual(record.snapshot, snapshot);
});
