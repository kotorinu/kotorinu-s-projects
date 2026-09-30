import test from "node:test";
import assert from "node:assert/strict";
import { initialLedger, mutateWork, WorkConflict } from "../lib/work/model";

// 2026-09-30 本人の依頼で、今あるタスクを一旦すべて片付ける。
// 削除ではなくアーカイブ: 履歴は残り、1件ずつ戻せる。
const now = "2026-09-30T12:00:00.000Z";
const openOf = (l: ReturnType<typeof initialLedger>) => l.tasks.filter(t => !["完了", "Archive"].includes(t.status) && ["ACTIVE", "BACKLOG"].includes(t.lifecycle));

test("一括整理: 画面で見た件数と一致したときだけ、未完了タスクをアーカイブする", () => {
  const l = initialLedger();
  mutateWork(l, { command: "createTask", version: 0, title: "残っているタスク" }, now, "t-new");
  const total = l.tasks.length; const open = openOf(l).length; const done = l.tasks.filter(t => t.status === "完了").length;
  assert.ok(open > 0);
  assert.throws(() => mutateWork(l, { command: "archiveOpenTasks", version: 0, expectedCount: open + 1 }, now, "a"), WorkConflict);
  assert.equal(openOf(l).length, open);
  mutateWork(l, { command: "archiveOpenTasks", version: 0, expectedCount: open }, now, "a");
  assert.equal(openOf(l).length, 0);
  assert.equal(l.tasks.length, total); // 1件も消していない
  assert.equal(l.tasks.filter(t => t.status === "完了").length, done); // 完了済みはそのまま
  const archived = l.tasks.find(t => t.id === "t-new")!;
  assert.equal(archived.lifecycle, "ARCHIVED");
  assert.equal(archived.lifecycleReason, "2026-09-30 一括整理（本人の依頼）");
  assert.equal(l.audit.at(-1)?.operation, "archiveOpenTasks");
});

test("アーカイブしたタスクは、状態を戻すと一覧（日時未定）へ戻る", () => {
  const l = initialLedger();
  mutateWork(l, { command: "createTask", version: 0, title: "戻すタスク" }, now, "t-back");
  mutateWork(l, { command: "archiveOpenTasks", version: 0, expectedCount: openOf(l).length }, now, "a");
  mutateWork(l, { command: "updateTask", version: 0, id: "t-back", status: "未着手" }, now, "u");
  const t = l.tasks.find(x => x.id === "t-back")!;
  assert.equal(t.status, "未着手"); assert.equal(t.lifecycle, "BACKLOG");
});

// 2026-10-01: 読書以外をまとめて完了 / Calendarの予定からタスクを作る。
test("まとめて完了: 選んだタスクだけ完了にし、本人申告と記録する。状態が変わっていれば止める", () => {
  const l = initialLedger();
  mutateWork(l, { command: "createTask", version: 0, title: "営業の準備" }, now, "t-a");
  mutateWork(l, { command: "createTask", version: 0, title: "【読書】地頭力を鍛える" }, now, "t-r");
  mutateWork(l, { command: "completeTasks", version: 0, ids: ["t-a"] }, now, "c");
  const a = l.tasks.find(t => t.id === "t-a")!, r = l.tasks.find(t => t.id === "t-r")!;
  assert.equal(a.status, "完了"); assert.equal(a.completedAt, now); assert.match(a.notes ?? "", /本人の申告でまとめて完了/);
  assert.equal(r.status, "未着手");
  assert.throws(() => mutateWork(l, { command: "completeTasks", version: 0, ids: ["t-a", "t-r"] }, now, "c2"), WorkConflict);
  assert.equal(r.status, "未着手");
  assert.throws(() => mutateWork(l, { command: "completeTasks", version: 0, ids: [] }, now, "c3"));
});

test("まとめて完了: AIの成果物確認が済んでいないタスクは完了にしない", () => {
  const l = initialLedger();
  mutateWork(l, { command: "createTask", version: 0, title: "AI下書き", description: "入力", definitionOfDone: ["成果物"], aiCapability: "AI_DRAFT" }, now, "t-ai");
  assert.throws(() => mutateWork(l, { command: "completeTasks", version: 0, ids: ["t-ai"] }, now, "c"), /AIの成果物確認/);
  assert.equal(l.tasks.find(t => t.id === "t-ai")!.status, "未着手");
});

test("Calendarの予定から作ったタスクは予定IDを持ち、同じ予定は二重に取り込めない", () => {
  const l = initialLedger();
  mutateWork(l, { command: "createTask", version: 0, title: "【合宿準備】印刷に行く", deadline: "2026-10-02", workDate: "2026-10-02", estimateMinutes: 30, calendarEventId: "ev-print" }, now, "t-c");
  const t = l.tasks.find(x => x.id === "t-c")!;
  assert.deepEqual(t.contextTags, ["calendar:ev-print"]); assert.equal(t.workDate, "2026-10-02"); assert.equal(t.estimateMinutes, 30);
  assert.equal(t.lifecycleReason, "Google Calendarの予定から作成");
  assert.throws(() => mutateWork(l, { command: "createTask", version: 0, title: "もう一度", calendarEventId: "ev-print" }, now, "t-c2"), WorkConflict);
});

test("まとめて作成: 全件作るか1件も作らない（途中に取り込み済みがあれば全体を止める）", () => {
  const l = initialLedger(); const count = l.tasks.length;
  mutateWork(l, { command: "createTasks", version: 0, tasks: [{ title: "A", calendarEventId: "e1" }, { title: "B", calendarEventId: "e2" }] }, now, "b1");
  assert.equal(l.tasks.length, count + 2);
  assert.throws(() => mutateWork(l, { command: "createTasks", version: 0, tasks: [{ title: "C", calendarEventId: "e3" }, { title: "A again", calendarEventId: "e1" }] }, now, "b2"), WorkConflict);
  assert.equal(l.tasks.length, count + 2);
  assert.throws(() => mutateWork(l, { command: "createTasks", version: 0, tasks: [{ title: "D", calendarEventId: "e4" }, { title: "D2", calendarEventId: "e4" }] }, now, "b3"), WorkConflict);
  assert.throws(() => mutateWork(l, { command: "createTasks", version: 0, tasks: [] }, now, "b4"));
});
