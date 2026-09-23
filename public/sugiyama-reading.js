/* Reading projection only. The editable/cloud source and history stay untouched. */
(() => {
  'use strict';
  const editorialLines = new Set([
    'そして絶対ここを飛ばさない。',
    'ここから今回追加。', 'そして、',
    '尋問感を消すための「情報提供」。', '質問をまとめて尋問感を減らす。',
    '「案件を取るために4つ」ではない。',
    'これで「案件」が項目に入らず、論理が通る。', 'これでいい。',
    'ここで杉山さんの時間を回収。',
    '送ってくれた営業資料の相場ページと一致。',
    '送ってくれたFB資料の内容をそのまま回収。',
    'ここ今回かなり具体化。',
    'これならサーフィン深掘りが後半にちゃんと返ってくる。',
    '資料にも「ポートフォリオ完成後10日以内に現在の悩みや打開策をご相談いただけます」とある。',
    'この言い方なら実績を強く見せつつ、結果保証にはしない。',
    '送ってくれた料金資料上も、Nexvoポートフォリオは79,800円、24分割で月々約3,500円〜、現金振込対応可になっている。',
    'そして、ユーザーが言っていた**4,980円**だけは他の価格帯と桁がかなり違うため、アプリ実装前に「4,980円で本当に正式契約可能なのか」を一度確認してから入れる。ここだけは間違えるとまずい。',
  ]);
  // Match the supplied source annotations, never dialogue that merely mentions a name.
  const sourceNotes = /^(?:茂木さん(?:の元商談も、|実商談でも|自身も、|も動画の|も、外注後|商談でも、|も本人へ|も「実績を|も3件すべて)|制作10日・早い場合1週間程度という説明も茂木さん)/;
  function title(value) { return value.replace(/【(?:茂木固定要素|今回の重要修正|削除禁止)】/g, ''); }
  function text(value) {
    let result = String(value).replace(/\r\n?/g, '\n');
    const start = result.indexOf('# 緒方版V5｜');
    if (start >= 0) result = result.slice(start);
    result = result.replace(/^## このV5で変えた重要点\s*$[\s\S]*/m, '');
    result = result.replace(/^### (?:目的|完了条件|メモ|完了メモ|アプリ補助メモ|アプリ暗記ワード)\s*\n[\s\S]*?(?=^#{1,3} |^---\s*$|(?![\s\S]))/gm, '');
    result = result.split('\n').filter(line => {
      const plain = line.trim();
      return !editorialLines.has(plain) && !(sourceNotes.test(plain) && plain.includes(':chatgpt-content-reference'));
    }).map(line => line.startsWith('#') ? title(line) : line).join('\n');
    result = result.replace(/^そして、ここはあなたの自己開示を少しだけ入れてもいい。$/m, '※次の自己開示は、自分の実体験と合う場合のみ。');
    return result.replace(/:chatgpt-content-reference\{[^}\n]*\}/g, '').replace(/\n{3,}/g, '\n\n').trim();
  }
  globalThis.SugiyamaReading = Object.freeze({ text, title });
})();
