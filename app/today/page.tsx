"use client";
import { useState } from "react";
import Link from "next/link";
import { useWork } from "@/lib/work/client";
import { useTodayExecution } from "@/lib/todayExecutionStore";
import { useClock } from "@/lib/currentTime";
import { useCalendarDay } from "@/lib/useCalendarDay";
import { liveTimeBlocks } from "@/lib/livePlan";
import { buildCalendarDay, type DayEntry } from "@/lib/calendarDay";
import { focusDay } from "@/lib/focusDay";
import { effectiveDeadline, isTaskDone } from "@/lib/taskState";
import { measuredTaskMinutes } from "@/lib/sessionCompletion";
import { calendarFreshnessLabel, startCalendarConnection } from "@/lib/calendarProvider";
import StudioHeader from "@/components/StudioHeader";
import StudioConnection from "@/components/StudioConnection";
import StudioDialog from "@/components/StudioDialog";
import TaskWorkActions from "@/components/TaskWorkActions";
import TaskDetailSheet from "@/components/TaskDetailSheet";
import StudioEditor from "@/components/StudioEditor";
import TodayShortcuts from "@/components/TodayShortcuts";
import DailyChecks from "@/components/DailyChecks";
import type { Task } from "@/lib/types";

export default function TodayPage() {
  const work=useWork(); const store=useTodayExecution(); const clock=useClock();
  const date=store.currentDate; const calendar=useCalendarDay(date,date); const blocks=liveTimeBlocks(store);
  const day=focusDay(work.tasks,blocks,date,clock.nowHmValue,store,store.startedTaskId);
  const timeline=buildCalendarDay({date,events:calendar.events,planBlocks:blocks,tasks:work.tasks,nowHm:clock.nowHmValue,startedTaskId:store.startedTaskId});
  const [selectedId,setSelectedId]=useState<string|null>(null); const [event,setEvent]=useState<DayEntry|null>(null); const [adding,setAdding]=useState(false);
  const selected=work.tasks.find(t=>t.id===selectedId); const completed=Object.values(store.completions).filter(c=>c.completedOnDate===date && c.metDefinitionOfDone);
  const measured=day.active && clock.clockReady?measuredTaskMinutes(day.active.id,store.workSessions,store.taskActualMinutes,date+"T"+clock.nowHmValue+":00"):null;
  const title=date==="1970-01-01"?"今日":Number(date.slice(5,7))+"月"+Number(date.slice(8,10))+"日、今日";
  function taskRow(task:Task) {const deadline=effectiveDeadline(task,store);return <button key={task.id} onClick={()=>setSelectedId(task.id)} className="flex w-full items-start justify-between gap-3 border-b border-[#eeeaf3] py-4 text-left last:border-0"><span className="min-w-0"><span className="block text-sm font-semibold leading-7">{task.title}</span><span className="mt-2 block text-[14px] text-[#877e94]">{task.area}{deadline?" · 期限 "+deadline.replaceAll("-","/"):" · 期限未定"}</span></span><span className="pt-1 text-[#a599ba]" aria-hidden="true">↗</span></button>;}
  // First screen, in the order the spec asks for: the date, the one task to
  // start, then everything else. Adding is a secondary button — the primary
  // action lives inside the focus card, because starting is what this page is
  // for. The connection notice and the review link moved below the fold: they
  // are context, and repeating "not connected" three times before the first
  // task is what made the page feel like a warning screen.
  return <div className="studio"><StudioHeader title={title} subtitle="いまの一歩を、ひとつずつ。" kind="tasks" action={<button className="studio-secondary" onClick={()=>setAdding(true)}>＋ やることを追加</button>} />
    <TodayShortcuts />
    <p className="mb-6 text-base leading-8 text-slate-600">時間の確認はカレンダー。ここでは作業を進めて、AIの成果物を確認します。</p>
    <DailyChecks />
    <div className="grid gap-6 xl:grid-cols-[1.15fr_1fr]">
      <div className="space-y-6"><section className="studio-card p-6 sm:p-8"><p className="studio-eyebrow">{day.active?"いま作業していること":"まずは、これから"}</p>{day.focus?<><button className="mb-4 w-full text-left text-xl font-semibold leading-9 text-[#3b334b]" onClick={()=>setSelectedId(day.focus!.id)}>{day.focus.title}</button><div className="mb-5 flex flex-wrap gap-2"><span className="studio-tag">{day.focus.area}</span>{day.focus.estimateMinutes!==null && <span className="studio-tag">見積り {day.focus.estimateMinutes}分</span>}{day.active && <span className="studio-tag">記録中{measured!==null?" · 累計 約"+measured+"分":""}</span>}</div>{day.active && store.startedTaskDate!==date && <p className="mb-4 rounded-xl bg-amber-50 p-3 text-sm leading-7 text-amber-800">前の日から作業が続いています。実際に続けているか、記録を確認してください。</p>}{day.focus.definitionOfDone[0] && <p className="mb-6 rounded-xl bg-[#f5f1fb] p-4 text-sm leading-7 text-[#756b85]">完了の目安：{day.focus.definitionOfDone[0]}</p>}<TaskWorkActions key={day.focus.id} task={day.focus} /></>:<div className="studio-empty"><p className="font-semibold">今日の作業は、まだ決まっていません</p><p>タスクを選んで、取りかかる日時を決めましょう。</p><Link className="studio-secondary" href="/tasks">やることから選ぶ</Link></div>}{store.startedTaskId && !day.active && <p role="alert" className="mt-4 text-sm leading-7 text-amber-800">実行中の記録とタスクの状態が一致していません。計画・持ち越し画面で記録を確認してください。</p>}</section>
      <section className="studio-card p-6"><div className="mb-2 flex items-center justify-between"><h2 className="text-base font-semibold">今日やること</h2><span className="studio-tag">{work.connected?day.scheduled.length+"件":"参考"}</span></div>{day.scheduled.length?day.scheduled.map(taskRow):<p className="py-5 text-sm leading-7 text-[#877e94]">日時を決めたタスクはありません。</p>}{day.due.length>0 && <div className="mt-4 border-t border-[#eeeaf3] pt-4"><h3 className="text-sm font-semibold text-[#877e94]">今日が期限・作業日時は未定</h3>{day.due.map(taskRow)}</div>}</section>
      {(day.overdue.length>0 || day.waiting.length>0) && <section className="studio-card p-6"><h2 className="mb-3 text-base font-semibold">気にかけておくこと</h2><details className="studio-disclosure"><summary>期限を過ぎた予定 {work.connected?day.overdue.length+"件":"（参考情報）"}</summary>{day.overdue.map(taskRow)}</details><details className="studio-disclosure"><summary>情報待ち {work.connected?day.waiting.length+"件":"（参考情報）"}</summary>{day.waiting.map(taskRow)}</details></section>}</div>
      <section className="studio-card h-fit p-6 sm:p-8"><div className="mb-3 flex flex-wrap items-center justify-between gap-3"><h2 className="text-base font-semibold">今日の予定</h2><button className="studio-secondary" disabled={calendar.loading} onClick={calendar.refresh}>{calendar.loading?"確認中…":"予定を再確認"}</button></div><p className="mb-4 text-[14px] leading-6 text-[#877e94]">{calendarFreshnessLabel(calendar)}{calendar.fallbackReason?" · "+calendar.fallbackReason:""}</p>{calendar.authRequired && <button className="studio-secondary mb-4" onClick={()=>startCalendarConnection()}>Calendarに接続</button>}{timeline.timed.length?timeline.timed.map(entry=><button key={entry.key} className="flex w-full gap-4 border-b border-[#eeeaf3] py-5 text-left last:border-0" onClick={()=>entry.task?setSelectedId(entry.task.id):setEvent(entry)}><span className="w-12 shrink-0 text-[14px] leading-6 text-[#877e94]">{entry.startTime}<br/>{entry.endTime}</span><span className="min-w-0"><span className="block text-sm font-semibold leading-7">{entry.title}</span><span className="mt-2 block text-[14px] text-[#877e94]">{entry.role==="OS_PENDING_CALENDAR"?"アプリ内の計画・Calendar未反映":entry.task && isTaskDone(entry.task,store)?"完了の記録あり":entry.task?"タスクにつながる予定":"Calendarの予定"}</span>{entry.osTimeWas && <span className="mt-2 block text-[14px] leading-6 text-amber-700">アプリ内の時刻と違います。Calendarの時刻を表示しています。</span>}</span></button>):<p className="py-8 text-sm leading-7 text-[#877e94]">{calendar.stale || calendar.authRequired?"最新の予定は未確認です。Calendarの接続を確認してください。":"この日の予定はありません。"}</p>}{timeline.deadlines.length>0 && <div className="mt-4 border-t border-[#eeeaf3] pt-4"><h3 className="mb-3 text-sm font-semibold">終日の予定・締切</h3>{timeline.deadlines.map(e=><button key={e.key} onClick={()=>setEvent(e)} className="block w-full py-2 text-left text-sm leading-7">{e.title}</button>)}</div>}<p className="mt-5 text-[14px] leading-6 text-[#877e94]">予定は読むだけです。作業の開始・完了とは別に扱います。</p></section>
    </div>
    <div className="mt-8 space-y-4 border-t border-[#eeeaf3] pt-6"><div className="flex flex-wrap items-center gap-3 text-sm leading-7 text-[#877e94]"><Link className="studio-secondary" href="/today/planning">計画・持ち越しを確認</Link><Link className="inline-flex min-h-[44px] items-center text-accent-dark underline" href="/pdca">振り返りを見る →</Link><span>{work.connected && store.executionReady?"今日の完了 "+completed.length+"件":"実績は接続後に確認できます"}</span></div><StudioConnection /></div>
    {selected && <TaskDetailSheet key={selected.id} task={selected} onClose={()=>setSelectedId(null)} onNavigateToTask={setSelectedId} />}{event && <StudioDialog title={event.title} onClose={()=>setEvent(null)}><p className="mb-4 text-sm leading-7">{date.replaceAll("-","/")} {event.startTime?event.startTime+"〜"+event.endTime:"終日"}</p><p className="whitespace-pre-line text-sm leading-8 text-slate-600">{event.description ?? "説明は登録されていません。"}</p><p className="mt-5 text-[14px] leading-6 text-slate-500">{calendarFreshnessLabel(calendar)}。参加や作業の完了を表す記録ではありません。</p></StudioDialog>}{adding && <StudioEditor kind="task" onClose={()=>setAdding(false)} />}
  </div>;
}
