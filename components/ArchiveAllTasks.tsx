"use client";
import { useState } from "react";
import { useWork } from "@/lib/work/client";
import StudioDialog from "./StudioDialog";

// 今あるタスクを一旦まとめて片付ける (2026-09-30, 本人の依頼)。
// 削除ではなくアーカイブ。一覧から消えるが、履歴は残り「すべて」から1件ずつ戻せる。
// 件数はサーバの台帳と照合し、画面で見た件数と違えば止める。
export default function ArchiveAllTasks() {
  const work = useWork(); const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  const targets = work.tasks.filter(t => !["完了", "Archive"].includes(t.status) && ["ACTIVE", "BACKLOG"].includes(t.lifecycle));
  if (!work.connected || targets.length === 0) return message ? <p role="status" className="text-sm leading-7 text-emerald-800">{message}</p> : null;
  async function run() {
    setBusy(true); setMessage("");
    try { await work.mutate({ command: "archiveOpenTasks", expectedCount: targets.length }); setMessage(`${targets.length}件をアーカイブしました。「すべて」から戻せます。`); setOpen(false); }
    catch (e) { setMessage((e as Error).message); }
    finally { setBusy(false); }
  }
  return <>
    <button type="button" className="studio-secondary" onClick={() => setOpen(true)}>今あるタスクをまとめて片付ける（{targets.length}件）</button>
    {message && <p role="status" className="text-sm leading-7 text-amber-800">{message}</p>}
    {open && <StudioDialog title="タスクをまとめて片付けますか？" onClose={() => setOpen(false)}>
      <p className="mb-3 text-sm leading-7">完了していないタスク <strong>{targets.length}件</strong> をアーカイブします。</p>
      <ul className="mb-4 space-y-1 text-[14px] leading-6 text-slate-600">
        <li>・一覧・TODAYから消えます</li>
        <li>・完了済みの記録、作業時間、AIの成果物は残ります</li>
        <li>・「すべて」タブから1件ずつ元に戻せます</li>
        <li>・Google Calendarの予定は変わりません</li>
      </ul>
      <div className="flex flex-wrap gap-3"><button type="button" className="studio-primary" disabled={busy} onClick={run}>{busy ? "片付け中…" : targets.length + "件をアーカイブする"}</button><button type="button" className="studio-secondary" onClick={() => setOpen(false)}>やめる</button></div>
    </StudioDialog>}
  </>;
}
