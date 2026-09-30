"use client";
import { useState } from "react";
import { useWork } from "@/lib/work/client";
import { useTodayExecution } from "@/lib/todayExecutionStore";
import { useCalendarDay } from "@/lib/useCalendarDay";
import { addCalendarDays, validCalendarDate } from "@/lib/calendarTime";
import { calendarFreshnessLabel } from "@/lib/calendarProvider";
import { calendarTaskDrafts, createTaskBody } from "@/lib/calendarTasks";
import StudioDialog from "./StudioDialog";

// Google Calendarの予定から、完了条件つきのタスクをまとめて作る (2026-10-01)。
// 計画はCalendarに書けば、アプリへもう一度入力しなくていい。
function md(date: string) { return Number(date.slice(5, 7)) + "/" + Number(date.slice(8, 10)); }

export default function CalendarToTasks() {
  const work = useWork(); const store = useTodayExecution();
  const today = store.currentDate; const end = validCalendarDate(today) ? addCalendarDays(today, 6) : today;
  const calendar = useCalendarDay(today, end);
  const tags = new Set(work.tasks.flatMap(t => t.contextTags ?? []));
  const drafts = calendarTaskDrafts(calendar.events, tags, today);
  const goals = work.goals.filter(g => g.status === "進行中" && ["1M", "3M", "6M", "AREA"].includes(g.horizon));
  const [dialog, setDialog] = useState(false); const [picked, setPicked] = useState<Set<string>>(new Set()); const [goalId, setGoalId] = useState("");
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  if (!work.connected) return null;
  const toggle = (id: string) => setPicked(p => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  async function run() {
    setBusy(true); setMessage("");
    try {
      const chosen = drafts.filter(d => picked.has(d.event.id));
      await work.mutate({ command: "createTasks", tasks: chosen.map(d => { const b = createTaskBody(d, goalId || null); delete b.command; return b; }) });
      setMessage(`${chosen.length}件のタスクを作りました。`); setDialog(false);
    } catch (e) { setMessage((e as Error).message); }
    finally { setBusy(false); }
  }
  return <>
    <button type="button" className="studio-secondary" onClick={() => { setPicked(new Set(drafts.filter(d => d.suggested).map(d => d.event.id))); setMessage(""); setDialog(true); }}>カレンダーの予定からタスクを作る</button>
    {message && !dialog && <p role="status" className="text-sm leading-7 text-emerald-800">{message}</p>}
    {dialog && <StudioDialog title="カレンダーの予定からタスクを作る" onClose={() => setDialog(false)}>
      <p className="mb-2 text-sm leading-7">今日から1週間の予定です。予定の説明にある「完了条件：」がタスクの完了条件になります。毎日の定型枠（日報など）は最初から外しています。</p>
      <p className="mb-3 text-[13px] leading-6 text-slate-500">{calendarFreshnessLabel(calendar)}{calendar.fallbackReason ? " · " + calendar.fallbackReason : ""}</p>
      <label className="mb-3 block text-sm">つなげる目標<select className="mt-1 block w-full rounded-xl border border-[#e4dfeb] p-2" value={goalId} onChange={e => setGoalId(e.target.value)}><option value="">つなげない</option>{goals.map(g => <option key={g.id} value={g.id}>{g.title}{g.targetDate ? `（${md(g.targetDate)}まで）` : ""}</option>)}</select></label>
      {drafts.length === 0 ? <p className="py-4 text-sm leading-7 text-slate-500">{calendar.stale && !calendar.liveBacked ? "Calendarを読めていません。TODAYの「予定を再確認」を押してから開き直してください。" : "タスクにできる予定はありません（取り込み済みを除く）。"}</p>
        : <ul className="mb-4 max-h-[50vh] space-y-1 overflow-y-auto">{drafts.map(d => <li key={d.event.id}><label className="flex min-h-11 items-start gap-3 rounded-xl px-2 py-2 text-sm leading-6 hover:bg-[#f8f6fc]">
          <input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={picked.has(d.event.id)} onChange={() => toggle(d.event.id)} />
          <span><span className="text-slate-500">{md(d.event.date)} {d.event.startTime}-{d.event.endTime}</span> {d.title}
            <span className="block text-[13px] text-slate-500">{d.area}{d.definitionOfDone.length ? " · 完了条件: " + d.definitionOfDone.join(" / ") : " · 完了条件なし（予定の実行を完了条件にします）"}</span></span>
        </label></li>)}</ul>}
      {message && <p role="alert" className="mb-3 text-sm text-red-700">{message}</p>}
      <div className="flex flex-wrap gap-3"><button type="button" className="studio-primary" disabled={busy || picked.size === 0} onClick={run}>{busy ? "作成中…" : `${picked.size}件をタスクにする`}</button><button type="button" className="studio-secondary" onClick={() => setDialog(false)}>やめる</button></div>
    </StudioDialog>}
  </>;
}
