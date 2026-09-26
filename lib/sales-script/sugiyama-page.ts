import { latestSugiyamaMarkdown as sugiyamaMarkdown } from './sugiyama-latest';

const bankStart = sugiyamaMarkdown.indexOf('## 21A｜課題別・質問と解説の問題集');
const bankEnds = [sugiyamaMarkdown.indexOf('\n# 22｜PFへ', bankStart), sugiyamaMarkdown.indexOf('\n## 22｜PFへ', bankStart)].filter((value) => value > bankStart);
const displayMarkdown = bankStart >= 0 && bankEnds.length
  ? sugiyamaMarkdown.slice(0, bankStart) + '## 21A｜課題別問題集は専用ページで使う\n\n40問の分岐は全文台本から分離しました。商談中は「課題別問題集」を開き、相手の言葉から検索します。\n\n' + sugiyamaMarkdown.slice(Math.min(...bankEnds))
  : sugiyamaMarkdown;

export const sugiyamaPage = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#f6f5f0"><title>ラポール重視版 2026-09-26｜緒方 Sales Script</title><link rel="manifest" href="/sales-script/manifest.webmanifest"><link rel="stylesheet" href="/sugiyama.css"></head><body>
<header class="mast"><a href="/today">← WorkOS</a><span>緒方 Sales Script</span><nav aria-label="台本の版"><a aria-current="page" href="/sales-script">全文台本</a><a href="/sales-script/questions"><strong>課題別問題集</strong></a><a href="/sales-script?edition=mogi">茂木さん版</a><button id="references">基準資料</button></nav></header>
<main><section class="hero"><small>ROLEPLAY / 2026-09-26</small><h1>ラポール重視版</h1><p>日常・趣味 → 価値観 → 未来 → 1年後 → 直近目標</p></section>
<div class="position"><div class="row"><strong id="position">現在地：1 / 78</strong><button id="toc">目次</button></div><p id="goal"></p><div class="two"><span>案件を取る：見せるもの ＋ 実績</span><span>継続して伸ばす：進め方 ＋ 相談環境</span></div></div>
<div class="modes" aria-label="表示モード"><button id="navMode" aria-pressed="true">実戦ナビ</button><button id="memoryMode" aria-pressed="false">暗記モード</button><button id="fullMode" aria-pressed="false">全文表示</button></div>
<div class="row secondary"><button id="review">未暗記だけ復習</button><button id="notesToggle" aria-pressed="false">補足を表示</button><button id="tools">編集・設定</button></div><p id="status" role="status">2026年9月25日版を表示</p>
<article id="card"></article><section id="branches" class="card" hidden><h2>返答から探す</h2><div class="branch-grid" id="branchButtons"></div><button id="returnBranch" hidden>分岐前に戻る</button></section>
<section id="practiceCard" class="card"><label class="check"><input type="checkbox" id="mastered">このフェーズは暗記できた</label><span id="progress"></span><details><summary>FBメモ</summary><textarea id="memo" aria-label="このフェーズのFBメモ" placeholder="次に直すことを1つ"></textarea><small>チェック・メモはこのブラウザ内に保存</small></details></section></main>
<footer><button id="prev">← 前へ</button><button id="next" class="primary">次へ →</button></footer>
<dialog id="dialog"><div class="dialogtop"><strong id="dialogTitle"></strong><button id="close">閉じる</button></div><div id="dialogBody"></div></dialog>
<script type="application/json" id="seed">${JSON.stringify(displayMarkdown).replace(/</g, '\\u003c')}</script><script src="/sugiyama-reading.js?v=2" defer></script><script src="/sugiyama.js?v=7" defer></script></body></html>`;
