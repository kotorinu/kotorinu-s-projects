import test from "node:test";
import assert from "node:assert/strict";

test("オウンドメディア版台本はヒアリングを共有し、⑩だけ手段を差し替える", async () => {
  const { energySteps } = await import("../lib/sales-script/energy-page");
  const { ownedMediaSteps, ownedMediaPage } = await import("../lib/sales-script/owned-media-page");
  assert.deepEqual(ownedMediaSteps.map(s => s.n), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  for (const n of [2, 4, 6]) assert.deepEqual(ownedMediaSteps[n - 1], energySteps[n - 1], `step ${n}`);
  for (const s of ownedMediaSteps) assert.ok(s.items.some(i => i.k === "m" && i.must), "must: " + s.title);
  const s10 = ownedMediaSteps[9];
  const says = s10.items.map(i => i.t).join("\n");
  assert.ok(says.includes("なんで企業さんがポートフォリオを見たがると思います"));
  assert.ok(says.includes("見せるためのものなので、そこで終わってしまう"));
  assert.ok(says.includes("案件だけが収入の手段じゃなくなる"));
  assert.ok(says.includes("1件ごとの1回きり"));
  assert.ok(says.includes("本気でやる気がないなら、おすすめはしない"));
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
  // 元のポートフォリオ版は変えない
  assert.ok(energySteps[9].title.includes("PF") && energySteps[9].items.some(i => i.t.includes("虹色の履歴書")));
});
