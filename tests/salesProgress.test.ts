import assert from "node:assert/strict";
import { test } from "node:test";
import { currentMilestone, fillOptions, meetingsNeeded, milestoneStatuses, reward, sumBetween, validSaleRecord, yen, type SaleRecord } from "../lib/salesProgress";

// 2026-10-10 本人の逆算: 報酬率20%。10月 契約5万→報酬1万、11月 契約25万→報酬5万、
// 12/8 直近30日（11/9〜）で契約50万→報酬10万。
const rec = (id: string, date: string, amount: number, kind: SaleRecord["kind"] = "PORTFOLIO"): SaleRecord => ({ id, date, amount, kind, note: "", recordedAt: "x" });

test("報酬は契約金額の20%", () => {
  assert.equal(reward(50000), 10000); assert.equal(reward(250000), 50000); assert.equal(reward(500000), 100000);
});

test("到達基準: 期間内の契約だけを数え、いま追う基準は期限の早い未達", () => {
  const records = [rec("a", "2026-09-30", 79800), rec("b", "2026-10-12", 29800)];
  const st = milestoneStatuses(records, "2026-10-15");
  const oct = st.find(s => s.milestone.id === "oct")!;
  assert.equal(oct.achieved, 29800); assert.equal(oct.remaining, 20200); assert.equal(oct.daysLeft, 17);
  assert.equal(st.find(s => s.milestone.id === "oct-w1")!.done, true); // 29,800円で第1週の2.5万円は達成
  assert.equal(currentMilestone(st)?.milestone.id, "oct");
  const later = milestoneStatuses([...records, rec("c", "2026-10-20", 49800)], "2026-10-22");
  assert.equal(later.find(s => s.milestone.id === "oct")!.done, true);
  assert.equal(currentMilestone(later)?.milestone.id, "nov-h1"); // 10月はもう達成(79,600)
});

test("期限を過ぎて未達なら missed。未来の契約は数えない", () => {
  const st = milestoneStatuses([rec("a", "2026-10-25", 10000)], "2026-10-22");
  assert.equal(st.find(s => s.milestone.id === "oct-w1")!.missed, true);
  assert.equal(st.find(s => s.milestone.id === "oct")!.achieved, 0);
});

test("60日チャレンジは11/9からの累計（11/1〜11/8の契約は含めない）", () => {
  const st = milestoneStatuses([rec("a", "2026-11-05", 298000, "UPSELL"), rec("b", "2026-11-10", 298000, "UPSELL")], "2026-12-08");
  assert.equal(st.find(s => s.milestone.id === "c60")!.achieved, 298000);
  assert.equal(st.find(s => s.milestone.id === "nov")!.achieved, 596000);
});

test("2027年3月に月50万円（契約250万円）までの月ごとの到達基準", async () => {
  const { SALES_MILESTONES } = await import("../lib/salesProgress");
  const months = SALES_MILESTONES.filter(m => ["dec", "jan", "feb", "mar"].includes(m.id)).map(m => [m.due, reward(m.target)]);
  assert.deepEqual(months, [["2026-12-31", 100000], ["2027-01-31", 200000], ["2027-02-28", 350000], ["2027-03-31", 500000]]);
  const st = milestoneStatuses([], "2027-02-10");
  assert.equal(currentMilestone(st)?.milestone.id, "feb");
});

test("残りを何件で埋められるかの目安", () => {
  const opts = fillOptions(500000);
  assert.deepEqual(opts.map(o => [o.label, o.count]), [["アップセル1件（50万円以上の価格で）", 1], ["アップセル（29.8万円）", 2], ["ポートフォリオ最高額（7.98万円）", 7], ["ポートフォリオ平均5万円", 10]]);
  assert.deepEqual(fillOptions(50000).map(o => o.label), ["ポートフォリオ最高額（7.98万円）", "ポートフォリオ平均5万円"]);
  assert.deepEqual(fillOptions(0), []);
});

test("商談数は成約率が入っているときだけ計算する", () => {
  assert.equal(meetingsNeeded(2, 0.3), 7); assert.equal(meetingsNeeded(2, null), null); assert.equal(meetingsNeeded(2, 0), null);
});

test("記録の形式チェックと金額表示", () => {
  assert.equal(validSaleRecord(rec("a", "2026-10-12", 29800)), true);
  assert.equal(validSaleRecord({ ...rec("a", "2026-10-12", 29800), amount: -1 }), false);
  assert.equal(validSaleRecord({ ...rec("a", "2026-10-12", 29800), kind: "X" }), false);
  assert.equal(yen(500000), "50万円"); assert.equal(yen(29800), "29,800円"); assert.equal(sumBetween([rec("a", "2026-10-12", 1)], "2026-10-12", "2026-10-12"), 1);
});

test("中央保存の検証: 契約記録・成約率・読み上げ文の形式", async () => {
  const { validSnapshot } = await import("../lib/work/execution");
  const r = rec("a", "2026-10-12", 29800);
  assert.equal(validSnapshot({ currentDate: "2026-10-12", salesRecords: { a: r }, salesCloseRate: 0.3, declaration: { text: "読み上げ", updatedAt: "x" } }), true);
  assert.equal(validSnapshot({ currentDate: "2026-10-12", salesRecords: { b: r } }), false);
  assert.equal(validSnapshot({ currentDate: "2026-10-12", salesCloseRate: 3 }), false);
  assert.equal(validSnapshot({ currentDate: "2026-10-12", declaration: { text: "x".repeat(5001), updatedAt: "x" } }), false);
});
