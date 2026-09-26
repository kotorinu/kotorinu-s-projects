import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { sugiyamaMarkdown } from '../lib/sales-script/sugiyama-seed';
import { latestSugiyamaMarkdown } from '../lib/sales-script/sugiyama-latest';
import { initialScript, updateScript } from '../lib/sales-script/store';
import { completeMarkdown } from '../lib/sales-script/seed';
import { sugiyamaPage } from '../lib/sales-script/sugiyama-page';

test('Sugiyama V5 matches the full user attachment verbatim', () => {
  assert.equal(createHash('sha256').update(sugiyamaMarkdown).digest('hex'), 'c11fd8ad2d4023ddcc28fac369e51d21e4ce2197e9d0cfa7d9f58fd5b02a20ca');
  assert.deepEqual([...sugiyamaMarkdown.matchAll(/^# (\d+)｜/gm)].map(m=>Number(m[1])),Array.from({length:78},(_,i)=>i+1));
  for(const s of ['20-1｜','20-2｜','20-3｜','20-4｜','2回修正','編集権限','79,800円','3,500円','全額返金','米沢さん','河村さん','鈴木さん']) assert.ok(sugiyamaMarkdown.includes(s),s);
});
test('Mogi remains default for existing API clients; Sugiyama is isolated', () => {
  assert.equal(initialScript().content,completeMarkdown);
  const state=initialScript('sugiyama');
  assert.equal(state.content,latestSugiyamaMarkdown);
  const next=latestSugiyamaMarkdown+'\n確認用';
  state.version=updateScript(state,next,0,'手動保存');
  assert.equal(state.content,next);
  assert.equal(state.versions[0].content,latestSugiyamaMarkdown);
  assert.throws(()=>updateScript(state,'古い版からの保存テスト',0,'自動保存'),/conflict/);
  assert.equal(initialScript().content,completeMarkdown);
});
test('Embedded JSON keeps the flow while moving the long question bank to its own page', () => {
  const json=sugiyamaPage.match(/<script type="application\/json" id="seed">([\s\S]*?)<\/script>/)![1];
  const displayed=JSON.parse(json);
  assert.ok(displayed.includes('## 21A｜課題別問題集は専用ページで使う'));
  assert.ok(!displayed.includes('### 問題40｜'));
  assert.deepEqual([...displayed.matchAll(/^# (\d+)｜/gm)].map((m:RegExpMatchArray)=>Number(m[1])),Array.from({length:78},(_,i)=>i+1));
  assert.ok(sugiyamaPage.includes('?edition=mogi'));
});
