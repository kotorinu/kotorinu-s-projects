import test from "node:test";
import assert from "node:assert/strict";

test("オウンドメディア版台本はヒアリングを共有し、⑩だけ手段を差し替える", async () => {
  const { energySteps } = await import("../lib/sales-script/energy-page");
  const { ownedMediaSteps, ownedMediaPage } = await import("../lib/sales-script/owned-media-page");
  assert.deepEqual(ownedMediaSteps.map(s => s.n), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  for (const n of [2, 4]) assert.deepEqual(ownedMediaSteps[n - 1], energySteps[n - 1], `step ${n}`);
  for (const s of ownedMediaSteps) assert.ok(s.items.some(i => i.k === "m" && i.must), "must: " + s.title);
  const s10 = ownedMediaSteps[9];
  const says = s10.items.map(i => i.t).join("\n");
  assert.ok(says.includes("なんで企業さんがポートフォリオを見たがると思います"));
  assert.ok(says.includes("結論、ほぼポートフォリオなんです") && says.includes("虹色の履歴書") && says.includes("イメージ湧きました"));
  assert.ok(says.includes("見せたらそこで終わり") && says.includes("仮に、もっと格安で作れて"));
  assert.ok(says.includes("1件ごとの1回きり"));
  assert.ok(says.includes("本気でやる気がないなら、正直おすすめはしない") && s10.avoid!.some(a => a.includes("資料（スライド）を見せる")));
  assert.ok(ownedMediaPage.includes("入江さんFB（最優先") && ownedMediaPage.includes("入江さんFB 10/22"));
  assert.ok(!/必ず稼げ|絶対に稼げ/.test(says));
  assert.ok(s10.avoid?.some(a => a.includes("お仕事を紹介するので、メディアを買ってください")));
  assert.ok(ownedMediaPage.includes("ポートフォリオ版から変わったところ") && ownedMediaPage.includes("動画を見た人が持っている誤解"));
  assert.ok(ownedMediaPage.includes("owned-media-memory") && !ownedMediaPage.includes("energy-memory"));
  const s1 = ownedMediaSteps[0].items.map(i => i.t).join("\n");
  assert.ok(s1.includes("3本見てみて") && !s1.includes("200文字"));
  for (const k of ["パソコンが苦手", "何を書けばいいか分からない", "本当に稼げるんですか", "もうブログを持っている", "維持費"]) assert.ok(s10.items.some(i => i.k === "b" && i.if.includes(k)), k);
  assert.ok(ownedMediaPage.includes("事前動画3本の要点") && ownedMediaPage.includes("サービス内容（スライドの叩き台"));
  assert.ok(!/200文字|記事の感想|提出いただいた文章/.test(JSON.stringify(ownedMediaSteps)) && !ownedMediaPage.includes("自己紹介 → 記事の感想") && !ownedMediaPage.includes("①記事の感想") && ownedMediaPage.includes("⑦ 感想のFB"));
  assert.ok(ownedMediaSteps[2].items.some(i => i.t.includes("余裕だわ")));
  assert.ok(s10.avoid?.some(a => a.includes("本当ではない残り枠")) && s10.avoid?.some(a => a.includes("生活費を削って")));
  assert.ok(ownedMediaPage.includes("2本の商談から"));
  assert.ok(!/080\d|川端|山本さん|松本さん/.test(ownedMediaPage));
  assert.ok(ownedMediaPage.includes("失注・保留の理由と返し") && says.includes("39,800円〜99,800円"));
  assert.ok(ownedMediaSteps[5].items.some(i => i.t.includes("ポートフォリオって、もう持たれてたりします")));
  assert.ok(s10.items.some(i => i.k === "b" && i.if.includes("特典を出す時")) && s10.items.some(i => i.k === "b" && i.if.includes("オウンドメディアがいい」まで持っていく")));
  // 元のポートフォリオ版は変えない
  assert.ok(energySteps[9].title.includes("PF") && energySteps[9].items.some(i => i.t.includes("虹色の履歴書")));
});

test("オウンドメディア理解度テストは5分類すべてに問題があり、要点と模範解答がある", async () => {
  const { quizItems, quizCategories, ownedMediaQuizPage } = await import("../lib/sales-script/owned-media-quiz");
  const ids = new Set(quizItems.map(i => i.id));
  assert.equal(ids.size, quizItems.length);
  for (const c of quizCategories) assert.ok(quizItems.filter(i => i.cat === c.id).length >= 5, c.label);
  for (const i of quizItems) assert.ok(i.q && i.a && i.points.length > 0, i.id);
  assert.ok(quizItems.some(i => i.cat === "ng" && i.q.includes("お仕事を紹介するので")));
  for (const i of quizItems.filter(i => i.cat === "appeal")) assert.ok(i.sell && i.sell.why && i.sell.next, "sell: " + i.id);
  for (const i of quizItems.filter(i => i.cat === "lost")) assert.ok(i.sell, "lost sell: " + i.id);
  assert.ok(quizItems.filter(i => i.cat === "age").length >= 5 && ownedMediaQuizPage.includes("この返しで売れる"));
  assert.ok(ownedMediaQuizPage.includes("10問テスト") && ownedMediaQuizPage.includes("owned-media-quiz-v1"));
  assert.ok(!/080\d|川端|山本さん|松本さん/.test(ownedMediaQuizPage));
});

test("オウンドメディアの教科書は6章あり、PVと計算式と弱点を含む", async () => {
  const { learnSections, ownedMediaLearnPage } = await import("../lib/sales-script/owned-media-learn");
  assert.equal(learnSections.length, 7);
  assert.ok(ownedMediaLearnPage.includes("半年くらい見ておくのが普通") && ownedMediaLearnPage.includes("約80万円"));
  assert.ok(ownedMediaLearnPage.includes("PV（ページビュー）") && ownedMediaLearnPage.includes("PV × クリック率 × 成約率 × 1件の報酬") && ownedMediaLearnPage.includes("弱点"));
});
