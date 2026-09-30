import assert from "node:assert/strict";
import { test } from "node:test";
import { calendarTaskDrafts, completionCriteria, createTaskBody, KEEP_OPEN_BY_DEFAULT } from "../lib/calendarTasks";
import type { CalendarEventDTO } from "../lib/calendarProvider";

// 2026-10-01: Google Calendarの予定から、完了条件つきのタスクを作る。
const ev = (id: string, date: string, s: string | null, e: string | null, summary: string, colorId: string | null, description: string | null): CalendarEventDTO =>
  ({ id, summary, date, startTime: s, endTime: e, colorId, allDay: s === null, description });

test("説明の「完了条件：」を取り出す（HTML・「／」区切りにも対応）", () => {
  assert.deepEqual(completionCriteria("<p>やること</p>\n<p>完了条件：手順が明確／資料が完成している（この2つ）。</p>"), ["手順が明確", "資料が完成している（この2つ）。"]);
  assert.deepEqual(completionCriteria(null), []);
  assert.deepEqual(completionCriteria("説明だけ"), []);
});

test("予定→タスク案: 色で領域、時間で見積り、定型枠と取り込み済み・過去・終日は選ばない", () => {
  const events = [
    ev("a", "2026-10-01", "20:00", "21:00", "【営業代行②】予定不調和スクリプト", "9", "完了条件：スクリプトが1本できている。"),
    ev("b", "2026-10-01", "07:00", "08:00", "【合宿準備】問題解決フロー", "3", "完了条件：手順が明確／資料が完成"),
    ev("c", "2026-10-01", "22:00", "22:30", "【日報｜毎日マスト】", "3", "完了条件：4項目を書く"),
    ev("d", "2026-10-01", "11:30", "12:30", "予定のみ", null, null),
    ev("e", "2026-09-30", "19:00", "20:00", "昨日", "9", "完了条件：x"),
    ev("f", "2026-10-02", null, null, "締切", null, "完了条件：x"),
    ev("g", "2026-10-02", "21:00", "21:30", "取り込み済み", "3", "完了条件：x"),
  ];
  const drafts = calendarTaskDrafts(events, new Set(["calendar:g"]), "2026-10-01");
  assert.deepEqual(drafts.map(d => d.event.id), ["b", "d", "a", "c"]);
  const byId = Object.fromEntries(drafts.map(d => [d.event.id, d]));
  assert.equal(byId.a.area, "営業代行"); assert.equal(byId.b.area, "GENESIS"); assert.equal(byId.d.area, "その他");
  assert.equal(byId.a.estimateMinutes, 60);
  const roleplay = calendarTaskDrafts([ev("r", "2026-10-03", "08:00", "09:00", "【営業代行】ロープレ本番", "11", null)], new Set(), "2026-10-01");
  assert.equal(roleplay[0].area, "営業代行");
  assert.deepEqual(drafts.filter(d => d.suggested).map(d => d.event.id), ["b", "a"]);
  const body = createTaskBody(byId.d, "g-1");
  assert.deepEqual(body.definitionOfDone, ["11:30-12:30 の予定を実行した"]);
  assert.equal(body.calendarEventId, "d"); assert.equal(body.goalId, "g-1"); assert.equal(body.deadline, "2026-10-01");
});

test("まとめて完了の初期状態: 地頭力・鬼速PDCAは外しておく", () => {
  assert.equal(KEEP_OPEN_BY_DEFAULT.test("【読書】地頭力を鍛える｜p201-230"), true);
  assert.equal(KEEP_OPEN_BY_DEFAULT.test("【読書】鬼速PDCA｜p1-50"), true);
  assert.equal(KEEP_OPEN_BY_DEFAULT.test("営業スクリプトの自分版"), false);
});
