// オウンドメディアの教科書 (2026-10-24)。
//
// 理解度テストの答えより一段深く、自分の言葉で説明できるようになるためのページ。
// 用語（PVなど）→ お金が生まれる仕組みと計算 → 会社向けメリットの個人向け言い換え → 弱点 → 営業での言い方。
// 数字の例は「例」であり、ジャンル・時期で大きく変わる。営業で使う時は会社の資料の数字だけ。

const sections: { id: string; title: string; html: string }[] = [
  {
    id: "what",
    title: "1. オウンドメディアとは（入江さんの説明）",
    html: `<p><b>結論、ほぼポートフォリオ。</b>自分専用のWebサイトを作って、ポートフォリオとして仕事を取るのに使いつつ、記事を載せて、アフィリエイト（紹介リンク）や広告を貼れる設計にしたもの。<b>ブログ兼ポートフォリオ兼アフィリエイトサイト</b>。</p>
<p>入江さんの言葉では「ポートフォリオとして使うこともできるし、PV数を増やしていければ、アフィリエイトの収入も立つようになっていく」。</p>
<div class="key"><b>一言で言うと</b>：仕事を取るための「見せる場所」と、記事が残ってお金も生む「資産」を、1つのサイトで持つこと。</div>
<table><tr><th></th><th>ポートフォリオ</th><th>ブログ（note等）</th><th>オウンドメディア</th></tr>
<tr><td>仕事を取る（見せる）</td><td>○</td><td>△</td><td>○</td></tr>
<tr><td>記事が自分の場所に残る</td><td>×</td><td>△（他人の記事と並ぶ）</td><td>○</td></tr>
<tr><td>紹介リンク・広告を自由に置ける</td><td>×</td><td>△（規約しだい）</td><td>○</td></tr>
<tr><td>読まれた数（PV）を見せられる</td><td>×</td><td>△</td><td>○</td></tr></table>`,
  },
  {
    id: "words",
    title: "2. 知っておく言葉（PVなど）",
    html: `<dl>
<dt>PV（ページビュー）</dt><dd>記事が読まれた回数。1人が3記事読めば3PV。「月1万PV」＝ひと月に1万回読まれた。</dd>
<dt>UU（ユニークユーザー）</dt><dd>読みに来た人の数。同じ人が何回来ても1人。</dd>
<dt>SEO（検索エンジン最適化）</dt><dd>Googleなどで検索した時に、自分の記事が上の方に出るように書く工夫。上に出るほど読まれる＝PVが増える。</dd>
<dt>キーワード</dt><dd>読者が検索する言葉（例：「イヤホン 2万円以下 おすすめ」）。記事は1つのキーワードに答えるように書く。</dd>
<dt>クリック率（CTR）</dt><dd>記事を読んだ人のうち、紹介リンクを押した人の割合。</dd>
<dt>成約（CV・コンバージョン）</dt><dd>リンク先で買う・申し込むなど、報酬が出る行動が起きること。成約率＝押した人のうち買った人の割合。</dd>
<dt>アフィリエイト</dt><dd>商品やサービスを紹介して、成約したら報酬をもらう仕組みの総称。Amazonアソシエイトも、ASP経由もこれ。</dd>
<dt>ASP</dt><dd>アフィリエイトの仲介サイト（A8.netなど）。紹介できる企業の案件が並んでいる。</dd>
<dt>セルフバック</dt><dd>ASPの案件に自分で申し込んで報酬をもらうこと。1件ごとの1回きり。</dd>
<dt>承認・承認率</dt><dd>成約しても、企業がチェックして「OK」と認めた分だけが報酬になる。キャンセルなどは否認される。</dd>
<dt>アドセンス（Google AdSense）</dt><dd>記事に自動で広告が出て、表示やクリックで報酬が入る仕組み。審査がある。PVが多いほど増える。</dd>
<dt>ドメイン・サーバー</dt><dd>ドメイン＝サイトの住所（〇〇.com）。サーバー＝サイトを置く場所。どちらも維持費がかかることが多い（誰が払うかは会社で確認）。</dd>
<dt>CPA（顧客獲得単価）</dt><dd>会社が1人のお客さんを得るのにかかったお金。会社向けの言葉。個人で言うなら「仕事を1件取るのにかかる手間」。</dd>
</dl>`,
  },
  {
    id: "money",
    title: "3. お金が生まれる仕組みと計算",
    html: `<div class="key"><b>アフィリエイトの報酬 ＝ PV × クリック率 × 成約率 × 1件の報酬</b></div>
<p><b>例（数字はすべて例。ジャンルや記事で大きく変わる）</b>：ある記事が月3,000PV、クリック率5%で150人がリンクを押し、成約率2%で3人が買い、1件500円の報酬なら、<b>月1,500円</b>。同じような記事が10本あれば月15,000円。</p>
<p>つまり、伸ばし方は4つしかない：①PVを増やす（記事を増やす・検索で上に出る）②クリックしたくなる書き方（使った感想・比べ方）③買いたくなる紹介（本当に良い物・合う人を書く）④報酬の高い案件を選ぶ（転職・クレジットカードなどは1件が大きい）。</p>
<p><b>個人のオウンドメディアの収入の柱（動画・入江さん・会社向け資料をまとめると）</b></p>
<ol><li><b>仕事を取る</b>：ポートフォリオとして使い、案件を受ける。読まれた数（PV）を見せられると、「読まれる記事が書ける人」と証明できて差がつく。</li>
<li><b>アフィリエイト</b>：Amazonアソシエイト、ASP（A8.netなど）の紹介リンク。</li>
<li><b>セルフバック</b>：最初の報酬を体験する入り口（1回きり）。体験がそのまま記事になる。</li>
<li><b>広告（アドセンスなど）</b>：PVが増えた段階で。1,000PVあたり数百円くらいと言われることが多いが、ジャンルで大きく違う。</li>
<li><b>メディアそのものを売る</b>：育ったメディアは売買されることもある（スライドの例：代表が約80万円で売却。会社が証拠を出せる時だけ使う）。</li></ol>
<p><b>時間の目安</b>：検索で読まれるようになるまで、数ヶ月かかることも普通。だから最初はセルフバックと案件で収入を作りながら、記事を積み上げる。</p>`,
  },
  {
    id: "benefits",
    title: "4. 会社向けのメリットを、個人向けに言い換える",
    html: `<p>よく見る「オウンドメディア運用のメリット」は会社向け。面談の相手は個人なので、こう言い換える。</p>
<table><tr><th>会社向けの言葉</th><th>意味</th><th>面談での言い方</th></tr>
<tr><td>流れる発信から残る資産へ（ストック型）</td><td>SNSや広告は流れて消える。記事は残って、ずっと読まれる</td><td>「書いた記事が消えずに残って、自分の代わりに読まれ続けるんです。感想で書いてくださった『資産』って、まさにこれです」</td></tr>
<tr><td>プラットフォーム依存リスクの回避</td><td>SNSの凍結やルール変更に左右されない</td><td>「SNSみたいに、アカウントが止まったら全部なくなる、がないんです。自分の場所なので」</td></tr>
<tr><td>質の高い見込み客・成約率の向上</td><td>自分で検索して来る人は、困っていて買う気がある</td><td>「検索して読みに来る人は、困っている人なので、紹介した物を買ってもらいやすいんです」</td></tr>
<tr><td>中長期的なCPAの低減</td><td>軌道に乗れば、広告費なしで人が来る</td><td>「毎回営業しなくても、記事が代わりに働いてくれるので、だんだん楽になるんです」</td></tr>
<tr><td>自社サービスの販売導線（メイン軸）</td><td>記事から問い合わせ・購入へ</td><td>「個人だと、ここから仕事の依頼が来るのがこれにあたります」</td></tr>
<tr><td>アフィリエイト（サブ軸）</td><td>関連商品を紹介して成果報酬</td><td>「Amazonや、A8.netの紹介リンクです」</td></tr>
<tr><td>純広告・アドセンス</td><td>PVが増えたら広告でも収益</td><td>「読まれる数が増えてきたら、広告からも入るようになります」</td></tr></table>`,
  },
  {
    id: "time",
    title: "5. どれくらいで読まれる・売れるようになる？（目安）",
    html: `<p><b>結論：検索から読まれるまでは、半年くらい見ておくのが普通。早い人で3か月くらい。</b>ジャンル・記事の数・書き方で大きく変わるので、「必ず」とは言わない。</p>
<table><tr><th>時期の目安</th><th>やること</th><th>収入</th></tr>
<tr><td>最初の1か月</td><td>案件で実績と収入を作る／セルフバックで最初の報酬を体験／体験を記事にする</td><td>案件の報酬＋セルフバック（アクセスがなくても入る。承認・入金まで時間がかかる）</td></tr>
<tr><td>〜3か月</td><td>使った物・比べた物の記事を積み上げる／SNSや知り合いへの紹介で、Amazonの最初の数件を取る</td><td>案件＋少しずつアフィリエイト</td></tr>
<tr><td>半年〜</td><td>検索で読まれる記事が出てくる。読まれている記事を直して伸ばす</td><td>PVが増えるほど、アフィリエイト・広告が増えていく</td></tr></table>
<p><b>なぜ時間がかかる？</b>：新しいサイトは、Googleに信頼されて検索の上の方に出るまで時間がかかるため。記事が少ないうちは、ほとんど読まれないのが普通。</p>
<p><b>Amazonの注意</b>：審査があり、登録後180日以内に3件の売上が必要（最新の規約で確認）。検索を待たず、最初の3件はSNSや知り合いへの紹介で取りにいく。</p>
<p><b>現実の数字</b>：アフィリエイトをしている人の多くは、月数千円以下にとどまると言われている。だからこそ「書き続けられる人」「本気の人」だけが伸びる。面談では「全員が稼げるわけではない」と正直に言う。</p>
<p><b>サイトを売る</b>：読まれて収益が出ているメディアは、売買されることがある。価格は毎月の利益や続いた期間で決まり、一般には月の利益の1〜3年分くらいと言われることが多い。スライドの例：代表が運営していたメディア（月20〜30万円の収益）を約80万円で企業に売却（会社が証拠を出せる時だけ使う）。</p>
<div class="key"><b>面談での答え方</b>：「正直、検索から読まれるまでは半年くらい見ておくのが普通です。だから最初は、案件とセルフバックで収入を作りながら、記事を積み上げていく。この順番です」</div>`,
  },
  {
    id: "weak",
    title: "6. 弱点も知っておく（聞かれたら正直に）",
    html: `<ul>
<li><b>すぐには読まれない</b>：検索で上に出るまで数ヶ月かかることも。最初の数ヶ月はPVがほぼない、も普通。</li>
<li><b>Googleの変化には影響を受ける</b>：SNSの凍結リスクはないが、検索の順位はGoogleの更新で上下する。「どこにも依存しない」わけではない。</li>
<li><b>書かなければ何も起きない</b>：記事を積み上げた分だけ。放っておいて増えるものではない。</li>
<li><b>報酬は承認されてから</b>：成約しても、否認されることがある。入金まで時間がかかる。</li>
<li><b>維持費がかかることがある</b>：サーバー・ドメイン。誰が払うかは会社の内容で確認して伝える。</li>
<li><b>ルールがある</b>：広告であることを隠す書き方（ステマ）は禁止。Amazonアソシエイトは審査があり、登録後180日以内に3件の売上が必要（最新の規約で確認）。</li>
</ul>
<p>弱点を先に言える人の方が信頼される。「すぐ稼げます」と言う人が多いからこそ、ここで差がつく。</p>`,
  },
  {
    id: "talk",
    title: "7. 営業で言うなら（長さ別）",
    html: `<p><b>10秒</b>：「結論、ほぼポートフォリオなんです。仕事を取るのに使いながら、書いた記事が残って、お金も生める場所です」</p>
<p><b>30秒</b>：「ポートフォリオは見せたら終わりなんですけど、オウンドメディアは、記事が自分の場所に残って、どれくらい読まれたかも見せられて、Amazonや A8.netの紹介リンクでお金も生めるんです。SNSみたいに流れて消えないので、書いた分だけ資産になっていきます」</p>
<p><b>PVを聞かれたら</b>：「PVは記事が読まれた回数です。読まれるほど、紹介リンクが押されて報酬になりやすいですし、『読まれる記事が書ける人』って数字で見せられるので、仕事も取りやすくなるんです。ただ、検索で読まれるまでは数ヶ月かかることも普通なので、最初は案件とセルフバックで収入を作りながら積み上げていきます」</p>
<p><small>計算式や会社向けの言葉は、自分が理解するためのもの。面談では使わず、相手の目標（④の場面）につながる一言だけ言う（入江さんFB：説明は5分程度）。</small></p>`,
  },
];

