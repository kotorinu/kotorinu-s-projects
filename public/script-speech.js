(() => {
 const content=document.querySelector('.content'),bar=document.querySelector('.toolbar');if(!content||!bar)return;
 const box=document.createElement('details');box.style.cssText='padding:16px;margin:16px 0';
 box.innerHTML='<summary>読み上げで聞く</summary><button data-play>このセクションを読む</button> <button data-stop>停止</button> <label>速度 <select aria-label="読み上げ速度"><option value="0.8">ゆっくり</option><option value="1" selected>標準</option><option value="1.2">速め</option></select></label><p role="status"></p><p>画面ロックやアプリ切替で止まる場合があります。</p>';bar.after(box);
 const play=box.querySelector('[data-play]'),status=box.querySelector('[role=status]');if(!('speechSynthesis' in window)){play.disabled=true;status.textContent='読み上げ非対応です';return;}
 let generation=0,current=null;
 function stop(){generation++;speechSynthesis.cancel();current=null;play.disabled=false;status.textContent='停止しました';}box.querySelector('[data-stop]').onclick=stop;
 play.onclick=()=>{stop();if(document.body.classList.contains('editing')){status.textContent='プレビューに切り替えてください';return;}const copy=content.cloneNode(true);copy.querySelectorAll('.hidden-line,button,[hidden]').forEach(n=>n.remove());const parts=copy.textContent.trim().match(/[^。！？\n]{1,140}[。！？\n]?/g)||[];let i=0;const token=generation;play.disabled=true;
 function next(){if(token!==generation)return;if(i>=parts.length){play.disabled=false;current=null;status.textContent='読み終わりました';return;}current=new SpeechSynthesisUtterance(parts[i++]);current.lang='ja-JP';current.rate=Number(box.querySelector('select').value);current.onend=next;current.onerror=()=>{if(token===generation){stop();status.textContent='中断されました。もう一度再生してください';}};status.textContent='読み上げ中 '+i+' / '+parts.length;speechSynthesis.speak(current);}next();};
 new MutationObserver(()=>{if(current)stop();}).observe(content,{childList:true,subtree:true,attributes:true});addEventListener('pagehide',stop);
})();
