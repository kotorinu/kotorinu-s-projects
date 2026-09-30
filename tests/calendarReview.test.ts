import assert from "node:assert/strict";
import { test } from "node:test";
import {
  carriedChange,
  countResults,
  doneRate,
  markBlock,
  reviewableEvents,
  setNextChange,
  validDayReview,
  weeklyCalendarReview,
  type CalendarDayReview,
} from "../lib/calendarReview";
import { validSnapshot } from "../lib/work/execution";
import type { CalendarEventDTO } from "../lib/calendarProvider";

// カレンダーで回すPDCA: P=Calendar, C=○△×, A=明日ひとつ変えること。

const T = "2026-09-30T13:00:00.000Z";
function ev(id: string, date: string, startTime: string | null, summary: string, colorId: string | null = null): CalendarEventDTO {
  return { id, summary, date, startTime, endTime: startTime ? "23:00" : null, colorId, allDay: startTime === null, description: null };
}

test("振り返りの対象は時刻のある予定だけ。睡眠・休憩・予定なし・終日は除く", () => {
  const events = [
    ev("a", "2026-09-30", "19:00", "【営業代行｜水曜60分】", "9"),
    ev("b", "2026-09-30", "05:30", "【朝｜GENESIS深思考】", "3"),
    ev("c", "2026-09-30", "01:00", "【睡眠・回復】"),
    ev("d", "2026-09-30", "15:00", "【休憩】"),
    ev("e", "2026-09-30", null, "【締切メモ】水曜22:30 営業実践"),
    ev("f", "2026-10-01", "07:00", "別の日"),
  ];
  assert.deepEqual(reviewableEvents(events, "2026-09-30").map(e => e.id), ["b", "a"]);
});

test("○は理由を持たない。×は理由を持つ。同じ印をもう一度押すと取り消せる", () => {
  const e = ev("a", "2026-09-30", "19:00", "営業", "9");
  let r = markBlock(undefined, "2026-09-30", e, "MISSED", "TIRED", T);
  assert.equal(r.blocks.a.reason, "TIRED");
  assert.equal(r.blocks.a.title, "営業"); // Calendarが後で変わっても計画が分かる
  r = markBlock(r, "2026-09-30", e, "DONE", "TIRED", T);
  assert.equal(r.blocks.a.reason, null);
  r = markBlock(r, "2026-09-30", e, null, null, T);
  assert.deepEqual(r.blocks, {});
});

test("未記録は数えない。△は半分。記録ゼロは0%ではなくnull", () => {
  assert.equal(doneRate(countResults([])), null);
  const e = (id: string) => ev(id, "2026-09-30", "19:00", id);
  let r = markBlock(undefined, "2026-09-30", e("a"), "DONE", null, T);
  r = markBlock(r, "2026-09-30", e("b"), "PARTIAL", "TOO_BIG", T);
  r = markBlock(r, "2026-09-30", e("c"), "MISSED", "TIRED", T);
  r = markBlock(r, "2026-09-30", e("d"), "MISSED", "TIRED", T);
  assert.equal(doneRate(countResults(Object.values(r.blocks))), 38); // (1+0.5)/4
});

test("週の振り返り: 分野別の率、多かった理由、自分で決めた改善", () => {
  const reviews: Record<string, CalendarDayReview> = {};
  let d1 = markBlock(undefined, "2026-09-29", ev("s1", "2026-09-29", "19:00", "営業", "9"), "DONE", null, T);
  d1 = markBlock(d1, "2026-09-29", ev("r1", "2026-09-29", "20:30", "読書", "5"), "MISSED", "TIRED", T);
  d1 = setNextChange(d1, "2026-09-29", "読書は朝に移す", T);
  let d2 = markBlock(undefined, "2026-09-30", ev("r2", "2026-09-30", "06:30", "読書", "5"), "MISSED", "TIRED", T);
  d2 = markBlock(d2, "2026-09-30", ev("x", "2026-09-30", "10:00", "色なし", null), "MISSED", "OVERRAN", T);
  reviews[d1.date] = d1; reviews[d2.date] = d2;
  reviews["2026-09-20"] = setNextChange(undefined, "2026-09-20", "期間外", T);
  const w = weeklyCalendarReview(reviews, "2026-09-24", "2026-09-30", 7);
  assert.equal(w.reviewedDays, 2);
  assert.deepEqual(w.counts, { done: 1, partial: 0, missed: 3, recorded: 4 });
  assert.equal(w.byArea.find(a => a.area === "営業")?.rate, 100);
  assert.equal(w.byArea.find(a => a.area === "読書")?.rate, 0);
  assert.equal(w.byArea.find(a => a.area === "色なし・その他")?.counts.recorded, 1);
  assert.deepEqual(w.reasons[0], { reason: "TIRED", count: 2 });
  assert.deepEqual(w.changes, [{ date: "2026-09-29", text: "読書は朝に移す" }]);
});

test("昨日決めた改善を今日に持ち越す。空なら出さない", () => {
  const reviews = { "2026-09-29": setNextChange(undefined, "2026-09-29", "  読書は朝に移す ", T), "2026-09-28": setNextChange(undefined, "2026-09-28", "  ", T) };
  assert.equal(carriedChange(reviews, "2026-09-29"), "読書は朝に移す");
  assert.equal(carriedChange(reviews, "2026-09-28"), null);
  assert.equal(carriedChange(reviews, "2026-09-27"), null);
});

test("中央保存の検証: calendarReviews はオブジェクトで、不正な形は拒否する", () => {
  const good = markBlock(undefined, "2026-09-30", ev("a", "2026-09-30", "19:00", "営業"), "MISSED", "TIRED", T);
  assert.equal(validDayReview(good), true);
  assert.equal(validDayReview({ ...good, blocks: { a: { ...good.blocks.a, result: "MAYBE" } } }), false);
  assert.equal(validSnapshot({ currentDate: "2026-09-30", calendarReviews: { "2026-09-30": good } }), true);
  assert.equal(validSnapshot({ currentDate: "2026-09-30", calendarReviews: [] }), false);
});

test("中央保存の検証: 日付キーと中身の日付が食い違う記録は拒否する", () => {
  const good = setNextChange(undefined, "2026-09-30", "朝に移す", T);
  assert.equal(validSnapshot({ currentDate: "2026-09-30", calendarReviews: { "2026-09-29": good } }), false);
  assert.equal(validSnapshot({ currentDate: "2026-09-30", calendarReviews: { "2026-09-30": { date: "2026-09-30" } } }), false);
});