export const learnSections = sections;

export const ownedMediaLearnPage = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#f6f5f0"><title>オウンドメディアの教科書｜緒方 Sales Script</title><style>
:root{--bg:#f6f5f0;--card:#fff;--ink:#24302a;--muted:#5f6b63;--line:#dcdcd2;--accent:#2f5f8a;--soft:#eef3fb;--key:#fff8e6}
@media(prefers-color-scheme:dark){:root{--bg:#151a18;--card:#1f2522;--ink:#e8ece9;--muted:#aab3ad;--line:#353d38;--accent:#a9c7ea;--soft:#1d2b3a;--key:#352d1b}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:17px/1.85 -apple-system,BlinkMacSystemFont,"Hiragino Sans","Yu Gothic UI",sans-serif}
header{position:sticky;top:0;z-index:5;background:var(--card);border-bottom:1px solid var(--line);padding:10px 16px}header .row{display:flex;gap:12px;overflow:auto;white-space:nowrap;font-size:14px}a{color:var(--accent);text-decoration:none}
main{max-width:760px;margin:auto;padding:20px 16px 90px}h1{font-size:24px;margin:0 0 6px}.lead{color:var(--muted);font-size:15px;margin:0 0 14px}
.toc{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 16px}.toc a{background:var(--card);border:1px solid var(--line);border-radius:999px;padding:4px 10px;font-size:13px;color:var(--ink)}
section{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px;margin:0 0 16px}section h2{font-size:19px;margin:0 0 8px}
.key{background:var(--key);border-radius:10px;padding:8px 12px;margin:8px 0}dt{font-weight:700;margin-top:8px}dd{margin:0 0 4px 0;color:var(--ink)}
table{width:100%;border-collapse:collapse;font-size:14px;margin:8px 0;display:block;overflow-x:auto}th,td{border:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top;min-width:6em}th{background:var(--soft)}
ol,ul{padding-left:22px}small{color:var(--muted)}
</style></head><body>
<header><div class="row"><a href="/today">← WorkOS</a><a href="/sales-script/owned-media">トーク台本（オウンドメディア版）</a><a href="/sales-script/owned-media/quiz">理解度テスト</a></div></header>
<main><h1>オウンドメディアの教科書</h1><p class="lead">理解度テストの答えより一段深く。自分が分かっていると、短く言える。面談で話すのは「7. 営業で言うなら」の一言だけ。数字の例はジャンルや時期で大きく変わるので、営業では会社の資料の数字だけを使う。</p>
<nav class="toc">${sections.map((s) => `<a href="#${s.id}">${s.title.split("（")[0]}</a>`).join("")}</nav>
${sections.map((s) => `<section id="${s.id}"><h2>${s.title}</h2>${s.html}</section>`).join("\n")}
</main></body></html>`;
