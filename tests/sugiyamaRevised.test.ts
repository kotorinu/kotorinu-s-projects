import test from 'node:test';
import assert from 'node:assert/strict';
import { sugiyamaMarkdown as original } from '../lib/sales-script/sugiyama-seed';
import { revisedSugiyamaMarkdown as revised, reviseSugiyamaSource } from '../lib/sales-script/sugiyama-revised';
import { latestSugiyamaMarkdown as latest } from '../lib/sales-script/sugiyama-latest';

const phase = (s: string, id: number) => s.replace(/\r/g, '').match(new RegExp(`^# ${id}｜[^\\n]*\\n[\\s\\S]*?(?=^# \\d+｜|(?![\\s\\S]))`, 'm'))![0].trim();
test('revision keeps 78 phases and every unmodified phase, including all contract and closing conditions', () => {
  assert.deepEqual([...revised.matchAll(/^# (\d+)｜/gm)].map(m=>+m[1]),Array.from({length:78},(_,i)=>i+1));
  const changed = new Set([4,6,11,24,27,28,29,30,31,32,33,34,35,37,43,45,46,49,54]);
  for(let i=1;i<=78;i++) if(!changed.has(i)) assert.equal(phase(revised,i),phase(original,i),String(i));
  assert.equal(reviseSugiyamaSource(revised),revised);
});
test('feedback and missing source details are present without assumed surfing duration', () => {
  assert.ok(phase(revised,4).includes('その後も本業と両立しながら'));
  const surf = phase(revised,6);
  assert.ok(surf.indexOf('いつ頃始められた')<surf.indexOf('どうやってサーフィンできる'));
  assert.ok(surf.indexOf('どうやってサーフィンできる')<surf.indexOf('続いている理由・価値観'));
  assert.ok(surf.includes('始めたばかりの場合'));
  assert.ok(phase(revised,11).includes('ここまで整理させてもらいますね'));
  assert.ok(phase(revised,24).includes('**履歴書**'));
  for(const [id, words] of [[31,['載せていいですよ','美容の会社']], [32,['金融とか転職','半導体とか製造業']], [33,['1円から3円','5〜6時間','2万5,000円','同じ単価や速さ']], [34,['スカウトの窓口']], [43,['アンケート']], [45,['動画']], [49,['制作期間','別ですね','1週間に1件ずつ']], [54,['プロのライター']]] as [number,string[]][]) for(const word of words) assert.ok(phase(revised,id).includes(word),`${id}: ${word}`);
});

test('2026-09-24 app source contains every phase and the rapport bridge', () => {
  assert.deepEqual([...latest.matchAll(/^# (\d+)｜/gm)].map(match => Number(match[1])), Array.from({ length: 78 }, (_, index) => index + 1));
  assert.ok(latest.includes('## 6A｜本ヒアリングへ切り替える許可'));
  assert.ok(latest.includes('## 6B｜最初に保存したフックへ戻る'));
  assert.ok(latest.includes('浅く聞く→趣味で会話→許可→フックへ戻って縦掘り'));
  assert.ok(latest.includes('一旦、金額の話は置いて、内容について伺ってもいいですか？'));
  assert.ok(latest.includes('**79,800円**'));
});
