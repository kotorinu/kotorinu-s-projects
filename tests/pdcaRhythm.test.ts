import assert from "node:assert/strict";
import { test } from "node:test";
import { findFreeSlot, pdcaRhythm, rhythmIssues } from "../lib/pdcaRhythm";
import { googleCalendarCreateUrl } from "../lib/googleCalendarLink";
import { goals } from "../lib/dummy-data";
import type { CalendarEventDTO } from "../lib/calendarProvider";
import type { Goal } from "../lib/types";

// 2026-10-01 実データの形: 10/9以降、営業代行の枠0時間・週の計画なし・月末の振り返りなし。
const ev = (id: string, date: string, s: string | null, e: string | null, summary: string, colorId: string | null = null): CalendarEventDTO =>
  ({ id, summary, date, startTime: s, endTime: e, colorId, allDay: s === null, description: null });
const october: CalendarEventDTO[] = [];
for (let d = 9; d <= 16; d++) {
  const date = `2026-10-${String(d).padStart(2, "0")}`;
  october.push(ev(`g${d}`, date, "05:30", "06:30", "【朝｜GENESIS深思考】", "3"), ev(`r${d}`, date, "21:30", "22:00", "【RIALA】21:30 状況確認", "10"), ev(`n${d}`, date, "22:00", "23:00", "【夜1h｜実行OS】Fact→原因→優先順位→翌日Calendar確定", "8"));
}
october.push(ev("os", "2026-10-15", "20:30", "21:00", "【AI Work OS｜週次30分】実行管理に直結する修正だけ", "7"));
const nextMonth: Goal = { ...goals.find(g => g.id === "g-1month")!, id: "g-oct", targetDate: "2026-11-01" };
const base = { today: "2026-10-09", events: october, coverageEnd: "2026-10-17", calendarRead: true, goals: [...goals, nextMonth], tasks: [], openTaskIds: new Set<string>(), calendarReviews: {}, goalReviews: {} };

test("実データの形: 営業代行0時間・週の計画なし・月末は未確認・目標にタスクなし・記録なし を指摘する", () => {
  const checks = pdcaRhythm(base);
  const by = Object.fromEntries(checks.map(c => [c.id, c]));
  assert.equal(by.goal.status, "OK");
  assert.equal(by["goal-tasks"].status, "MISSING");
  assert.equal(by.areas.status, "WARN");
  assert.match(by.areas.detail, /営業代行 0時間/);
  assert.match(by.areas.action, /営業代行/);
  assert.equal(by.areas.draft?.verified, true);
  assert.equal(by.weekly.status, "MISSING"); // 「AI Work OS｜週次」は週の計画ではない
  assert.equal(by.weekly.draft?.title, "【週次】今週の振り返り→来週の計画をCalendarへ");
  assert.equal(by.monthly.status, "UNKNOWN");
  assert.equal(by.monthly.draft?.date, "2026-10-31"); // 月末直前の土曜
  assert.equal(by.monthly.draft?.verified, false);
  assert.equal(by.nightly.status, "OK");
  assert.equal(by.check.status, "MISSING");
  assert.ok(rhythmIssues(checks).length >= 5);
});

test("空き枠の案は、既存の予定と重ならず、終日の合宿・旅行の日を避ける", () => {
  const events = [ev("a", "2026-10-10", "09:00", "12:00", "予定"), ev("trip", "2026-10-11", null, null, "北海道")];
  const slot = findFreeSlot(events, "2026-10-10", "2026-10-12", 60, { weekday: ["20:00"], weekend: ["09:00", "13:00"] });
  assert.deepEqual(slot, { title: "", date: "2026-10-10", start: "13:00", end: "14:00" });
  const none = findFreeSlot([ev("trip", "2026-10-11", null, null, "北海道")], "2026-10-11", "2026-10-11", 60, { weekday: ["20:00"], weekend: ["09:00"] });
  assert.equal(none, null);
});

test("週の計画・月末の振り返り・各領域の時間・記録があれば OK", () => {
  const today = "2026-10-27";
  const events = [
    ev("w", "2026-10-31", "09:00", "10:00", "【週次】今週の振り返り→来週の計画", null),
    ev("m", "2026-10-31", "13:00", "16:00", "【月次】10月の振り返り→来月の目標を再設計", null),
    ev("s", "2026-10-28", "19:00", "21:00", "【営業代行】商談準備", "9"),
    ev("rl", "2026-10-28", "21:30", "22:00", "【RIALA】確認", "10"),
    ev("gn", "2026-10-29", "05:30", "06:30", "【朝｜GENESIS深思考】", "3"),
  ];
  const reviews = Object.fromEntries(["20", "21", "22", "23", "24", "25"].map(d => [`2026-10-${d}`, { date: `2026-10-${d}`, blocks: { x: { result: "DONE" as const, reason: null, title: "t", startTime: "19:00", endTime: "20:00", colorId: "9" } }, nextChange: d > "22" ? "朝に移す" : "", savedAt: "" }]));
  const by = Object.fromEntries(pdcaRhythm({ ...base, today, events, coverageEnd: "2026-11-03", calendarReviews: reviews }).map(c => [c.id, c]));
  assert.equal(by.areas.status, "OK"); assert.equal(by.weekly.status, "OK"); assert.equal(by.monthly.status, "OK");
  assert.equal(by.check.status, "OK"); assert.match(by.check.detail, /6\/7日 記録・できた率 100%/);
  assert.equal(by.act.status, "OK");
});

test("Calendarを読めていないときは「未確認」で、問題なしとは言わない", () => {
  const by = Object.fromEntries(pdcaRhythm({ ...base, calendarRead: false, events: [] }).map(c => [c.id, c]));
  assert.equal(by.areas.status, "UNKNOWN"); assert.equal(by.weekly.status, "UNKNOWN");
});

test("期限切れの1か月目標が振り返られていなければ、今月の目標なしとして振り返りへ誘導する", () => {
  const by = Object.fromEntries(pdcaRhythm({ ...base, goals }).map(c => [c.id, c]));
  assert.equal(by.goal.status, "MISSING"); assert.match(by.goal.detail, /振り返られていません（10\/1）/); assert.equal(by.goal.href, "/goals?focus=g-1month");
});

test("Google Calendar作成リンクは JST をUTCに直して、内容入りで開く", () => {
  const url = new URL(googleCalendarCreateUrl({ title: "【週次】計画", date: "2026-10-10", start: "09:00", end: "10:00", details: "完了条件：x" }));
  assert.equal(url.origin + url.pathname, "https://calendar.google.com/calendar/render");
  assert.equal(url.searchParams.get("action"), "TEMPLATE");
  assert.equal(url.searchParams.get("dates"), "20261010T000000Z/20261010T010000Z");
  assert.equal(url.searchParams.get("text"), "【週次】計画");
  assert.equal(url.searchParams.get("details"), "完了条件：x");
});
