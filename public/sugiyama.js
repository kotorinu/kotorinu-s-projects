/* 2026-09-25 master source; navigation notes remain separate from dialogue. */
(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const inline = s => esc(s).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  const source = JSON.parse($('#seed').textContent);
  const key = 'sugiyama-2026-09-24-practice';
  const draftKey = 'sugiyama-2026-09-24-draft';
  let practice = {done:{}, checks:{}, notes:{}, index:0, font:18, dark:false, view:null, showNotes:false};
  try { Object.assign(practice, JSON.parse(localStorage.getItem(key) || '{}')); } catch { /* reading still works */ }
  let md = source, revision = null, canEdit = false, dirty = false, saving = false, timer, mode = ['nav','memory','full'].includes(practice.view) ? practice.view : (window.matchMedia('(pointer: fine)').matches ? 'full' : 'nav'), review = false, branchFrom = null, editor = null, speech = null;
  let phases = [], index = 0;
  const hints = `場の安心を作る|自己紹介と時間確認が済む
文章経験とAI使用を確認|文章力が主な課題か仮判断できる
副業の動機を聞く|収入の柱を持ちたい理由を本人に確認
副業選びの条件を知る|本業との両立と継続の条件を確認
本業の働き方を知る|仕事内容と勤務時間が分かる
守りたい生活と上達経験を聞く|趣味の価値と教わった経験を確認
理想の収入を聞く|本人の目標額が分かる
目標額の理由を聞く|今と将来に使う意味を本人に確認
未来の感情を具体化|本人の言葉で気持ちが出る
目指す時期を聞く|期間とその理由を確認
理想の未来をすり合わせ|まとめへの本人の同意が取れる
応募と獲得の現在地を知る|開始時期・応募・返信・獲得状況を確認
相談者の傾向を共有|質問だけの流れを止め共通課題を伝える
使える時間を確かめる|週の稼働時間を本人に確認
現在の副業収入を聞く|現在の金額が分かる
現在地をすり合わせ|まとめへの本人の同意が取れる
目標と現状の差を確認|今のやり方を変える必要性を確認
案件獲得を直近課題として合意|本人から「そうですね」が出る
すでに持つ強みを確認|目標・時間・行動・書く力を確認
必要なものを2段階に分ける|取るための2つと継続の2つを伝える
2＋2の理解を確認|見せるもの・実績／進め方・環境を整理
PFの有無を確認|今持っているか分かる
北本動画を回収|動画の記憶とPFのイメージを確認
PFを履歴書として説明|企業に自分を見せる役割を伝える
PFを早めに作る意義を伝える|原文の約8倍を資料上の説明として伝える
発注者側の見方を伝える|PFで判断しやすくなる理由を伝える
作り方の疑問を共有|北本PFを見る同意を取る
PFの第一印象を聞く|画面が見え感想を聞ける
名前と一言の役割を説明|どんなライターか伝わる仕組みを示す
経歴と強みの見せ方を示す|ぱっと分かる構成を説明
掲載できる実績を説明|掲載許可と北本の美容分野の経験を伝える
得意ジャンルと本業経験を結ぶ|人気ジャンル・専門性・製造業経験を整理
単価と執筆時間の例を示す|5〜6時間の例と本人の結果保証を区別
問い合わせまでの構成を示す|発注側が知りたい情報を説明
PFへの感想を聞く|本人のイメージとの差が分かる
見せ方の違いを比較|発注者目線で選んでもらう
第一印象の重要性を説明|開いてもらう流れを伝える
PF制作経験を聞く|作ったことがあるか分かる
自作の見通しを聞く|難しさと必要時間の認識を確認
制作方法と外注相場を示す|資料上の15万円・20万円を提示
制作後の編集も考える|実績と一緒に育てる意味を伝える
NEXBOの全体像へつなぐ|2＋2がサービスでつながると伝える
専用PFを説明|経歴・強み・希望を反映する説明
修正回数を伝える|2回修正を明示
編集権限を伝える|本人が実績追加できると説明
案件保証を説明|実績に載せる案件3件を伝える
FBの中身を具体化|全3件・良い点・問題と解決策・リライト例を伝える
基礎を身につける意味を説明|3件の経験を次につなげる目的を伝える
制作期間と案件のペースを区別|PFの目安と3案件に取り組む期間を説明
購入後の順序を見せる|PF→3案件→FB→実績→次の案件を伝える
相談相手と方法を示す|Slackのメンバーと聞ける内容を伝える
上達経験を条件付きで回収|教わった事実が出た場合だけつなぐ
基礎動画を説明|動画と実案件で学ぶ順を伝える
完成後の面談を説明|完成後10日以内の相談を伝える
保証条件を正確に伝える|案件3件と0件時返金の条件を区別
2＋2と商品を対応づけ|PF・案件／FB等・Slackを回収
実績者の例を伝える|3名の例と結果保証ではない旨を伝える
本人の理想へ戻る|サービスを本人の目的へつなぐ
金額の前に内容を確認|良い点と残る内容の疑問を聞く
内容込みの価格を伝える|79,800円を提示して返答を待つ
分割条件を説明|約3,500円〜と手数料確認を伝える
高い理由を分ける|価値か支払余力かを聞く
価値への疑問を特定|分からない部分だけ説明して確認
予算と不安を分ける|支払余力か進め方への不安か確認
自信を得る過程を示す|3案件とFBを説明し保証はしない
予算を確認する|正式承認のない値引きは提示しない
考えたい対象を具体化|お金・家族・その他の論点が分かる
見えない部分を確認|購入後の流れと残る疑問を確認
家族相談の準備をする|必要情報と相談時期を本人に確認
時間の不安を確認|前半の実際の回答と不安を照合
自信の不安を分ける|文章力か進め方かを聞く
判断に必要な情報を整理|判断条件と時期を本人が決める
残り時間を確認|急がせず今日扱う範囲を決める
最後の不安を確認|内容・金額・進め方の疑問を聞く
本人の意思を確認|始めたいか本人に決めてもらう
決済手続きを案内|本人がリンクを開けるか確認
決済確認とSlack案内|実際の決済確認後に案内
未来を回収して締める|最初の行動と相談先を再確認`.split('\n').map(x => x.split('|'));
  const checkpoints = {23:['北本動画を回収した'],24:['PF＝履歴書を説明した'],25:['資料上の約8倍を伝えた'],26:['NEXBOの何百件の発注者視点を伝えた'],38:['「作ったことあります？」を聞いた'],40:['外注相場を見せた'],44:['2回修正を伝えた'],45:['編集権限を伝えた'],46:['案件保証3件を伝えた'],47:['3案件すべてFBを伝えた','良い点の言語化を伝えた','問題＋解決策を伝えた','具体的リライト例を伝えた'],51:['Slackの相談相手を伝えた'],53:['基礎動画を伝えた'],54:['アフター面談を伝えた'],55:['返金保証条件を省略せず伝えた'],57:['実績者3名と結果保証ではない旨を伝えた']};
  const branchTargets = [['高い',62],['考えたい',67],['お金がない',64],['自分にできるか不安',71],['家族に相談',69],['時間がない',70]];
  function status(s){$('#status').textContent=s;const e=$('#editStatus');if(e)e.textContent=s;}
  function persist(){try{localStorage.setItem(key,JSON.stringify(practice));}catch{status('このブラウザにはチェックを保存できません');}}
  function parse(text){const matches=[...text.matchAll(/^# (\d+)｜([^\r\n]+).*$/gm)];return matches.map((m,i)=>({id:Number(m[1]),title:SugiyamaReading.title(m[2]),raw:text.slice(m.index,i+1<matches.length?matches[i+1].index:text.length)}));}
  function getPhase(){return phases[index];}
  function clean(s){return s.replace(/\*\*/g,'').replace(/^> ?/gm,'').trim();}
  function originalField(raw,name){const m=raw.match(new RegExp('^### '+name+'\\s*\\r?\\n([\\s\\S]*?)(?=^#{1,3} |$(?![\\s\\S]))','m'));return m?clean(m[1].replace(/\n---\s*$/,'')):'';}
  function summary(p){const h=hints[p.id-1]||[p.title,'原文で相手の返答を確認'];return {goal:originalField(p.raw,'目的')||h[0],done:originalField(p.raw,'完了条件')||h[1],supplement:!originalField(p.raw,'目的')||!originalField(p.raw,'完了条件')};}
  function renderMarkdown(text, memory=false){
    text=SugiyamaReading.text(text).replace(/^# \d+｜[^\n]*\n?/, '');
    let html='',buf=[],speaker='';
    function flush(){if(!buf.length)return;const body=buf.join('\n').trim();buf=[];if(!body)return;let inQuote=false;const content=body.split(/\n\s*\n/).map(p=>{const value=p.replace(/^> ?/gm,'');const dialogue=inQuote||/^\s*「|→\s*「/.test(value);for(const char of value){if(char==='「')inQuote=true;else if(char==='」')inQuote=false;}const cls=dialogue?'':' class="stage-note"';return '<p'+cls+'>'+inline(value)+'</p>';}).join('');const cls=speaker.includes('杉山')?'client':'mine';
      if(speaker){html+='<section class="speech '+cls+'"><span class="speaker">'+esc(speaker)+'</span>'+(memory&&cls==='mine'?'<details><summary>タップして緒方のセリフを表示</summary><div class="md">'+content+'</div></details>':'<div class="md">'+content+'</div>')+'</section>';}else html+='<div class="md">'+content+'</div>';}
    for(const line of text.split(/\r?\n/)){const h=line.match(/^(#{1,3}) (.*)$/);if(h){flush();if(/^緒方$|^杉山さん/.test(h[2])){speaker=h[2];}else{speaker='';html+='<h3>'+inline(h[2])+'</h3>';}}else if(line==='---'){flush();speaker='';}else buf.push(line);}flush();return html;
  }
  function stopSpeech(){if('speechSynthesis' in window)window.speechSynthesis.cancel();speech=null;}
  function go(i){stopSpeech();index=Math.max(0,Math.min(i,phases.length-1));practice.index=index;persist();render();$('#card').scrollIntoView({block:'start'});}
  function renderFull(){
    $('#position').textContent='全文：'+phases.length+'フェーズ';$('#goal').textContent='上から順に、1ページで全文を読めます';
    $('#card').className='full-script';
    $('#card').innerHTML=phases.map(p=>'<section class="card phase-heading full-phase" id="phase-'+p.id+'"><h2>'+p.id+'｜'+esc(p.title)+'</h2>'+renderMarkdown(p.raw)+'</section>').join('');
    $('#branches').hidden=true;$('#review').textContent='未暗記だけ復習';
  }
  function render(){
    const p=getPhase();if(!p){$('#card').innerHTML='<p>番号付きフェーズが見つかりません。全文編集で原文を確認してください。</p>';return;}
    document.body.classList.toggle('full-mode',mode==='full');
    document.body.classList.toggle('show-notes',!!practice.showNotes);$('#notesToggle').setAttribute('aria-pressed',String(!!practice.showNotes));$('#notesToggle').textContent=practice.showNotes?'補足を隠す':'補足を表示';
    $('#navMode').setAttribute('aria-pressed',String(mode==='nav'));$('#memoryMode').setAttribute('aria-pressed',String(mode==='memory'));$('#fullMode').setAttribute('aria-pressed',String(mode==='full'));
    if(mode==='full'){renderFull();return;}
    const s=summary(p);$('#position').textContent='現在地：'+p.id+' / '+phases.length;$('#goal').textContent='今のゴール：'+s.goal;
    $('#card').className='card phase-heading';
    let html='<h2>'+p.id+'｜'+esc(p.title)+'</h2><p><strong>目的：</strong>'+esc(s.goal)+'</p><p><strong>完了：</strong>'+esc(s.done)+'</p>';
    if([6,52,65].includes(p.id))html+='<details><summary>🏄 後半回収フラグ</summary><p>誰と始めた？／どう上達した？／誰かに教わった？／今も一緒に行く？</p><p>「教わって上達した」が実際に出た場合だけ、自信・相談環境の話へ。独学なら決めつけない。</p><button data-jump="52">相談環境の回収へ</button><button data-jump="65">自信の分岐へ</button></details>';
    if(p.id>=60&&p.id<=66)html+='<div class="notice"><strong class="price">79,800円</strong><br>24分割：約3,500円〜（手数料等は決済時確認）<br>資料上の比較：個人デザイナー 約15万円／デザイン会社 約20万円</div>';
    if(p.id===66)html+='<p class="notice">承認状況は未確認。原文の値引き例は正式価格ではありません。4,980円を有効な提案・決済価格としては使用しません。</p>';
    html+='<details data-script '+(mode==='memory'?'open':'')+'><summary>トークを開く</summary>'+renderMarkdown(p.raw,mode==='memory')+'</details>';

    const checks=checkpoints[p.id]||[s.done];html+='<details><summary>抜け防止チェック（'+checks.filter((_,i)=>practice.checks[p.id+'-'+i]).length+'/'+checks.length+'）</summary>'+checks.map((c,i)=>'<label class="check"><input type="checkbox" data-check="'+p.id+'-'+i+'" '+(practice.checks[p.id+'-'+i]?'checked':'')+'>'+esc(c)+'</label>').join('')+'</details>';
    $('#card').innerHTML=html;$('#mastered').checked=!!practice.done[p.id];$('#memo').value=practice.notes[p.id]||'';
    $('#progress').textContent=phases.filter(p=>practice.done[p.id]).length+' / '+phases.length+' 暗記済み';
    $('#prev').disabled=index===0;$('#next').disabled=index===phases.length-1;$('#branches').hidden=p.id<59&&branchFrom===null;$('#returnBranch').hidden=branchFrom===null;
    $('#review').textContent=review?'復習中・全体へ戻る':'未暗記だけ復習';
  }
  function openDialog(title,html){$('#dialogTitle').textContent=title;$('#dialogBody').innerHTML=html;$('#dialog').showModal();}
  function closeDialog(){if(editor)applyPreview();$('#dialog').close();editor=null;}
  $('#close').onclick=closeDialog;$('#dialog').addEventListener('close',()=>{if(editor)applyPreview();editor=null;});
  $('#dialog').addEventListener('click',e=>{if(e.target===$('#dialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeDialog();}});
  function jump(id){const target=phases.findIndex(p=>p.id===id);if(target>=0){branchFrom=index;mode='nav';practice.view='nav';go(target);$('#card [data-script]').open=true;}}
  document.addEventListener('click',e=>{const b=e.target.closest('[data-jump]');if(b)jump(Number(b.dataset.jump));});
  $('#card').addEventListener('change',e=>{if(e.target.dataset.check){practice.checks[e.target.dataset.check]=e.target.checked;persist();}});
  $('#branchButtons').innerHTML=branchTargets.map(([label,id])=>'<button data-jump="'+id+'">'+label+'</button>').join('');
  $('#returnBranch').onclick=()=>{const i=branchFrom;branchFrom=null;go(i);};
  $('#mastered').onchange=e=>{practice.done[getPhase().id]=e.target.checked;persist();$('#progress').textContent=phases.filter(p=>practice.done[p.id]).length+' / '+phases.length+' 暗記済み';};
  $('#memo').oninput=e=>{practice.notes[getPhase().id]=e.target.value;persist();};
  function setMode(next){stopSpeech();mode=next;practice.view=next;persist();render();$('#card').scrollIntoView({block:'start'});}
  $('#memoryMode').onclick=()=>setMode('memory');$('#navMode').onclick=()=>setMode('nav');$('#fullMode').onclick=()=>setMode('full');
  $('#notesToggle').onclick=()=>{practice.showNotes=!practice.showNotes;persist();render();};
  function move(dir){let n=index+dir;while(review&&n>=0&&n<phases.length&&practice.done[phases[n].id])n+=dir;if(n>=0&&n<phases.length)go(n);else status('この方向に未暗記のフェーズはありません');}
  $('#prev').onclick=()=>move(-1);$('#next').onclick=()=>move(1);
  $('#review').onclick=()=>{review=!review;const n=phases.findIndex(p=>!practice.done[p.id]);if(review&&n<0){review=false;status('全フェーズが暗記済みです');}else if(review)go(n);render();};
  $('#toc').onclick=()=>{openDialog('フェーズを選ぶ', '<p>全'+phases.length+'フェーズ</p>'+phases.filter(p=>!review||!practice.done[p.id]).map(p=>'<button class="toc-item" data-phase="'+p.id+'">'+(practice.done[p.id]?'✓ ':'')+p.id+'｜'+esc(p.title)+'</button>').join(''));$('#dialogBody').onclick=e=>{const b=e.target.closest('[data-phase]');if(!b)return;const id=Number(b.dataset.phase);closeDialog();if(mode==='full'){const target=$('#phase-'+id);if(target)target.scrollIntoView({block:'start'});}else go(phases.findIndex(p=>p.id===id));};};
  $('#references').onclick=()=>{openDialog('基準資料', '<p>正本：WorkOS「緒方版｜杉山さんロープレ ラポール重視版」（2026年9月24日）。想定回答より本人の発言を優先し、全質問を順番に読み切りません。</p><div class="notice">浅く聞く → 趣味で会話 → 許可 → フックへ戻って縦掘り<br>目標 → 現状 → 障害 → 認識合わせ → 必要な支援だけ提案</div><h3>価格前の確認</h3><p>内容面の疑問を確認し、本人が役立つ部分を説明できてから総額と正式条件を案内します。収益は保証しません。</p><details><summary>共通の進め方</summary>'+renderMarkdown(md.slice(0,md.indexOf('# 1｜')))+'</details>');};
  async function api(path,options={}){const r=await fetch('/api/riala/script/'+path+'?edition=sugiyama',{...options,signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json'}});const d=await r.json();if(!r.ok){const err=new Error(d.error||'接続できません');err.status=r.status;throw err;}return d;}
  function localDraft(){try{localStorage.setItem(draftKey,JSON.stringify({md,revision,at:new Date().toISOString()}));return true;}catch{return false;}}
  async function save(manual=false){if(!dirty||saving)return;if(!canEdit||revision===null){status('未同期：この端末の下書きのみ。接続後にクラウド保存してください');return;}saving=true;const sent=md;status('保存中…');try{const d=await api('document',{method:'PUT',body:JSON.stringify({content:sent,revision,note:manual?'手動保存':'自動保存'})});revision=d.revision;if(md===sent){dirty=false;try{localStorage.removeItem(draftKey);}catch{ /* retain safe state */ }status('クラウド保存済み');}else{localDraft();status('未保存の変更あり');clearTimeout(timer);timer=setTimeout(()=>save(),1200);}}catch(e){if(e.status===409){canEdit=false;status('競合：自動保存を停止しました。書き出してから再読み込みしてください');}else status('未同期：'+e.message+'。下書きを書き出せます');}finally{saving=false;}}
  function changed(value){md=value;dirty=true;const stored=localDraft();status(stored?'未保存・端末に一時保存済み':'未保存：端末保存不可。書き出してください');clearTimeout(timer);timer=setTimeout(()=>save(),1200);}
  function exportMd(){const url=URL.createObjectURL(new Blob([md],{type:'text/markdown;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='緒方版_ラポール重視_2026-09-24.md';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function applyPreview(){phases=parse(md);index=Math.min(index,Math.max(0,phases.length-1));render();}
  $('#tools').onclick=()=>{
    openDialog('編集・設定','<div class="tools"><button id="smaller">文字−</button><button id="larger">文字＋</button><button id="theme">明暗切替</button><button id="speak">このフェーズを読み上げ</button><button id="stopSpeech">停止</button></div><details><summary>Markdownを編集・保存</summary><p class="muted">全文を1つのMarkdownとして編集。杉山版だけを保存します。未接続でも端末下書きは編集できます。</p><textarea id="markdown" aria-label="杉山版Markdown"></textarea><p id="editStatus" role="status"></p><div class="tools"><button id="save">保存</button><button id="preview">プレビューへ</button><button id="export">Markdown書き出し</button><label class="button">Markdown読込<input id="import" type="file" accept=".md,.txt,text/plain,text/markdown" hidden></label><button id="history">履歴・復元</button></div></details>');
    editor=$('#markdown');editor.value=md;$('#editStatus').textContent=$('#status').textContent;editor.oninput=()=>changed(editor.value);
    function font(d){practice.font=Math.max(16,Math.min(26,practice.font+d));document.documentElement.style.setProperty('--fs',practice.font+'px');persist();}
    $('#smaller').onclick=()=>font(-2);$('#larger').onclick=()=>font(2);$('#theme').onclick=()=>{practice.dark=!practice.dark;document.body.classList.toggle('dark',practice.dark);persist();};
    $('#preview').onclick=()=>{applyPreview();closeDialog();};$('#save').onclick=()=>save(true);$('#export').onclick=exportMd;
    $('#import').onchange=async e=>{const file=e.target.files[0];if(!file)return;if(file.size>120000){status('ファイルが大きすぎます');return;}const text=await file.text();if(!parse(text).length){status('「# 1｜名前」の形式のフェーズが必要です');return;}if(confirm('杉山版の本文を置換します。未保存の変更は先に書き出してください。続けますか？')){editor.value=text;changed(text);applyPreview();}};
    $('#history').onclick=async()=>{if(dirty){status('履歴を開く前に、保存またはMarkdown書き出しをしてください');return;}try{const d=await api('versions');openDialog('クラウド履歴（直近10版）',d.versions.length?d.versions.map(v=>'<button class="toc-item" data-restore="'+v.id+'">'+esc(v.created_at)+' '+esc(v.note)+'</button>').join(''):'保存履歴はまだありません');$('#dialogBody').onclick=async e=>{const b=e.target.closest('[data-restore]');if(!b||!confirm('この版へ復元しますか？'))return;b.disabled=true;try{const r=await api('restore/'+b.dataset.restore,{method:'POST',body:JSON.stringify({revision})});md=r.content;revision=r.revision;dirty=false;applyPreview();closeDialog();status('復元・クラウド保存済み');}catch(err){status(err.message);b.disabled=false;}};}catch(e){status(e.message);}};
    $('#stopSpeech').onclick=stopSpeech;$('#speak').onclick=()=>{if(!('speechSynthesis' in window)){status('このブラウザは読み上げ非対応です');return;}stopSpeech();const chunks=clean(SugiyamaReading.text(getPhase().raw)).match(/[\s\S]{1,120}(?:[。！？\n]|$)|[\s\S]{1,120}/g)||[];let n=0;const token={};speech=token;const next=()=>{if(speech!==token||n>=chunks.length)return;const u=new SpeechSynthesisUtterance(chunks[n++]);u.lang='ja-JP';u.onend=next;u.onerror=()=>status('読み上げを停止しました');window.speechSynthesis.speak(u);};next();};
  };
  window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});window.addEventListener('pagehide',stopSpeech);
  if('serviceWorker' in navigator)navigator.serviceWorker.register('/sales-script/sw.js').catch(()=>{});
  document.documentElement.style.setProperty('--fs',Math.max(16,Math.min(26,practice.font))+'px');document.body.classList.toggle('dark',!!practice.dark);
  phases=parse(md);index=Math.min(Math.max(0,Number(practice.index)||0),phases.length-1);render();
  api('document').then(d=>{revision=d.revision;canEdit=d.canEdit;let draft;try{draft=JSON.parse(localStorage.getItem(draftKey)||'null');}catch{ /* ignore invalid local data */ }if(dirty)return;if(draft&&typeof draft.md==='string'&&draft.md!==d.content){md=draft.md;dirty=true;canEdit=canEdit&&draft.revision===revision;status(canEdit?'未保存：端末下書きを復元しました。保存ボタンで同期できます':'端末に未同期の下書きがあります。書き出してクラウドと照合してください');}else{md=d.content;status(d.persistent?'クラウド読込済み'+(canEdit?'・編集可能':'・編集は端末下書き'):'クラウド未接続・添付正本を表示');}applyPreview();}).catch(()=>{try{const d=JSON.parse(localStorage.getItem(draftKey)||'null');if(d&&typeof d.md==='string'&&!dirty){md=d.md;dirty=true;applyPreview();}}catch{ /* invalid cache */ }status(dirty?'接続失敗：端末の未同期下書きを表示':'オフライン／接続失敗：添付正本を表示しています');});
})();
