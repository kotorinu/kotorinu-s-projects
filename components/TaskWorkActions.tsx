"use client";
import { useState } from "react";
import { useWork } from "@/lib/work/client";
import { useTodayExecution } from "@/lib/todayExecutionStore";
import { effectiveDeadline, isTaskOpen, isTaskBlocked } from "@/lib/taskState";
import { sessionCompletion } from "@/lib/sessionCompletion";
import { useReschedule } from "@/lib/useReschedule";
import type { Task } from "@/lib/types";
import TaskCompleteDialog from "./TaskCompleteDialog";
import RescheduleDialog from "./RescheduleDialog";
import StudioDialog from "./StudioDialog";

export default function TaskWorkActions({ task, onRecorded }: { task: Task; onRecorded?: () => void }) {
  const work = useWork(); const store = useTodayExecution(); const schedule = useReschedule();
  const [modal,setModal] = useState<"complete"|"switch"|"schedule"|null>(null);
  const ready = work.connected && store.executionReady;
  const running = store.startedTaskId === task.id;
  const open = isTaskOpen(task,store);
  function start() { if (!ready || !open) return; store.setTaskDisposition(null,task.id); store.startWork(task.id); setModal(null); }
  function finish(met: boolean) {
    if (!ready || !open) return;
    const record = sessionCompletion(task,{date:store.currentDate,nowIso:new Date().toISOString(),sessions:store.workSessions,actual:store.taskActualMinutes,deadlineOverrides:store.deadlineOverrides,metDefinitionOfDone:met});
    if (running) store.endWork(task.id,"COMPLETE");
    store.completeTask(record); setModal(null); onRecorded?.();
  }
  function stop(disposition:"BLOCKED"|"DROPPED") {
    if (!ready) return;
    if (running) store.endWork(task.id,"STOPPED");
    store.setTaskDisposition({taskId:task.id,disposition,decidedOnDate:store.currentDate,decidedAt:new Date().toISOString(),note:null},task.id);
    setModal(null); onRecorded?.();
  }
  return <div className="space-y-3">
    {open && <div className="flex flex-wrap gap-3">{running ? <button className="studio-secondary" disabled={!ready} onClick={()=>store.endWork(task.id,"STOPPED")}>一時停止</button> : <button className="studio-primary" disabled={!ready} onClick={()=>store.startedTaskId && store.startedTaskId!==task.id?setModal("switch"):start()}>{isTaskBlocked(task,store)?"待ちを解除して再開":store.taskStartedAt.has(task.id)?"作業を再開":"自分の作業を開始"}</button>}<button className={running?"studio-primary":"studio-secondary"} disabled={!ready} onClick={()=>setModal("complete")}>完了を記録</button><button className="studio-secondary" disabled={!ready} onClick={()=>setModal("schedule")}>日時を決める</button></div>}
    {!ready && <p className="text-[14px] leading-6 text-slate-500">作業の記録は、目標・タスクと実績の両方の接続を確認してから使えます。</p>}
    {modal==="switch" && <StudioDialog title="作業を切り替えますか？" onClose={()=>setModal(null)}><p className="mb-5 text-sm leading-7">いま実行中の「{work.tasks.find(t=>t.id===store.startedTaskId)?.title ?? "別のタスク"}」を一時停止して、このタスクを始めます。作業した時間は、それぞれのタスクに残ります。</p><button className="studio-primary" disabled={!ready} onClick={start}>切り替えて開始</button></StudioDialog>}
    {modal==="complete" && <TaskCompleteDialog task={task} today={store.currentDate} deadlineAtCompletion={effectiveDeadline(task,store)} onCompleteMetDoD={()=>finish(true)} onCompleteNoDoD={()=>finish(false)} onRequestReschedule={()=>setModal("schedule")} onBlock={()=>stop("BLOCKED")} onDrop={()=>stop("DROPPED")} onCancel={()=>setModal(null)} />}
    {modal==="schedule" && <RescheduleDialog task={task} currentBlock={schedule.currentBlockFor(task)} today={store.currentDate} effectiveDeadline={effectiveDeadline(task,store)} onCancel={()=>setModal(null)} onConfirm={args=>{if(!ready)return;schedule.reschedule(task,{...args,reason:"本人が日時を決定"});setModal(null);onRecorded?.();}} />}
  </div>;
}
