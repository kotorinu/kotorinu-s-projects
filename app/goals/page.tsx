"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useWork } from "@/lib/work/client";
import { useTodayExecution } from "@/lib/todayExecutionStore";
import { isTaskLive, isTaskDone } from "@/lib/taskState";

import { GOAL_HORIZON_LABEL } from "@/lib/types";
import type { Goal } from "@/lib/types";
import StudioHeader from "@/components/StudioHeader";
import StudioSkeleton from "@/components/StudioSkeleton";
import StudioConnection from "@/components/StudioConnection";
import StudioEditor from "@/components/StudioEditor";
import StudioDialog from "@/components/StudioDialog";
export default function GoalsPage() { return <Suspense fallback={<StudioSkeleton rows={3} />}><GoalsContent /></Suspense>; }
function GoalsContent() {
  const work=useWork(); const store=useTodayExecution(); const params=useSearchParams();
  const [period,setPeriod]=useState("すべて"); const [query,setQuery]=useState(""); const [adding,setAdding]=useState(false); const [editing,setEditing]=useState<Goal|undefined>();
  const [selectedId,setSelectedId]=useState<string|null>(params.get("focus"));
  const selected=work.goals.find(g=>g.id===selectedId);
  const visible=work.goals.filter(g=>(period==="すべて" || (period==="人生の軸" ? g.horizon==="PHILOSOPHY" || g.isNorthStar!==null : period==="仕事" ? g.horizon==="AREA" : period==="近い目標" ? ["1M","3M","6M"].includes(g.horizon) : ["1Y","3Y","5Y"].includes(g.horizon))) && (g.title+" "+g.desiredState).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).sort((a,b)=>(a.targetDate??"9999").localeCompare(b.targetDate??"9999"));
  return <div className="studio"><StudioHeader title="なりたい自分" subtitle="遠くの目標と、いまの一歩。" kind="goals" action={<button className="studio-secondary" onClick={()=>setAdding(true)}>＋ 目標を追加</button>} />
    <input type="search" aria-label="目標を検索" className="studio-search mb-4" value={query} onChange={e=>setQuery(e.target.value)} placeholder="目標や、なりたい状態で検索" />
    <div className="studio-toolbar"><div className="studio-tabs" aria-label="目標の期間">{["すべて","人生の軸","近い目標","長期","仕事"].map(x=><button key={x} aria-pressed={period===x} onClick={()=>setPeriod(x)}>{x}</button>)}</div></div>
    {visible.length===0 ? <div className="studio-card studio-empty"><span className="text-4xl text-stone-300" aria-hidden="true">◎</span><h2 className="font-semibold text-slate-700">まだ、ここに目標はありません</h2><p>目標を追加するか、表示の条件を変えてみてください。</p><button className="studio-secondary" onClick={()=>{setQuery("");setPeriod("すべて");}}>すべての目標を見る</button></div> : <div className="grid gap-5 md:grid-cols-2">{visible.map(g=>{
      const tasks=work.tasks.filter(t=>t.goalId===g.id && isTaskLive(t,store)); const done=tasks.filter(t=>isTaskDone(t,store) && store.completions[t.id]?.metDefinitionOfDone!==false).length; const parent=work.goals.find(x=>x.id===g.parentId);
      return <button key={g.id} className="studio-card flex flex-col p-6 text-left transition-transform hover:-translate-y-1" onClick={()=>setSelectedId(g.id)}><div className="mb-4 flex w-full items-center justify-between gap-2"><span className="studio-tag">{GOAL_HORIZON_LABEL[g.horizon]}</span><span className="text-[14px] text-[#877e94]">{g.targetDate?g.targetDate.replaceAll("-","/")+"まで":"日付は未設定"}</span></div><h2 className="text-lg font-semibold leading-8 text-[#3b334b]">{g.title}</h2><p className="mt-3 line-clamp-2 text-sm leading-7 text-[#786f86]">{g.desiredState}</p><div className="mt-auto w-full pt-6"><div className="flex flex-wrap justify-between gap-2 border-t border-[#eeeaf3] pt-4"><span className="text-[14px] text-[#756b85]">{g.status}</span><span className="text-[14px] text-[#756b85]">{work.connected && store.executionReady? tasks.length?"関連タスク "+done+" / "+tasks.length+"件完了":"次のタスクは未設定":"関連タスクは接続後に確認"}</span></div>{parent && <p className="mt-3 line-clamp-1 text-[14px] text-[#8b819b]">↳ {parent.title}</p>}</div></button>;
    })}</div>}
    <p className="mt-6 text-[14px] leading-6 text-slate-500">タスクの完了数と、目標の達成は別に記録します。</p>
    {selected && <StudioDialog title={selected.title} onClose={()=>setSelectedId(null)}><div className="space-y-6">{!work.connected && <p className="rounded-xl bg-amber-50 p-3 text-[14px] leading-6 text-amber-800">保存済み初期情報の参考表示です。以下の状況や証拠は最新の実績ではありません。</p>}<div><p className="studio-eyebrow">達成したい状態</p><p className="whitespace-pre-line text-sm leading-8">{selected.desiredState}</p></div><div className="rounded-2xl bg-[#f5f1fb] p-5"><h3 className="mb-2 text-sm font-semibold">達成の基準</h3><p className="whitespace-pre-line text-sm leading-8 text-[#756b85]">{selected.achievementCriteria || "まだ設定していません。"}</p></div>{selected.currentGap && <div><h3 className="mb-2 text-sm font-semibold">いま足りていないこと</h3><p className="text-sm leading-8 text-slate-600">{selected.currentGap}</p></div>}{selected.nextEvidence && <div><h3 className="mb-2 text-sm font-semibold">次に残す証拠</h3><p className="text-sm leading-8 text-slate-600">{selected.nextEvidence}</p></div>}
      <div><h3 className="mb-3 text-sm font-semibold">つながる目標</h3>{work.goals.filter(x=>x.id===selected.parentId || x.parentId===selected.id).map(x=><button key={x.id} className="mb-2 block w-full rounded-xl border border-[#e9e3f0] p-3 text-left text-sm leading-7" onClick={()=>setSelectedId(x.id)}>{x.id===selected.parentId?"↑ ":"↳ "}{x.title}</button>)}</div>
      <div><h3 className="mb-3 text-sm font-semibold">関連タスク</h3>{work.tasks.filter(t=>t.goalId===selected.id && isTaskLive(t,store)).map(t=><Link key={t.id} className="mb-2 block rounded-xl bg-[#f8f6fc] p-3 text-sm leading-7" href={"/tasks?focus="+encodeURIComponent(t.id)}>{isTaskDone(t,store) && store.completions[t.id]?.metDefinitionOfDone!==false?"✓ ":"○ "}{t.title}</Link>)}</div>
      <div className="flex flex-wrap gap-3">{work.connected && <button className="studio-primary" onClick={()=>{setEditing(selected);setSelectedId(null);}}>この目標を編集</button>}{selected.linkedUrl && <Link href={selected.linkedUrl} className="studio-secondary">関連する仕事を見る</Link>}</div>
    </div></StudioDialog>}
    <div className="mt-8 space-y-4 border-t border-[#eeeaf3] pt-6"><Link href="/goals/journey" className="studio-secondary">道筋を詳しく見る</Link><StudioConnection /></div>
    {(adding || editing) && <StudioEditor kind="goal" goal={editing} onClose={()=>{setAdding(false);setEditing(undefined);}} />}
  </div>;
}
