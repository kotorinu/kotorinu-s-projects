import assert from "node:assert/strict";
import { test } from "node:test";
import { isSalesEvent, nowAndNext } from "../lib/nowEvent";
import { makeTask } from "./helpers";
import type { CalendarEventDTO } from "../lib/calendarProvider";

const ev = (id: string, s: string, e: string, summary: string, colorId: string | null = null, description: string | null = null): CalendarEventDTO =>
  ({ id, summary, date: "2026-10-01", startTime: s, endTime: e, colorId, allDay: false, description });
const events = [
  ev("a", "07:00", "08:00", "【合宿準備】問題解決フロー", "3", "完了条件：手順が明確／資料が完成"),
  ev("b", "11:30", "12:30", "【昼｜Catch-up】"),
  ev("c", "19:00", "20:00", "【営業代行①】ヒアリングのゴール設定", "9", "完了条件：アプリに全部入っている"),
  ev("d", "20:00", "21:00", "【営業代行②】予定不調和スクリプト", "9"),
  ev("s", "01:00", "05:00", "【睡眠・回復】"),
];

test("いまの予定と次の予定を、完了条件・残り時間つきで返す（睡眠は除く）", () => {
  const r = nowAndNext(events, "2026-10-01", "19:20", [makeTask({ id: "t", title: "x", area: "営業代行", contextTags: ["calendar:c"] })]);
  assert.equal(r.current?.event.id, "c"); assert.equal(r.current?.minutesLeft, 40);
  assert.deepEqual(r.current?.criteria, ["アプリに全部入っている"]); assert.equal(r.current?.task?.id, "t");
  assert.equal(r.next?.event.id, "d"); assert.equal(r.next?.minutesUntil, 40);
  assert.deepEqual(r.ended.map(e => e.id), ["a", "b"]); assert.equal(r.total, 4);
});

test("予定の合間は current なし・next あり。全部終わったら両方なし", () => {
  const gap = nowAndNext(events, "2026-10-01", "15:00", []);
  assert.equal(gap.current, null); assert.equal(gap.next?.event.id, "c"); assert.equal(gap.next?.minutesUntil, 240);
  const done = nowAndNext(events, "2026-10-01", "23:00", []);
  assert.equal(done.current, null); assert.equal(done.next, null); assert.equal(done.ended.length, 4);
});

test("営業代行の予定を見分ける（色9・予定名）", () => {
  assert.equal(isSalesEvent(events[2]), true);
  assert.equal(isSalesEvent(ev("r", "08:00", "09:00", "ロープレ本番", "11")), true);
  assert.equal(isSalesEvent(events[0]), false);
});
