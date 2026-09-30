import assert from "node:assert/strict";
import { test } from "node:test";
import { calendarHealth, needsAction } from "../lib/calendarHealth";
import type { CalendarEventDTO } from "../lib/calendarProvider";

// カレンダー点検。2026-09-16〜10-07 の実データで見つかった形を再現する
// （予定名は一般化してある）。

let seq = 0;
function ev(date: string, startTime: string | null, endTime: string | null, summary = "予定"): CalendarEventDTO {
  return { id: `e${++seq}`, summary, date, startTime, endTime, colorId: null, allDay: startTime === null, description: null };
}
const range = { today: "2026-10-01", coverageStart: "2026-09-30", coverageEnd: "2026-10-02" };

test("同じ開始時刻の2予定は DUPLICATE（9/24 施術の二重登録）", () => {
  const issues = calendarHealth({ ...range, events: [ev("2026-10-01", "19:00", "20:00", "施術"), ev("2026-10-01", "19:00", "19:45", "[予約]施術")] });
  assert.deepEqual(issues.map(i => i.kind), ["DUPLICATE"]);
  assert.match(issues[0].detail, /10\/1 19:00 に2つの予定/);
});

test("一部だけ重なる予定は OVERLAP、要対応", () => {
  const issues = calendarHealth({ ...range, events: [ev("2026-10-01", "21:00", "22:00", "ロープレ"), ev("2026-10-01", "21:30", "22:00", "RIALA確認")] });
  assert.equal(issues.length, 1);
  assert.equal(issues[0].kind, "OVERLAP");
  // 21:00-22:00 に 21:30-22:00 は内側に収まる
  assert.equal(issues[0].contained, true);
  const partial = calendarHealth({ ...range, events: [ev("2026-10-01", "14:00", "15:00", "外出"), ev("2026-10-01", "14:45", "15:45", "準備")] });
  assert.equal(partial[0].contained, false);
  assert.match(partial[0].detail, /14:45-15:00 で重なっています/);
  assert.equal(needsAction(partial).length, 1);
});

test("内側に収まる枠（Catch-up内30分）は確認扱いで、要対応に数えない", () => {
  const issues = calendarHealth({ ...range, events: [ev("2026-10-01", "11:30", "12:30", "昼 Catch-up"), ev("2026-10-01", "11:50", "12:20", "RIALA DM")] });
  assert.equal(issues.length, 1);
  assert.equal(issues[0].contained, true);
  assert.equal(needsAction(issues).length, 0);
});

test("終了=開始の隣接や終日予定は重なりではない", () => {
  const issues = calendarHealth({ ...range, events: [
    ev("2026-10-01", "21:30", "22:00"), ev("2026-10-01", "22:00", "22:30"), ev("2026-10-01", null, null, "締切"), ev("2026-10-01", "08:00", "09:00"),
  ] });
  assert.deepEqual(issues, []);
});

test("深夜まで予定があり翌朝が早いと SHORT_REST（日付またぎの分割にも対応）", () => {
  const issues = calendarHealth({ ...range, events: [
    ev("2026-10-01", "22:55", "24:00", "営業"), ev("2026-10-02", "00:00", "01:25", "営業"),
    ev("2026-10-02", "01:25", "05:30", "【睡眠・回復】"), ev("2026-10-02", "05:30", "06:30", "朝の営業"),
  ] });
  const rest = issues.filter(i => i.kind === "SHORT_REST");
  assert.equal(rest.length, 1);
  assert.equal(rest[0].date, "2026-10-01");
  // 睡眠枠は予定として数えない: 01:25 → 05:30 = 4時間5分
  assert.match(rest[0].detail, /空きは 4時間5分/);
  assert.match(rest[0].detail, /翌朝 朝の営業 の開始 05:30/);
});

test("22:30終了→翌5:30開始の7時間は問題にしない", () => {
  const issues = calendarHealth({ ...range, events: [ev("2026-10-01", "22:00", "22:30", "日報"), ev("2026-10-02", "05:30", "06:30", "朝")] });
  assert.deepEqual(issues, []);
});

test("今日より前・読めた範囲の外は判定しない", () => {
  const issues = calendarHealth({ ...range, events: [
    ev("2026-09-30", "19:00", "20:00"), ev("2026-09-30", "19:00", "19:30"), // 昨日の重複
    ev("2026-10-02", "23:30", "24:00"), // 翌日(10/3)は範囲外なので休息は判定できない
  ] });
  assert.deepEqual(issues, []);
});

test("【予定なし】のような空き枠は、夜の予定として数えない", () => {
  const issues = calendarHealth({ ...range, events: [ev("2026-10-01", "18:00", "24:00", "【予定なし】土曜18時〜日曜終日"), ev("2026-10-02", "00:00", "24:00", "【予定なし】土曜18時〜日曜終日")] });
  assert.deepEqual(issues, []);
});

test("Gmailの予約メールから自動で作られた予定との重なりは数えない（Calendarから消せないため）", () => {
  const own = ev("2026-10-01", "18:30", "21:00", "18:30 品川マグロ");
  const auto = { ...ev("2026-10-01", "18:30", "19:30", "Reservation at マグロ"), fromGmail: true };
  assert.deepEqual(calendarHealth({ ...range, events: [own, auto] }), []);
});
