"use client";
import { useState } from "react";
import { useWork } from "@/lib/work/client";
import type { Goal, Task } from "@/lib/types";
import StudioDialog from "./StudioDialog";
export default function StudioEditor({ kind, task, goal, onClose }: { kind: "task" | "goal" | "login"; task?: Task; goal?: Goal; onClose: () => void }) {
  const work = useWork(); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const title = kind === "login" ? "ワークスペースに接続" : kind === "task" ? task ? "タスクを編集" : "タスクを追加" : goal ? "目標を編集" : "目標を追加";
  return <StudioDialog title={title} onClose={onClose}><form className="studio-form" onSubmit={async e => {
    e.preventDefault(); const data = new FormData(e.currentTarget); setBusy(true); setError("");
    try {
      if (kind === "login") {
        const response = await fetch("/api/riala", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({command:"login", secret:data.get("secret")})});
        if (!response.ok) throw new Error("接続できません。操作キーと保存先の設定を確認してください。");
        window.dispatchEvent(new Event("work-os-auth"));
        if(!await work.refresh())throw new Error("ログイン後の保存先を確認できません。接続設定を確認してください。");
      } else {
        const body: Record<string, unknown> = { command: kind === "task" ? task ? "updateTask" : "createTask" : goal ? "updateGoal" : "createGoal", title:data.get("title") };
        if (kind === "task") Object.assign(body, {id:task?.id, description:data.get("description") || undefined, deadline:data.get("date") || null, goalId:data.get("parent") || null, definitionOfDone:String(data.get("criteria") ?? "").split("\n").filter(x=>x.trim())}, task ? {status:data.get("status")} : {area:data.get("area"), aiCapability:data.get("owner")});
        else Object.assign(body,{id:goal?.id, desiredState:data.get("description"), achievementCriteria:data.get("criteria"), targetDate:data.get("date") || null}, goal ? {status:data.get("status")} : {parentId:data.get("parent") || null,horizon:data.get("horizon")});
        await work.mutate(body);
      }
      onClose();
    } catch(err) {setError(err instanceof Error ? err.message : "保存できませんでした。");} finally {setBusy(false);}
  }}>
    {kind === "login" ? <><p className="text-sm leading-7 text-slate-600">保存した目標とタスクを読み込みます。</p><label>操作キー<input name="secret" type="password" autoComplete="current-password" required /></label></> : <>
      <label>{kind === "task" ? "やること" : "目標"}<input name="title" defaultValue={task?.title ?? goal?.title} required maxLength={200} placeholder={kind === "task" ? "具体的な行動をひとつ" : "どうなっていたい？"} /></label>
      <label>{kind === "task" ? "作業の説明" : "達成したい状態"}<textarea name="description" rows={3} defaultValue={task?.description ?? goal?.desiredState} required={kind === "goal"} /></label>
      <label>{kind === "task" ? "完了条件" : "達成基準"}<textarea name="criteria" rows={3} defaultValue={task?.definitionOfDone.join("\n") ?? goal?.achievementCriteria} required placeholder="何ができたら終わりか" /></label>
      <label>{kind === "task" ? "期限" : "目標日"}<input name="date" type="date" defaultValue={task?.deadline ?? goal?.targetDate ?? ""} /><span className="text-xs font-normal text-slate-500">決まっていなければ空欄で大丈夫です。</span></label>
      {kind === "task" && !task && <div className="grid grid-cols-2 gap-3"><label>領域<select name="area">{["営業代行","RIALA","GENESIS","その他"].map(a=><option key={a}>{a}</option>)}</select></label><label>担当<select name="owner"><option value="HUMAN">自分</option><option value="AI_DRAFT">AIで下書き</option><option value="AI_EXECUTE">AIで実行</option><option value="HYBRID">AIと自分</option><option value="DECISION">自分が判断</option></select></label></div>}
      {kind === "goal" && !goal && <label>期間<select name="horizon">{[{v:"1M",l:"1か月"},{v:"3M",l:"3か月"},{v:"6M",l:"半年"},{v:"1Y",l:"1年"},{v:"3Y",l:"3年"},{v:"5Y",l:"5年"},{v:"PHILOSOPHY",l:"人生の目的・価値観"},{v:"AREA",l:"仕事の目標"}].map(x=><option key={x.v} value={x.v}>{x.l}</option>)}</select></label>}
      {(kind === "task" || !goal) && <label>{kind === "task" ? "つながる目標" : "親の目標"}<select name="parent" defaultValue={task?.goalId ?? ""}><option value="">未設定</option>{work.goals.map(g=><option key={g.id} value={g.id}>{g.title}</option>)}</select></label>}
      {(task || goal) && <label>状態<select name="status" defaultValue={task?.status ?? goal?.status}>{(task ? ["未着手","進行中","待ち","完了","Archive"] : ["進行中","達成","一時停止","未達成"]).map(s=><option key={s}>{s}</option>)}</select></label>}
    </>}
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <button className="studio-primary" disabled={busy || (kind !== "login" && !work.connected)}>{busy ? "確認中…" : kind === "login" ? "接続する" : "保存する"}</button>
    {kind !== "login" && !work.connected && <p className="text-sm text-slate-600">保存するにはワークスペースへの接続が必要です。</p>}
  </form></StudioDialog>;
}
