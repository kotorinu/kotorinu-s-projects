import assert from "node:assert/strict";
import { test } from "node:test";
import { salesPhases } from "../lib/dummy-data";
import { phaseCoverage } from "../lib/sales";

// 営業Master ①基礎の回帰テスト (2026-09-09).
//
// このデータは本人のワークシートの転記であり、AIが書き足してよい場所では
// ない。だからこそ「静かに空になる」ことを絶対に許してはいけない——空でも
// 画面はエラーを出さず、ただ何も出ないだけで、気づくのが遅れる。
//
// 正本の17フェーズ。「決済」という独立Phaseは存在しない。
const CANON = [
  "第一印象形成（オンライン特化）",
  "ラポール形成",
  "会話主導権形成（アジェンダ設定）",
  "現状把握",
  "理想把握",
  "ギャップ認識",
  "原因特定",
  "課題の言語化・提示",
  "感情喚起",
  "解決可能性提示",
  "解決策提示（オンラインプレゼン）",
  "解決策理解",
  "不安解除",
  "意志確認",
  "テスクロ（テストクロージング）",
  "オファー",
  "クロージング（オンライン契約）",
];

test("17フェーズが17件ある", () => {
  assert.equal(salesPhases.length, 17);
});

test("正本どおりの順番・名称である", () => {
  assert.deepEqual(salesPhases.map((p) => p.title), CANON);
  assert.deepEqual(
    salesPhases.map((p) => p.phaseNumber),
    Array.from({ length: 17 }, (_, i) => i + 1)
  );
});

test("「決済」という独立Phaseは存在しない", () => {
  assert.equal(
    salesPhases.some((p) => p.title === "決済"),
    false
  );
});

test("Phase03は会話主導権形成、Phase17はクロージング", () => {
  assert.equal(salesPhases[2].title, "会話主導権形成（アジェンダ設定）");
  assert.equal(salesPhases[16].title, "クロージング（オンライン契約）");
});

test("全17フェーズに①基礎の5項目がある", () => {
  const missing: string[] = [];
  for (const p of salesPhases) {
    const n = `${p.phaseNumber} ${p.title}`;
    if (!p.purpose || p.purpose.trim() === "") missing.push(`${n}: purpose`);
    if (p.okConditions.length === 0 && !p.okState) missing.push(`${n}: OK状態`);
    if (p.checkPoints.length === 0) missing.push(`${n}: 確認事項`);
    if (p.sourceQuestions.length === 0) missing.push(`${n}: 質問例`);
    if (p.ngExamples.length === 0) missing.push(`${n}: NG例`);
  }
  assert.deepEqual(missing, [], `①基礎が欠けています:\n${missing.join("\n")}`);
});

test("①基礎の中身が本当にテキストである（空文字列で埋めていない）", () => {
  for (const p of salesPhases) {
    for (const list of [p.okConditions, p.checkPoints, p.sourceQuestions, p.ngExamples]) {
      for (const item of list) {
        assert.ok(item.trim().length > 3, `Phase ${p.phaseNumber} に中身の無い項目がある: "${item}"`);
      }
    }
  }
});

test("商品情報が必要な6フェーズは 10/11/12/15/16/17 で固定", () => {
  const needsProduct = salesPhases
    .filter((p) => p.caseSpecificKnowledge.includes("PRODUCT_INFO_REQUIRED"))
    .map((p) => p.phaseNumber);
  assert.deepEqual(needsProduct, [10, 11, 12, 15, 16, 17]);
});

test("商品情報待ちのフェーズでも①基礎は埋まっている", () => {
  for (const p of salesPhases.filter((x) => x.caseSpecificKnowledge.includes("PRODUCT_INFO_REQUIRED"))) {
    assert.ok(p.purpose, `Phase ${p.phaseNumber} の目的が空`);
    assert.ok(p.sourceQuestions.length > 0, `Phase ${p.phaseNumber} の質問例が空`);
  }
});

test("Coverage: ①基礎17/17、②自分版は入力ゼロなら0/11・0/33", () => {
  const c = phaseCoverage(salesPhases, {});
  assert.equal(c.total, 17);
  assert.equal(c.purpose, 17, "①基礎の目的");
  assert.equal(c.okState, 17, "①基礎のOK状態");
  assert.equal(c.means, 17, "①基礎の確認事項/質問例");
  assert.equal(c.productInfoRequired, 6);
  assert.equal(c.ownVersionAchievable, 11, "商品情報待ち6を除いた11");
  assert.equal(c.ownVersionDone, 0);
  assert.equal(c.ownFieldsTotal, 33, "11フェーズ × 3項目");
  assert.equal(c.ownFieldsFilled, 0);
});

test("②自分版を書いても①基礎は一切変わらない", () => {
  const before = JSON.stringify(salesPhases);
  const c = phaseCoverage(salesPhases, {
    "sp-01": { purpose: "自分の言葉の目的", okState: "自分の言葉のOK状態", means: "自分の質問" },
  });
  assert.equal(JSON.stringify(salesPhases), before, "fixtureは不変でなければならない");
  assert.equal(c.purpose, 17, "①基礎は②の入力に影響されない");
  assert.equal(c.ownVersionDone, 1);
  assert.equal(c.ownFieldsFilled, 3);
});
