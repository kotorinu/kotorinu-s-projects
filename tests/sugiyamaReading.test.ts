import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { sugiyamaMarkdown } from '../lib/sales-script/sugiyama-seed';
import { latestSugiyamaMarkdown } from '../lib/sales-script/sugiyama-latest';
import { sugiyamaPage } from '../lib/sales-script/sugiyama-page';

const context: {SugiyamaReading?: {text: (s: string)=>string; title: (s: string)=>string}} = {};
runInNewContext(readFileSync('public/sugiyama-reading.js', 'utf8'), context);
const reading = context.SugiyamaReading!;
const cleaned = reading.text(sugiyamaMarkdown);

test('reading removes author/source noise but keeps all 78 phases and subphases', () => {
  assert.deepEqual([...cleaned.matchAll(/^# (\d+)｜/gm)].map(m=>Number(m[1])), Array.from({length:78}, (_,i)=>i+1));
  for (const s of ['20-1｜', '20-2｜', '20-3｜', '20-4｜']) assert.ok(cleaned.includes(s));
  for (const s of ['chatgpt-content-reference', '茂木さん', '今回追加', '今回かなり具体化', 'このV5で変えた重要点', '### メモ', '### 目的', '### 完了条件', 'アプリ補助メモ', '今回の重要修正', '削除禁止']) assert.ok(!cleaned.includes(s), s);
  assert.equal(reading.text(cleaned), cleaned);
  assert.ok(sugiyamaMarkdown.includes(':chatgpt-content-reference{index="0"}'));
});

test('latest app script keeps 78 phases and the 6A/6B discovery bridge', () => {
  const latestCleaned = reading.text(latestSugiyamaMarkdown);
  assert.deepEqual([...latestCleaned.matchAll(/^# (\d+)｜/gm)].map(m=>Number(m[1])), Array.from({length:78}, (_,i)=>i+1));
  assert.ok(latestCleaned.includes('## 6A｜本ヒアリングへ切り替える許可'));
  assert.ok(latestCleaned.includes('## 6B｜最初に保存したフックへ戻る'));
});

test('phase 2 treats the required videos as context and the appendix keeps training principles', () => {
  assert.ok(latestSugiyamaMarkdown.includes('動画の学びが提出文にどうつながったかを聞く'));
  assert.ok(latestSugiyamaMarkdown.includes('今回書く時に意識したところってありました？'));
  assert.ok(!latestSugiyamaMarkdown.includes('事前の動画は、3本ともご覧になれましたか？'));
  for (const text of ['商談前に準備すること', 'ヒアリングで確認する4つ', 'アドバイザーとして提案する', '不安は3種類に分けて聞く']) {
    assert.ok(latestSugiyamaMarkdown.includes(text), text);
  }
});

test('opening builds quick rapport before returning to the 200-character assignment', () => {
  assert.ok(latestSugiyamaMarkdown.includes('ちなみに今日は、お仕事はお休みだったんですか？'));
  assert.ok(latestSugiyamaMarkdown.includes('200文字の課題についても少し聞いていいですか？'));
  assert.ok(latestSugiyamaMarkdown.includes('さっき【仕事内容】と伺いましたけど'));
});

test('all dialogue quotes survive verbatim, excluding three non-dialogue annotations', () => {
  const body = sugiyamaMarkdown.slice(sugiyamaMarkdown.indexOf('# 1｜'), sugiyamaMarkdown.indexOf('## このV5で変えた重要点'));
  const quotes = [...body.matchAll(/^(?:> )?「[\s\S]*?」/gm)].map(m=>m[0]);
  assert.ok(quotes.length > 300);
  const editorial = ['「案件を取るために4つ」', '「約640万円」', '「文章そのものが今の一番の問題なのか」'];
  const compact = (s: string) => s.replace(/\r/g, '').replace(/\s/g, '');
  for (const q of quotes) {
    if (!editorial.includes(q)) assert.ok(compact(cleaned).includes(compact(q)), q);
  }
});

test('safety conditions and customer-added dialogue are not removed', () => {
  for (const s of ['聞かれたら。', '本人に決めてもらう。', '会社から承認されている金額だけ', '案件提供条件', '1か月以内', '全額返金', '必ず稼げる', '3件全部', '79,800円', '実際に「教えてもらって上達した」が出た場合だけ']) assert.ok(cleaned.includes(s), s);
  const added = '### 緒方\n\n「茂木さんについて確認したいです。」\n\n「今回追加したいお話です。」';
  assert.equal(reading.text(added), added);
  assert.equal(reading.title('回収【条件付き】'), '回収【条件付き】');
});

test('app loads projection first and removes repeated generic navigation accordion', () => {
  assert.ok(sugiyamaPage.indexOf('/sugiyama-reading.js?v=2') < sugiyamaPage.indexOf('/sugiyama.js?v=6'));
  const js = readFileSync('public/sugiyama.js', 'utf8');
  assert.ok(sugiyamaPage.includes('id="fullMode"'));
  assert.ok(js.includes("matchMedia('(pointer: fine)')"));
  assert.ok(js.includes('function renderFull()'));
  assert.ok(sugiyamaPage.includes('id="notesToggle"'));
  assert.ok(js.includes('class="stage-note"'));
  assert.ok(js.includes('トークを開く'));
  assert.ok(js.includes('clean(SugiyamaReading.text(getPhase().raw))'));
  assert.ok(!js.includes('復唱・意味づけ・深掘り・NG・接続'));
  assert.ok(!js.includes('一語一句の原文を開く'));
});
