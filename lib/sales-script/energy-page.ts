// エネルギー型トークスクリプト (2026-10-12 方針変更)。
//
// 上司の方針: PFの説明は5分程度。残りはヒアリングで相手のエネルギーを上げる。
// 「クラウドワークスだけでは月数千円で止まる」という事実を相手のために直球で伝え、
// 本気になったら「私たちも本気でサポートする」→ その手段としてPF。
// 各ステップに「どこまで具体化できたら次へ進むか」と「言わない・やらないこと」を置く。
// 自分の体験談の中身は非公開のメモ（Notion）に置き、ここでは【 】にする。

type Item =
  | { k: "m"; t: string }
  | { k: "c"; t: string }
  | { k: "b"; if: string; t: string }
  | { k: "n"; t: string };

interface Step { n: number; title: string; time: string; goal: string; done: string[]; avoid?: string[]; items: Item[] }

const steps: Step[] = [
  { n: 1, title: "自己紹介（今日の進め方を伝える）", time: "0〜3分", goal: "話していい場だと感じてもらい、今日の進め方に合意してもらう。", done: ["相手が一度笑った・表情がゆるんだ", "「よろしくお願いします」と進め方に合意した"], items: [
    { k: "m", t: "本日はよろしくお願いいたします。コーチング事業部の【自分の名前】です。初めてのライターさんのフィードバックと、目標に向けた進め方のサポートを担当しています。" },
    { k: "m", t: "今日は、提出いただいた文章のフィードバックもさせていただきながら、【相手の名前】さんがこれからどうなっていきたいかも、一緒に考えられたらと思っています。査定ではないので、正直に話してもらえたら嬉しいです。" },
    { k: "m", t: "ちなみに、今日はお休みだったんですか？" },
    { k: "n", t: "雑談は1〜2往復でOK。仕事・休みの話から、そのまま②のきっかけへ。" },
  ] },
  { n: 2, title: "目標を聞く（叶えたいこと → その日の様子 → なぜ → 覚悟の確認）", time: "3〜20分", goal: "相手が自分の言葉で未来を語り、声の温度が上がる。エネルギーを上げる中心。", done: [
    "期限：いつまでに（例：来年3月までに）",
    "数字：月いくら（例：月3万円）",
    "使い道：そのお金で何をしているか、1場面が言える（例：月1回回らないお寿司に行く）",
    "なぜ：それが叶うと何が変わるか・誰が喜ぶか",
    "覚悟：「正直、自分がなれると思うか」に本人が答えた",
    "最後に要約して「合ってますか？」に「はい」",
  ], avoid: ["生活費の内訳を全部積み上げる（今回はやりすぎ）", "こちらから数字や使い道を言う（当てはめない）", "「いいですね」で終わって次の質問へ飛ぶ"], items: [
    { k: "m", t: "副業を始めようと思ったきっかけって、何だったんですか？" },
    { k: "m", t: "なんで、今だったんですか？" },
    { k: "m", t: "それがうまくいったら、どうなっていたら最高ですか？" },
    { k: "m", t: "そのためには、月いくらくらいあるといいですか？" },
    { k: "m", t: "いつまでに、そうなっていたいですか？" },
    { k: "m", t: "月【金額】入ってきている月、そのお金で何をしてます？" },
    { k: "m", t: "その日、どんな気持ちですか？" },
    { k: "m", t: "それが叶ったら、今と何が一番変わりますか？　誰が喜びますか？" },
    { k: "m", t: "つまり、【期限】までに月【金額】稼いで、【使い道】ができている状態。これが【相手の名前】さんの目指したいところ、で合ってますか？" },
    { k: "m", t: "ありがとうございます。一つだけ正直に聞かせてください。ご自身で、そうなれると思ってますか？" },
    { k: "b", if: "「なれると思う」", t: "いいですね。そう思える根拠って、何かありますか？" },
    { k: "b", if: "「半信半疑」「自信がない」", t: "正直に言ってくださってありがとうございます。何がそう思わせてますか？ → それって、才能の問題ですか？　それとも、やり方をまだ知らないだけですか？" },
    { k: "b", if: "「やり方を知らないだけ」", t: "だったら大丈夫です。やり方の問題なら、この後のお話で解決できるので。" },
  ] },
  { n: 3, title: "現状を聞く（時間・家族・これまでの挑戦・お金）", time: "20〜30分", goal: "目標と今の差を、数字で本人に見えるようにする。", done: [
    "副業：始めた時期・応募数・採用数・収入",
    "時間：先週実際に使えた時間（曜日・時刻まで）",
    "仕事と家族：本業で副業OKか／自分で決めるか、家族に相談するか",
    "これまでの挑戦：スクールや講座の経験（あれば）・続けられたこと",
    "お金：目標のためなら月いくらまで動かせるか（レンジでOK）",
  ], avoid: ["反省会にしない（「なんで続かなかったんですか」と責めない）", "時間を計算して「十分ありますよ」と説得しない"], items: [
    { k: "m", t: "ここからは、今の状況を聞かせてください。査定じゃなくて、【相手の名前】さんに合った進め方を考えるための材料集めなので、そのまま教えてもらえたら大丈夫です。" },
    { k: "m", t: "副業を始めてどれくらいですか？　応募は何件くらいして、何件採用されました？　収入はどれくらいになりました？" },
    { k: "m", t: "1ヶ月やってみて【収入】っていうところ、ぶっちゃけどうですか？" },
    { k: "m", t: "先週、実際に副業に使えた時間ってどれくらいでした？　それって何曜日の何時ごろですか？" },
    { k: "m", t: "本業の方は、副業って大丈夫なんでしたっけ？" },
    { k: "m", t: "こういう新しいことを始めるときって、ご自身で決めるタイプですか？　ご家族に相談するタイプですか？" },
    { k: "m", t: "これまで、スクールや講座で何か学んだことってありますか？　逆に、これまで続けられたことって何ですか？" },
    { k: "m", t: "目標のためなら、月いくらくらいまでなら動かせそうですか？　1万、3万、5万くらいのざっくりで大丈夫です。" },
  ] },
  { n: 4, title: "文章へのフィードバック（良い点）→「だからこそ」", time: "30〜32分", goal: "FBを受けに来た目的を満たしつつ、「文章は問題ない」を直球への橋にする。", done: ["具体的な良い点を1つ伝えた", "「文章は問題ない」と伝えた"], avoid: ["ここで直す点まで言う（直球の勢いが落ちる。直す点は最後か契約後）"], items: [
    { k: "m", t: "提出いただいた文章、拝見しました。【具体的な良い点：例「結論が最初にあって読みやすい」】がすごく良かったです。文章は全然問題ないんですよ。" },
    { k: "m", t: "だからこそ、正直にお伝えしたいことがあって。少しだけ厳しい話になるんですけど、いいですか？" },
  ] },
  { n: 5, title: "直球で事実を伝える＋自分の経験", time: "32〜37分", goal: "このままでは目標に届かないと、相手が自分で感じる。脅すのではなく、相手のために言う。", done: ["事実を伝えた", "自分の経験を話した", "「このまま1年続けたら？」に、相手が「それは嫌です」と言った"], avoid: ["「必ず」「全員」と言い切る", "出典の分からない数字（受注率◯%など）を言う", "沈黙を自分で埋める"], items: [
    { k: "n", t: "伝える事実はこの3つだけ。①クラウドワークスは応募が多く、低単価の案件には150〜200件集まることもある ②企業は文章より「この人に任せて大丈夫か（人柄・信頼）」を見ていて、PFがない人を弾く企業もある ③低単価をたくさん送っても、月数千円で止まる人が多い。" },
    { k: "m", t: "【相手の名前】さんが目指している月【金額】って、多くの人が「副業ならいけそう」って思って始めるんです。でも実際は、クラウドワークスだけでやっていくと、月数千円で止まってしまう人がほとんどなんです。" },
    { k: "m", t: "理由はシンプルで、応募する人が多いので単価が上がりにくいのと、企業さんは文章だけじゃなくて「この人に任せて大丈夫か」を見ているので、プロフィールだけだと選ばれにくいんです。" },
    { k: "m", t: "実は、私も同じだったんです。【自分の経験：例「スクールに大きなお金を使って、クラウドワークスで半年やって、ようやく合計1万円」】。" },
    { k: "m", t: "だからこそ、【相手の名前】さんには、同じ遠回りをしてほしくないんです。" },
    { k: "m", t: "もし、今のやり方のまま1年続けたら、どうなってると思います？" },
    { k: "n", t: "沈黙しても埋めない。相手が話すまで待つ。" },
    { k: "c", t: "それは嫌ですね…。" },
  ] },
  { n: 6, title: "本気かを確認 →「本気なら、私たちも本気でサポートします」", time: "37〜40分", goal: "相手が自分の口で「やります」と言い、使う時間を数字で約束する。", done: ["「やります」が本人の口から出た", "週何時間使うかを本人が言った（こちらから数字を言わない）"], items: [
    { k: "m", t: "【相手の名前】さん、本気で【期限】までに月【金額】、取りにいきますか？" },
    { k: "c", t: "やりたいです。" },
    { k: "m", t: "ありがとうございます。そのために、週何時間使えそうですか？" },
    { k: "b", if: "数字が出てこない", t: "ざっくりで大丈夫です。週5時間か、10時間か、20時間くらいか、だとどのあたりですか？" },
    { k: "m", t: "週【時間】ですね。本気なら、私たちも本気でサポートします。" },
  ] },
  { n: 7, title: "その手段としてPFを提案（5分）→ 金額", time: "40〜47分", goal: "「埋めるのはこれだけ」と思ってもらい、PFを手段として選んでもらう。", done: ["持っているもの／まだないものに合意した", "PFを見せた（5分以内）", "金額は相手が先に言った"], avoid: ["こちらから先に金額（7万9,800円・10万以下など）を言う", "PFの項目を全部説明する"], items: [
    { k: "m", t: "月【金額】に必要なものを整理すると、【相手の名前】さんがもう持っているのは、目標と、週【時間】の時間と、文章力と、【本業の経験】。" },
    { k: "m", t: "まだないのは、①企業さんに見てもらう場所＝ポートフォリオ、②そこに載せられる実績、③迷った時に相談できる相手。埋めるのは、この3つだけです。" },
    { k: "m", t: "実際のポートフォリオ、見てみますか？" },
    { k: "n", t: "画面共有して、ファーストビュー・強み・実績・お問い合わせだけをサクッと見せる。" },
    { k: "m", t: "企業さんは、ここを見て「この人にお願いしたい」と思ったら、最後のお問い合わせから連絡してくれるんです。" },
    { k: "m", t: "自分で作るとなると、外部のデザイナーさんに頼むと15万〜20万くらいかかるんですよね。安く作れたらいいなとかってあります？" },
    { k: "m", t: "今日お話を聞かせてもらって、【相手の名前】さんだからこそ、うちもすごく応援したいですし、今後一緒にお仕事できたらと思っていて。本気でライターを頑張るなら、特別にうちの専属デザイナーに格安でできないか、聞いてみます？" },
    { k: "m", t: "OKです！ 本来は外部の方には作成していないので、空き状況も含めて確認になりますが、ダメ元で聞いてみますね。ちなみに、いくらなら、仕事につながる最高のPFを作ってみたいと思います？" },
    { k: "n", t: "実際に確認してから特別価格を伝える → 他言無用 → 「ここで二の足を踏んで、仕事が取れない期間を過ごすのは避けた方がいいので、今日いい出会いだと思って進んでいきましょう」（台本の「上司のFBと言い回し」）。" },
  ] },
  { n: 8, title: "本人の口から目標を宣言してもらう", time: "47〜50分", goal: "今日決めたことを、相手の言葉で終える。", done: ["本人が宣言した", "次にやることと日時が決まった"], items: [
    { k: "m", t: "最後に、今日決めた目標を、ご自身の口で一度言ってもらえますか？「【期限】までに、【使い道】のために、月【金額】」。" },
    { k: "m", t: "完璧な目標じゃなくて大丈夫です。今日の最善版で。走り出したら、もっといい目標に育っていくので。" },
    { k: "m", t: "今日からここが、【相手の名前】さんの目的地です。一緒にやっていきましょう。" },
  ] },
];

