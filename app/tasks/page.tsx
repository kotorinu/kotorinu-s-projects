"use client";
import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useWork } from "@/lib/work/client";
import { useTodayExecution } from "@/lib/todayExecutionStore";
import { effectiveDeadline, effectiveLifecycle, isTaskDone, isTaskBlocked } from "@/lib/taskState";
import { formatMd } from "@/lib/date";
import { AREA_THEME } from "@/lib/areaTheme";
import StudioHeader from "@/components/StudioHeader";
import StudioConnection from "@/components/StudioConnection";
import StudioEditor from "@/components/StudioEditor";
import TaskDetailSheet from "@/components/TaskDetailSheet";
import type { Task } from "@/lib/types";
const tabs = ["未完了", "進行中", "AI担当", "終了", "すべて"];
export default function TasksPage() { return <Suspense fallback={<div className="studio">タスクを読み込んでいます…</div>}><TasksContent /></Suspense>; }
function TasksContent() {
  const params = useSearchParams();
  const work = useWork(); const store = useTodayExecution();
  const [tab,setTab]=useState("未完了"); const [query,setQuery]=useState(""); const [area,setArea]=useState("すべての領域"); const [month,setMonth]=useState("");
  const [selectedId,setSelectedId]=useState<string|null>(params.get("focus")); const [editTask,setEditTask]=useState<Task|undefined>(); const [adding,setAdding]=useState(false);
  const [sort,setSort]=useState("期限が近い順");
  const selected = work.tasks.find(t=>t.id===selectedId);
  const months = [...new Set(work.tasks.map(t=>effectiveDeadline(t,store)?.slice(0,7)).filter((x):x is string=>!!x))].sort();
  const tasks = useMemo(()=>work.tasks.filter(t=>{
    const done=isTaskDone(t,store); const live=["ACTIVE","BACKLOG"].includes(effectiveLifecycle(t,store));
    if(tab!=="すべて" && (!live || t.status==="Archive")) return false;
    if(tab==="未完了" && done) return false; if(tab==="終了" && !done) return false;
    if(tab==="進行中" && (done || !(t.status==="進行中" || store.taskStartedAt.has(t.id)))) return false;
    if(tab==="AI担当" && (done || !["AI_EXECUTE","AI_DRAFT","HYBRID"].includes(t.aiCapability))) return false;
    if(area!=="すべての領域" && t.area!==area) return false;
    if(month && effectiveDeadline(t,store)?.slice(0,7)!==month) return false;
    return (t.title+" "+t.description+" "+t.area).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
  }).sort((a,b)=>sort==="名前順" ? a.title.localeCompare(b.title,"ja") : (effectiveDeadline(a,store)??"9999").localeCompare(effectiveDeadline(b,store)??"9999")),[work.tasks,tab,area,month,query,sort,store]);
  // Finding a task is the job here, so search and state stay in the open and
  // the rest of the filters fold away. The list has to start inside the first
  // screen — three rows of controls above it meant no task was ever visible.
  return <div className="studio"><StudioHeader title="やること" subtitle="探して、ひとつ進める。" kind="tasks" action={<button className="studio-secondary" onClick={()=>setAdding(true)}>＋ タスクを追加</button>} />
    <div className="mb-4"><label className="sr-only" htmlFor="task-search">タスクを検索</label><input id="task-search" type="search" className="studio-search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="タスク名やキーワードで検索" /></div>
    <div className="studio-toolbar"><div className="studio-tabs" aria-label="タスクの状態">{tabs.map(x=><button key={x} aria-pressed={tab===x} onClick={()=>setTab(x)}>{x}</button>)}</div></div>
    <details className="studio-disclosure mb-5"><summary>絞り込みと並び順{area!=="すべての領域"||month||sort!=="期限が近い順"?"（設定中）":""}</summary><div className="studio-toolbar mt-3 mb-0"><select aria-label="領域で絞り込む" value={area} onChange={e=>setArea(e.target.value)}>{["すべての領域","営業代行","RIALA","GENESIS","Skill Plus","その他"].map(x=><option key={x}>{x}</option>)}</select><select aria-label="期限の月" value={month} onChange={e=>setMonth(e.target.value)}><option value="">すべての月・期限未定</option>{months.map(x=><option key={x} value={x}>{x.replace("-","年")}月</option>)}</select><select aria-label="並び順" value={sort} onChange={e=>setSort(e.target.value)}>{["期限が近い順","名前順"].map(x=><option key={x}>{x}</option>)}</select></div></details>
    <p className="mb-3 text-[14px] text-slate-500">{work.connected ? tasks.length+"件" : "保存済み初期情報の参考表示"}{query && "・検索結果"}</p>
    <div className="studio-card overflow-hidden">{tasks.length===0 ? <div className="studio-empty"><span className="text-3xl text-stone-300" aria-hidden="true">⌕</span><h2 className="font-semibold text-slate-700">該当するタスクはありません</h2><p>条件を変えるか、新しいタスクを追加してください。</p><button className="studio-secondary" onClick={()=>{setQuery("");setArea("すべての領域");setMonth("");setTab("すべて");}}>絞り込みを解除</button></div> : tasks.map(t=>{
      const deadline=effectiveDeadline(t,store); const done=isTaskDone(t,store); const blocked=isTaskBlocked(t,store); const overdue=!done && deadline && deadline<store.currentDate; const state=done?(store.completions[t.id]?.metDefinitionOfDone===false?"基準未確認で終了":"完了"):blocked?"待ち":store.taskStartedAt.has(t.id)?"進行中":t.status;
      const theme=AREA_THEME[t.area as keyof typeof AREA_THEME];
      return <article key={t.id} className="group flex items-center gap-3 border-b border-[#eeeaf3] px-4 py-4 last:border-0 sm:gap-4 sm:px-6"><button className="min-w-0 flex-1 text-left" onClick={()=>setSelectedId(t.id)}><div className="flex items-start gap-3"><span aria-hidden="true" className={"mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border " + (done?"border-[#bbdacc] bg-[#e9f5ee] text-[#56866c]":"border-[#ddd5e9] bg-[#faf8fd] text-[#877896]")}>{done?"✓":state==="進行中"?"•":""}</span><div className="min-w-0"><h2 className={"text-sm font-semibold leading-7 sm:text-[15px] " + (done?"text-slate-500":"text-[#3b334b]")}>{t.title}</h2><div className="mt-2 flex flex-wrap items-center gap-2"><span className="studio-tag" style={theme?{background:theme.soft,color:theme.text}:undefined}>{t.area}</span><span className="text-[14px] text-[#877e94]">{state}</span><span className={"text-[14px] " + (overdue?"text-[#b45d64]":"text-[#877e94]")}>{deadline?"期限 "+formatMd(deadline):"期限未定"}</span>{t.estimateMinutes!==null && <span className="text-[14px] text-[#877e94]">{t.estimateMinutes}分</span>}{t.aiCapability!=="HUMAN" && <span className="studio-tag">{t.aiCapability==="DECISION"?"自分が判断":"AIと進める"}</span>}</div></div></div></button>{work.connected && <button className="studio-icon-button" aria-label={t.title+"を編集"} onClick={()=>setEditTask(t)}>⋯</button>}<span aria-hidden="true" className="hidden text-[#b1a7c0] sm:block">↗</span></article>;
    })}</div>
    <p className="mt-5 text-sm leading-7 text-slate-500">完了・整理した記録も「すべて」から確認できます。</p>
    <div className="mt-8 space-y-4 border-t border-[#eeeaf3] pt-6"><Link className="studio-secondary" href="/tasks/planning">計画・工程を見る</Link><StudioConnection /></div>
    {selected && <TaskDetailSheet key={selected.id} task={selected} onClose={()=>setSelectedId(null)} onNavigateToTask={setSelectedId} />}
    {(adding || editTask) && <StudioEditor kind="task" task={editTask} onClose={()=>{setAdding(false);setEditTask(undefined);}} />}
  </div>;
}
