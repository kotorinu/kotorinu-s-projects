"use client";
import { useState, type ComponentProps } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useWork } from "@/lib/work/client";
import { useTodayExecution } from "@/lib/todayExecutionStore";
import { effectiveDeadline, isTaskDone } from "@/lib/taskState";
import { liveTimeBlocks } from "@/lib/livePlan";
import type AdvancedView from "./AdvancedTaskDetailSheet";
import StudioDialog from "./StudioDialog";
import StudioEditor from "./StudioEditor";
import TaskWorkActions from "./TaskWorkActions";
import ManualActualEntry from "./ManualActualEntry";
import TaskAgentWork from "./TaskAgentWork";

const AdvancedTaskDetailSheet = dynamic(()=>import("./AdvancedTaskDetailSheet"));
export default function TaskDetailSheet(props: ComponentProps<typeof AdvancedView>) {
  const work = useWork(); const store = useTodayExecution();
  const [view,setView] = useState<"summary"|"advanced"|"edit">("summary");
  const task = work.tasks.find(t=>t.id===props.task.id) ?? props.task;
  const goal = work.goals.find(g=>g.id===task.goalId);
  const deadline = effectiveDeadline(task,store);
  const blocks = liveTimeBlocks(store).filter(b=>b.taskId===task.id).sort((a,b)=>(a.date+a.startTime).localeCompare(b.date+b.startTime));
  const next = blocks.find(b=>b.date>=store.currentDate);
  const actual = store.taskActualMinutes.get(task.id) ?? store.completions[task.id]?.actualMinutes ?? task.actualMinutes;
  const done = isTaskDone(task,store);
  if(view==="advanced") return <AdvancedTaskDetailSheet {...props} task={task} onClose={()=>setView("summary")} />;
  if(view==="edit") return <StudioEditor kind="task" task={task} onClose={()=>setView("summary")} />;
  return <StudioDialog title={task.title} onClose={props.onClose}><div className="space-y-6">
    {!work.connected && <p className="rounded-xl bg-amber-50 p-3 text-[14px] leading-6 text-amber-800">接続前の参考表示です。最新の状況ではありません。</p>}
    <div className="flex flex-wrap gap-2"><span className="studio-tag">{task.area}</span><span className="studio-tag">{done?store.completions[task.id]?.metDefinitionOfDone===false?"基準未確認で終了":"完了":store.startedTaskId===task.id?"作業中":task.status}</span><span className="studio-tag">{deadline?"期限 "+deadline.replaceAll("-","/"):"期限未定"}</span></div>
    {task.description && <p className="whitespace-pre-line text-sm leading-8 text-[#756b85]">{task.description}</p>}
    <section className="rounded-2xl bg-[#f5f1fb] p-5"><h3 className="mb-3 text-sm font-semibold">ここまでできたら完了</h3>{task.definitionOfDone.length?<ul className="space-y-3">{task.definitionOfDone.map((d,i)=><li key={i} className="flex gap-3 text-sm leading-7"><span className="text-violet-400" aria-hidden="true">○</span><span>{d}</span></li>)}</ul>:<p className="text-sm leading-7 text-slate-500">完了条件はまだ設定していません。</p>}</section>
    {(task.blockedOnInfo || store.dispositions[task.id]?.disposition==="BLOCKED") && <p className="rounded-xl bg-amber-50 p-4 text-sm leading-7 text-amber-800">情報待ち：{store.dispositions[task.id]?.note ?? task.blockedOnInfo ?? "次に進める条件を確認してください。"}</p>}
    <div className="grid grid-cols-2 gap-4 rounded-2xl bg-[#f8f7fb] p-4 text-sm"><div><p className="mb-2 text-[14px] text-slate-500">作業する日時</p><p className="leading-7">{next?next.date.replaceAll("-","/")+" "+next.startTime+"〜"+next.endTime:"未設定"}</p>{next && <p className="mt-1 text-[14px] leading-6 text-slate-500">アプリ内の計画です。Calendarで照合できます。</p>}</div><div><p className="mb-2 text-[14px] text-slate-500">見積り / 記録した時間</p><p className="leading-7">{task.estimateMinutes===null?"未設定":task.estimateMinutes+"分"} / {actual===null?"未入力":actual+"分"}</p></div></div>
    {goal && <Link className="block rounded-xl border border-[#eee9f6] p-4 text-sm leading-7 text-[#675790]" href={"/goals?focus="+encodeURIComponent(goal.id)}>つながる目標：{goal.title} →</Link>}
    <TaskWorkActions task={task} />
    <TaskAgentWork key={task.id} task={task} />
    {work.connected && store.executionReady && <ManualActualEntry task={task} actualMinutes={actual} isManual={store.manualActualTaskIds.has(task.id)} onSave={m=>store.setManualActualMinutes(task.id,m)} onClear={()=>store.setManualActualMinutes(task.id,null)} />}
    <div className="flex flex-wrap gap-3 border-t border-[#eee9f6] pt-5">{work.connected && <button className="studio-secondary" onClick={()=>setView("edit")}>内容を編集</button>}<button className="studio-secondary" onClick={()=>setView("advanced")}>手順・履歴・詳細設定</button></div>
  </div></StudioDialog>;
}
