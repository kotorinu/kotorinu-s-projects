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
