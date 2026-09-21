"use client";
import { useEffect, useState } from "react";
import { useWork } from "@/lib/work/client";
import { useTodayExecution } from "@/lib/todayExecutionStore";
import { isTaskOpen } from "@/lib/taskState";
import type { Task } from "@/lib/types";

const labels={QUEUED:"実行担当への引き渡し待ち",RUNNING:"実行中",REVIEW:"成果物の確認待ち",BLOCKED:"実行を停止しています",ACCEPTED:"成果物を確認済み"};
export default function TaskAgentWork({task}:{task:Task}) {
  const work=useWork(); const store=useTodayExecution(); const [busy,setBusy]=useState(false); const [error,setError]=useState(""); const [reviewedId,setReviewedId]=useState<string|null>(null);
  const runs=work.runs.filter(r=>r.taskId===task.id); const run=runs.at(-1);
  const supported=["AI_EXECUTE","AI_DRAFT","HYBRID","DECISION"].includes(task.aiCapability);
  const refresh=work.refresh; const runStatus=run?.status;
  useEffect(()=>{if(supported || runs.length)void refresh();},[task.id,supported,runs.length,refresh]);
  useEffect(()=>{
    if(!runStatus || !["QUEUED","RUNNING"].includes(runStatus))return;
    const timer=setInterval(()=>{if(document.visibilityState==="visible")void refresh();},15000);
    return ()=>clearInterval(timer);
  },[runStatus,refresh]);
  if(!supported && !runs.length)return null;
  async function submit(body:Record<string,unknown>) {setBusy(true);setError("");try{await work.mutate(body);}catch(e){setError(e instanceof Error?e.message:"保存できませんでした。");}finally{setBusy(false);}}
  return <section className="rounded-2xl border border-[#e9e1f3] p-5"><div className="mb-3 flex flex-wrap items-center justify-between gap-3"><h3 className="text-sm font-semibold">AIに渡す作業・成果物</h3><button className="studio-secondary" disabled={busy} onClick={()=>void work.refresh()}>状況を再確認</button></div>{!work.connected?<p className="text-sm leading-7 text-slate-500">接続すると、保存された実行状態と成果物を確認できます。</p>:run?<><p role="status" className="text-sm leading-7">{labels[run.status]}</p>{run.status==="QUEUED" && <p className="mt-2 text-[14px] leading-6 text-slate-500">受付済みです。実行担当が取得するまで、作業は始まりません。</p>}{run.blocker && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm leading-7 text-amber-800">{run.blocker}</p>}{run.output && <div className="mt-4"><h4 className="mb-2 text-[14px] font-semibold text-slate-500">成果物</h4><p className="whitespace-pre-wrap break-words rounded-xl bg-[#f8f6fc] p-4 text-sm leading-8">{run.output}</p></div>}{run.evidence.length>0 && <div className="mt-4"><h4 className="mb-2 text-[14px] font-semibold text-slate-500">確認する根拠</h4><ul className="space-y-2">{run.evidence.map((e,i)=><li key={i} className="break-words text-sm leading-7">{e}</li>)}</ul></div>}{run.status==="REVIEW" && <div className="mt-5 space-y-4"><label className="flex items-start gap-3 text-sm leading-7"><input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={reviewedId===run.id} onChange={e=>setReviewedId(e.target.checked?run.id:null)} />成果物と根拠を読み、内容が合っていることを確認しました</label><button className="studio-primary" disabled={busy || reviewedId!==run.id || !run.evidence.length || !store.executionReady} onClick={()=>void submit({command:"accept",id:run.id,factsChecked:true})}>確認した成果物を受け入れる</button><p className="text-[14px] leading-6 text-slate-500">{task.aiCapability==="AI_EXECUTE"?"この実行タスクの完了として記録します。":"AIの成果物の確認です。自分の作業の完了とは別に記録します。"} 外部への送信・公開は行いません。</p></div>}</>:<><p className="mb-4 text-sm leading-7 text-slate-500">実行の受付はまだありません。説明と完了条件を添えて渡します。</p><button className="studio-secondary" disabled={busy || !store.executionReady || !isTaskOpen(task,store)} onClick={()=>void submit({command:"enqueue",id:task.id})}>この作業をAIの受付に登録</button></>}{error && <p role="alert" className="mt-3 text-sm leading-7 text-red-700">{error}</p>}{runs.length>1 && <details className="studio-disclosure mt-4"><summary>以前の実行 {runs.length-1}件</summary>{runs.slice(0,-1).map(r=><article key={r.id} className="mt-3 text-sm leading-7"><p>{labels[r.status]} · {r.createdAt}</p>{r.output && <p className="whitespace-pre-wrap break-words">{r.output}</p>}{r.blocker && <p>{r.blocker}</p>}</article>)}</details>}</section>;
}