export const energySteps = steps;

const data = JSON.stringify(steps).replace(/</g, "\\u003c");

export const energyPage = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#f6f5f0"><title>エネルギー型トーク台本｜緒方 Sales Script</title><style>
*{box-sizing:border-box}body{margin:0;background:#f6f5f0;color:#24302a;font:17px/1.85 -apple-system,BlinkMacSystemFont,"Hiragino Sans","Yu Gothic UI",sans-serif}
header{position:sticky;top:0;z-index:5;background:#fffdf9f0;backdrop-filter:blur(8px);border-bottom:1px solid #dcdcd2;padding:10px 16px}
header .row{display:flex;gap:12px;overflow:auto;white-space:nowrap;font-size:14px}a{color:#2f5f8a;text-decoration:none}
.tools{display:flex;gap:8px;margin-top:8px}.tools button{min-height:40px;border:1px solid #cfd2c8;border-radius:10px;background:#fff;font:inherit;font-size:14px;padding:6px 12px;color:#24302a}.tools button[aria-pressed=true]{background:#24302a;color:#fff}
main{max-width:760px;margin:auto;padding:20px 16px 90px}h1{font-size:26px;margin:0 0 6px}.lead{color:#5f6b63;font-size:15px;margin:0 0 14px}
.box{background:#fff;border:1px solid #dcdcd2;border-radius:14px;padding:12px 14px;margin:0 0 16px;font-size:15px}.box h2{font-size:17px;margin:0 0 6px}
.toc{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 16px}.toc a{background:#fff;border:1px solid #dcdcd2;border-radius:999px;padding:4px 10px;font-size:13px;color:#24302a}
section.step{background:#fff;border:1px solid #dcdcd2;border-radius:16px;padding:16px;margin:0 0 16px}section.step h2{font-size:19px;line-height:1.5;margin:0}
.time{font-size:13px;color:#2f5f8a;font-weight:700}.goal{font-size:14px;color:#5f6b63;margin:4px 0 10px}
.done{background:#eef6ef;border-radius:10px;padding:8px 12px;margin:8px 0;font-size:14px}.done b{color:#2b6a3f}.avoid{background:#fbefee;border-radius:10px;padding:8px 12px;margin:8px 0;font-size:14px}.avoid b{color:#a33}.done ul,.avoid ul{margin:4px 0;padding-left:20px}
.m{background:#eef3fb;border-left:4px solid #2f5f8a;border-radius:10px;padding:10px 12px;margin:8px 0}.who{font-size:12px;font-weight:700;color:#2f5f8a}
.c{border-left:2px solid #c9cdc4;margin:8px 0 8px 12px;padding:2px 12px;color:#4f5b54;font-size:15px}.b{background:#f7f3ea;border:1px dashed #d9c9a3;border-radius:10px;padding:10px 12px;margin:8px 0}.if{font-size:13px;font-weight:700;color:#7a5a12}
.n{font-size:14px;color:#5f6b63;background:#f2f2ec;border-radius:8px;padding:6px 10px;margin:8px 0}
.hide .say{filter:blur(7px);cursor:pointer}.hide .shown .say{filter:none}
@media(prefers-color-scheme:dark){body{background:#151a18;color:#e8ece9}header{background:#1d2320f0;border-color:#323a35}section.step,.box,.toc a,.tools button{background:#1f2522;border-color:#353d38;color:#e8ece9}.m{background:#1d2b3a}.who,.time,a{color:#a9c7ea}.c{color:#c1c9c4}.b{background:#2a261c;border-color:#5a4a26}.if{color:#e5c77d}.n{background:#262c29;color:#c1c9c4}.done{background:#1c2b21}.done b{color:#8fd1a2}.avoid{background:#2e1e1d}.avoid b{color:#f19a9a}.goal,.lead{color:#aab3ad}.tools button[aria-pressed=true]{background:#e8ece9;color:#151a18}}
</style></head><body>
<header><div class="row"><a href="/today">← WorkOS</a><a href="/sales-script/ttp">杉山さんTTP台本</a><a href="/sales-script">全文台本</a></div><div class="tools"><button id="memory" aria-pressed="false">暗記モード</button></div></header>
<main><h1>エネルギー型トーク台本</h1><p class="lead">2026-10-12の方針：PFの説明は5分。残りはヒアリングで相手のエネルギーを上げる。「クラウドワークスだけでは月数千円で止まる」を相手のために直球で伝え、本気になったら「私たちも本気でサポートします」→ その手段としてPF。【 】は相手・自分の言葉を入れる場所。</p>
<div class="box"><h2>流れ（約50分）</h2>① 自己紹介 → ② 目標 → ③ 現状 → ④ 文章のFB（良い点）→ ⑤ 直球＋自分の経験 → ⑥ 本気の確認 → ⑦ 手段としてPF → 金額 → ⑧ 本人の宣言<br><small>各ステップの緑の「次へ進む基準」が埋まったら次へ。赤は言わない・やらないこと。いつもの「そうですよね → 質問」「当てはめない」は全部のステップで。</small></div>
<nav class="toc" id="toc"></nav><div id="steps"></div></main>
<script type="application/json" id="data">${data}</script>
<script>
(function(){var S=JSON.parse(document.getElementById('data').textContent);function e(s){return String(s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}function hi(s){return e(s).replace(/【([^】]*)】/g,'<b>【$1】</b>')}
document.getElementById('toc').innerHTML=S.map(function(s){return '<a href="#e'+s.n+'">'+s.n+'</a>'}).join('');
document.getElementById('steps').innerHTML=S.map(function(s){var o='<section class="step" id="e'+s.n+'"><div class="time">'+e(s.time)+'</div><h2>'+s.n+'｜'+e(s.title)+'</h2><p class="goal">ゴール：'+e(s.goal)+'</p>';
o+='<div class="done"><b>次へ進む基準</b><ul>'+s.done.map(function(d){return '<li>'+hi(d)+'</li>'}).join('')+'</ul></div>';if(s.avoid)o+='<div class="avoid"><b>言わない・やらない</b><ul>'+s.avoid.map(function(d){return '<li>'+hi(d)+'</li>'}).join('')+'</ul></div>';
s.items.forEach(function(i){if(i.k==='m')o+='<div class="m"><div class="who">緒方</div><div class="say">'+hi(i.t)+'</div></div>';else if(i.k==='c')o+='<div class="c">相手：'+hi(i.t)+'</div>';else if(i.k==='b')o+='<div class="b"><div class="if">もし：'+e(i.if)+'</div><div class="say">'+hi(i.t)+'</div></div>';else o+='<div class="n">'+hi(i.t)+'</div>'});return o+'</section>'}).join('');
var b=document.body,btn=document.getElementById('memory');function ap(v){b.classList.toggle('hide',v);btn.setAttribute('aria-pressed',String(v))}try{ap(localStorage.getItem('energy-memory')==='1')}catch(x){}btn.onclick=function(){var v=!b.classList.contains('hide');ap(v);try{localStorage.setItem('energy-memory',v?'1':'0')}catch(x){}};
document.getElementById('steps').addEventListener('click',function(ev){var t=ev.target.closest('.m,.b');if(t&&b.classList.contains('hide'))t.classList.toggle('shown')});})();
</script></body></html>`;
