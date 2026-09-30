"use client";
import { useState } from "react";
import { useWork } from "@/lib/work/client";
import { KEEP_OPEN_BY_DEFAULT } from "@/lib/calendarTasks";
import StudioDialog from "./StudioDialog";

// 終わっているのに完了を押せていないタスクを、まとめて「完了」にする (2026-10-01)。
// 選ぶのは本人。「まだできていない」と言った読書（地頭力・鬼速PDCA）は最初から外す。
// AIの成果物確認が済んでいないものは選べない（個別に確認する）。
export default function BulkCompleteTasks() {
  const work = useWork();
  const open = work.tasks.filter(t => !["完了", "Archive"].includes(t.status) && ["ACTIVE", "BACKLOG"].includes(t.lifecycle));
  const aiPending = new Set(open.filter(t => { const r = work.runs.filter(x => x.taskId === t.id).at(-1); return r && r.status !== "ACCEPTED"; }).map(t => t.id));
  const [dialog, setDialog] = useState(false); const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  if (!work.connected || open.length === 0) return message ? <p role="status" className="text-sm leading-7 text-emerald-800">{message}</p> : null;
  function start() {
    setPicked(new Set(open.filter(t => !KEEP_OPEN_BY_DEFAULT.test(t.title) && !aiPending.has(t.id)).map(t => t.id)));
    setMessage(""); setDialog(true);
  }
  async function run() {
    setBusy(true); setMessage("");
    try { await work.mutate({ command: "completeTasks", ids: [...picked] }); setMessage(`${picked.size}件を完了にしました。`); setDialog(false); }
    catch (e) { setMessage((e as Error).message); }
    finally { setBusy(false); }
  }
  const toggle = (id: string) => setPicked(p => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  return <>
    <button type="button" className="studio-primary" onClick={start}>終わったタスクをまとめて完了にする</button>
    {message && !dialog && <p role="status" className="text-sm leading-7 text-emerald-800">{message}</p>}
    {dialog && <StudioDialog title="まとめて完了にする" onClose={() => setDialog(false)}>
      <p className="mb-3 text-sm leading-7">終わっているタスクにチェックを付けてください。読書（地頭力・鬼速PDCA）は最初から外しています。完了は「本人の申告でまとめて完了」として記録されます。</p>
      <div className="mb-3 flex gap-3 text-[14px]"><button type="button" className="underline" onClick={() => setPicked(new Set(open.filter(t => !aiPending.has(t.id)).map(t => t.id)))}>すべて選ぶ</button><button type="button" className="underline" onClick={() => setPicked(new Set())}>すべて外す</button></div>
      <ul className="mb-4 max-h-[50vh] space-y-1 overflow-y-auto">{open.map(t => <li key={t.id}><label className="flex min-h-11 items-start gap-3 rounded-xl px-2 py-2 text-sm leading-6 hover:bg-[#f8f6fc]">
        <input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={picked.has(t.id)} disabled={aiPending.has(t.id)} onChange={() => toggle(t.id)} />
        <span>{t.title}<span className="block text-[13px] text-slate-500">{t.area}{t.deadline ? " · 期限 " + t.deadline.replaceAll("-", "/") : ""}{aiPending.has(t.id) ? " · AIの成果物を確認してから完了にしてください" : ""}</span></span>
      </label></li>)}</ul>
      {message && <p role="alert" className="mb-3 text-sm text-red-700">{message}</p>}
      <div className="flex flex-wrap gap-3"><button type="button" className="studio-primary" disabled={busy || picked.size === 0} onClick={run}>{busy ? "記録中…" : `${picked.size}件を完了にする`}</button><button type="button" className="studio-secondary" onClick={() => setDialog(false)}>やめる</button></div>
    </StudioDialog>}
  </>;
}
