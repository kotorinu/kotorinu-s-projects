import assert from "node:assert/strict";
import { test } from "node:test";
import { goalsDueForReview, splitCriteria, startGoalReview, suggestedGoalStatus, summarizeGoalReview, validGoalReview } from "../lib/goalReview";
import { validSnapshot } from "../lib/work/execution";
import { goals } from "../lib/dummy-data";
import type { Goal } from "../lib/types";

// 1か月目標（期限 2026-10-01）の振り返り。判定は本人、根拠の無い達成は作らない。
const T = "2026-09-30T13:00:00.000Z";
const month = goals.find(g => g.id === "g-1month")!;

test("達成基準を1行ずつに分ける（先頭の・や番号は外す）", () => {
  assert.deepEqual(splitCriteria("・成約1件\n\n2. 基準値\n- 5つの力"), ["成約1件", "基準値", "5つの力"]);
  assert.equal(splitCriteria(month.achievementCriteria).length, 4);
});

test("未判定が残る間は状態の案を出さない。全達成でも事実が無ければ「達成」にしない", () => {
  const r = startGoalReview(month, undefined, T);
  assert.equal(suggestedGoalStatus(summarizeGoalReview(r)), null);
  r.criteria.forEach(c => { c.result = "MET"; });
  const s = summarizeGoalReview(r);
  assert.equal(s.metWithoutFact, 4);
  assert.equal(suggestedGoalStatus(s), "未達成");
  r.criteria.forEach(c => { c.fact = "確認できる事実"; });
  assert.equal(suggestedGoalStatus(summarizeGoalReview(r)), "達成");
  r.criteria[0].result = "NOT_MET";
  assert.equal(suggestedGoalStatus(summarizeGoalReview(r)), "未達成");
});

test("保存済みの判定は引き継ぎ、文面が変わった基準は未判定に戻す", () => {
  const first = startGoalReview(month, undefined, T);
  first.criteria[0].result = "NOT_MET"; first.criteria[0].fact = "成約0件";
  const edited: Goal = { ...month, achievementCriteria: month.achievementCriteria.replace("5つの力", "3つの力") };
  const again = startGoalReview(edited, first, T);
  assert.equal(again.criteria[0].result, "NOT_MET");
  assert.equal(again.criteria[0].fact, "成約0件");
  assert.equal(again.criteria.find(c => c.text.includes("3つの力"))?.result, null);
});

test("期限の2日前〜14日後までの1か月目標を、振り返り前だけ知らせる", () => {
  assert.deepEqual(goalsDueForReview(goals, {}, "2026-09-30").map(g => g.id), ["g-1month"]);
  assert.deepEqual(goalsDueForReview(goals, {}, "2026-09-20").map(g => g.id), []);
  const r = startGoalReview(month, undefined, T);
  assert.deepEqual(goalsDueForReview(goals, { "g-1month": r }, "2026-10-01").map(g => g.id), []);
  assert.deepEqual(goalsDueForReview([{ ...month, status: "未達成" }], {}, "2026-10-01"), []);
});

test("中央保存の検証: goalReviews は goalId キーと中身が一致する形だけ受け付ける", () => {
  const r = startGoalReview(month, undefined, T);
  assert.equal(validGoalReview(r), true);
  assert.equal(validSnapshot({ currentDate: "2026-09-30", goalReviews: { "g-1month": r } }), true);
  assert.equal(validSnapshot({ currentDate: "2026-09-30", goalReviews: { other: r } }), false);
  assert.equal(validSnapshot({ currentDate: "2026-09-30", goalReviews: { "g-1month": { ...r, criteria: [{ text: "x", result: "YES", fact: "", reason: "" }] } } }), false);
});

test("届かなかった原因を集計し、次の目標の下書きに変え方を入れる", async () => {
  const { missCauses, nextGoalNotes } = await import("../lib/goalReview");
  const r = startGoalReview(month, undefined, T);
  r.criteria[0].result = "NOT_MET"; r.criteria[0].cause = "NO_TIME";
  r.criteria[1].result = "NOT_MET"; r.criteria[1].cause = "WAITING";
  r.criteria[2].result = "PARTIAL"; r.criteria[2].cause = "NO_TIME";
  r.criteria[3].result = "MET"; r.criteria[3].cause = "ENERGY"; // 達成は数えない
  r.next = "営業の枠を毎週先に取る";
  assert.deepEqual(missCauses(r), [{ cause: "NO_TIME", count: 2 }, { cause: "WAITING", count: 1 }]);
  const notes = nextGoalNotes(r);
  assert.match(notes, /^営業の枠を毎週先に取る/);
  assert.match(notes, /時間を毎週Calendarに先に入れる.*前回: 時間をCalendarに入れていなかった 2件/);
  assert.equal(validGoalReview(r), true);
  assert.equal(validGoalReview({ ...r, criteria: [{ ...r.criteria[0], cause: "LAZY" }] }), false);
});
