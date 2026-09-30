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
import { effectiveDeadline } from "@/lib/taskState";
import { calendarFreshnessLabel, startCalendarConnection } from "@/lib/calendarProvider";
import StudioHeader from "@/components/StudioHeader";
import StudioConnection from "@/components/StudioConnection";
import StudioDialog from "@/components/StudioDialog";
import TaskDetailSheet from "@/components/TaskDetailSheet";
import StudioEditor from "@/components/StudioEditor";
import TodayShortcuts from "@/components/TodayShortcuts";
import DailyChecks from "@/components/DailyChecks";
import CalendarHealthPanel from "@/components/CalendarHealthPanel";
import NowCard from "@/components/NowCard";
import TodaySchedule from "@/components/TodaySchedule";
import { computeRhythm } from "@/components/PdcaRhythmPanel";
import { nowAndNext } from "@/lib/nowEvent";
import { calendarHealth, needsAction } from "@/lib/calendarHealth";
import { googleCalendarCreateUrl } from "@/lib/googleCalendarLink";
import ConnectPrompt from "@/components/ConnectPrompt";
import { carriedChange } from "@/lib/calendarReview";
import { goalsDueForReview } from "@/lib/goalReview";
import { addCalendarDays, validCalendarDate } from "@/lib/calendarTime";
import type { Task } from "@/lib/types";

export default function TodayPage() {
  const work=useWork(); const store=useTodayExecution(); const clock=useClock();
  const date=store.currentDate;
  // One read covers today and the week ahead: the timeline uses today, the check uses the week.
  const weekEnd=validCalendarDate(date)?addCalendarDays(date,7):date; const today=date;
  const calendar=useCalendarDay(date,weekEnd); const todayEvents=calendar.events.filter(e=>e.date===date);
  const carried=validCalendarDate(date)?carriedChange(store.calendarReviews,addCalendarDays(date,-1)):null;
  const blocks=liveTimeBlocks(store);
  const day=focusDay(work.tasks,blocks,date,clock.nowHmValue,store,store.startedTaskId);
  const timeline=buildCalendarDay({date,events:todayEvents,planBlocks:blocks,tasks:work.tasks,nowHm:clock.nowHmValue,startedTaskId:store.startedTaskId});
  const [selectedId,setSelectedId]=useState<string|null>(null); const [event,setEvent]=useState<DayEntry|null>(null); const [adding,setAdding]=useState(false);
  const selected=work.tasks.find(t=>t.id===selectedId); const completed=Object.values(store.completions).filter(c=>c.completedOnDate===date && c.metDefinitionOfDone);
  const now=nowAndNext(todayEvents,date,clock.clockReady?clock.nowHmValue:"00:00",work.tasks);
  const title=date==="1970-01-01"?"今日":Number(date.slice(5,7))+"月"+Number(date.slice(8,10))+"日、今日";
  function taskRow(task:Task) {const deadline=effectiveDeadline(task,store);return <button key={task.id} onClick={()=>setSelectedId(task.id)} className="flex w-full items-start justify-between gap-3 border-b border-[#eeeaf3] py-4 text-left last:border-0"><span className="min-w-0"><span className="block text-sm font-semibold leading-7">{task.title}</span><span className="mt-2 block text-[14px] text-[#877e94]">{task.area}{deadline?" · 期限 "+deadline.replaceAll("-","/"):" · 期限未定"}</span></span><span className="pt-1 text-[#a599ba]" aria-hidden="true">↗</span></button>;}
  // 2026-10-01 並べ替え: 計画はCalendarにあるので、先頭は「いまの予定・次の予定」。
  // その下に今日の予定（終わった予定はその場で○△×）、直すこと（PDCAの点検・
  // カレンダー点検）、タスク一覧、最後に補助の入口。以前は先頭に空のフォーカス欄と
  // チェックリストが並び、Calendarの予定はスマホで3画面下にあった。
  const marks=store.calendarReviews[date]?.blocks??{}; const pendingReview=now.ended.filter(e=>!marks[e.id]).length;
  const rhythm=computeRhythm(work,store,calendar,weekEnd);
  const health=calendarHealth({events:calendar.events,today:date,coverageStart:calendar.coverageStart,coverageEnd:calendar.coverageEnd});
  const healthIssues=needsAction(health).length;
  return <div className="studio"><StudioHeader title={title} subtitle="いまの予定を、ひとつずつ。" kind="tasks" action={<button className="studio-secondary" onClick={()=>setAdding(true)}>＋ やることを追加</button>} />
    <ConnectPrompt where="page" />
    {validCalendarDate(date) && goalsDueForReview(work.goals,store.goalReviews,date).map(g=><Link key={g.id} href={"/goals?focus="+encodeURIComponent(g.id)} className="mb-6 flex items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm leading-7"><span><span className="block font-semibold text-rose-900">{g.title}の目標は {Number(g.targetDate!.slice(5,7))}/{Number(g.targetDate!.slice(8,10))} が期限です</span><span className="text-rose-800">達成基準を1つずつ判定して、事実と理由を記録する</span></span><span aria-hidden="true" className="text-rose-400">→</span></Link>)}
    {carried && <section className="mb-6 rounded-2xl border border-[#e4dcf1] bg-[#f5f1fb] p-5" aria-label="昨日決めた改善"><p className="text-[14px] leading-6 text-[#756b85]">昨日の振り返りで決めた、今日ひとつ変えること</p><p className="mt-1 text-base font-semibold leading-8 text-[#3b334b]">{carried}</p></section>}
    <div className="grid gap-6 xl:grid-cols-[1.15fr_1fr]">
      <div className="space-y-6">
        <NowCard current={now.current} next={now.next} started={day.active} reviewPending={pendingReview} totalToday={now.total} onOpenTask={setSelectedId} />
      <section className="studio-card p-6 sm:p-8"><div className="mb-3 flex flex-wrap items-center justify-between gap-3"><h2 className="text-base font-semibold">今日の予定</h2><button className="studio-secondary" disabled={calendar.loading} onClick={calendar.refresh}>{calendar.loading?"確認中…":"予定を再確認"}</button></div><p className="mb-2 text-[14px] leading-6 text-[#877e94]">{calendarFreshnessLabel(calendar)}{calendar.fallbackReason?" · "+calendar.fallbackReason:""}</p>{calendar.authRequired && <button className="studio-secondary mb-4" onClick={()=>startCalendarConnection()}>Calendarに接続</button>}{timeline.timed.length?<><p className="mb-2 text-[13px] leading-6 text-[#877e94]">終わった予定は、その場で ○(できた) △(一部) ×(できず) を押せます。</p><TodaySchedule date={date} nowHm={clock.nowHmValue} entries={timeline.timed} events={todayEvents} tasks={work.tasks} onOpenTask={setSelectedId} onOpenEvent={setEvent} /></>:<p className="py-8 text-sm leading-7 text-[#877e94]">{calendar.stale || calendar.authRequired?"最新の予定は未確認です。Calendarの接続を確認してください。":"この日の予定はありません。"}</p>}{timeline.deadlines.length>0 && <div className="mt-4 border-t border-[#eeeaf3] pt-4"><h3 className="mb-3 text-sm font-semibold">終日の予定・締切</h3>{timeline.deadlines.map(e=><button key={e.key} onClick={()=>setEvent(e)} className="block w-full py-2 text-left text-sm leading-7">{e.title}</button>)}</div>}</section>
      </div>
      <div className="space-y-6">
        {store.startedTaskId && !day.active && <p role="alert" className="text-sm leading-7 text-amber-800">実行中の記録とタスクの状態が一致していません。計画・持ち越し画面で記録を確認してください。</p>}
        {clock.clockReady && clock.nowHmValue>="18:00" && pendingReview>0 && now.ended.length>0 && <Link href="/pdca" className="flex items-center justify-between gap-3 rounded-2xl border border-[#e4dfeb] bg-white p-5 text-sm leading-7"><span><span className="block font-semibold text-[#3b334b]">今日の振り返り（3分）</span><span className="text-[#877e94]">あと{pendingReview}件に ○△× を付けて、明日ひとつ変えることを決める</span></span><span aria-hidden="true" className="text-[#a599ba]">→</span></Link>}
        {(rhythm.issues.length>0 || healthIssues>0) && <section className="studio-card p-6" aria-labelledby="fix-title"><h2 id="fix-title" className="mb-2 text-base font-semibold">直しておくこと</h2><ul className="space-y-3 text-sm leading-7">
          {rhythm.issues.slice(0,3).map(c=><li key={c.id} className="rounded-xl bg-[#faf8fd] p-3"><span className="font-semibold">{c.label}</span>：{c.detail}{c.draft && <a className="mt-2 block text-accent-dark underline" href={googleCalendarCreateUrl(c.draft)} target="_blank" rel="noreferrer">Google カレンダーに入れる（{Number(c.draft.date.slice(5,7))}/{Number(c.draft.date.slice(8,10))} {c.draft.start}〜）</a>}</li>)}
          {healthIssues>0 && <li className="rounded-xl bg-[#faf8fd] p-3"><span className="font-semibold">カレンダー点検</span>：重なり・休息不足が{healthIssues}件あります（下の「今週のカレンダー点検」）</li>}
        </ul>{rhythm.issues.length>3 && <Link className="mt-3 inline-block text-sm text-accent-dark underline" href="/pdca">ほか{rhythm.issues.length-3}件を振り返り画面で見る →</Link>}</section>}
        <section className="studio-card p-6"><div className="mb-2 flex items-center justify-between"><h2 className="text-base font-semibold">今日のタスク</h2><span className="studio-tag">{work.connected?day.scheduled.length+"件":"参考"}</span></div>{day.scheduled.length?day.scheduled.map(taskRow):<p className="py-4 text-sm leading-7 text-[#877e94]">今日の日付のタスクはありません。Calendarの予定からタスクを作ると、ここで開始・完了を記録できます。</p>}{day.due.length>0 && <div className="mt-4 border-t border-[#eeeaf3] pt-4"><h3 className="text-sm font-semibold text-[#877e94]">今日が期限・作業日時は未定</h3>{day.due.map(taskRow)}</div>}
          {(day.overdue.length>0 || day.waiting.length>0) && <div className="mt-4 border-t border-[#eeeaf3] pt-2"><details className="studio-disclosure"><summary>期限を過ぎたタスク {work.connected?day.overdue.length+"件":"（参考情報）"}</summary><p className="py-2 text-[13px] leading-6 text-[#877e94]">終わっているものは「やること」画面の「まとめて完了」、やめるものは同じ画面の「まとめて片付ける」で整理できます。</p>{day.overdue.map(taskRow)}</details>{day.waiting.length>0 && <details className="studio-disclosure"><summary>情報待ち {day.waiting.length}件</summary>{day.waiting.map(taskRow)}</details>}</div>}</section>
      </div>
    </div>
    <div className="mt-6">{healthIssues>0 ? <CalendarHealthPanel calendar={calendar} today={date} /> : <details className="studio-disclosure"><summary>今週のカレンダー点検：{today>calendar.coverageEnd?"未確認":"重なり・休息不足なし"}</summary><div className="pt-3"><CalendarHealthPanel calendar={calendar} today={date} /></div></details>}</div>
    <div className="mt-6 space-y-6"><TodayShortcuts /><details className="studio-disclosure"><summary>毎日の積み上げ（チェックリスト）</summary><DailyChecks /></details></div>
    <div className="mt-8 space-y-4 border-t border-[#eeeaf3] pt-6"><div className="flex flex-wrap items-center gap-3 text-sm leading-7 text-[#877e94]"><Link className="studio-secondary" href="/pdca">振り返り・PDCAの点検</Link><Link className="inline-flex min-h-[44px] items-center text-accent-dark underline" href="/today/planning">計画・持ち越しを確認 →</Link><span>{work.connected && store.executionReady?"今日の完了 "+completed.length+"件":"実績は接続後に確認できます"}</span></div><StudioConnection /></div>
    {selected && <TaskDetailSheet key={selected.id} task={selected} onClose={()=>setSelectedId(null)} onNavigateToTask={setSelectedId} />}{event && <StudioDialog title={event.title} onClose={()=>setEvent(null)}><p className="mb-4 text-sm leading-7">{date.replaceAll("-","/")} {event.startTime?event.startTime+"〜"+event.endTime:"終日"}</p><p className="whitespace-pre-line text-sm leading-8 text-slate-600">{event.description ?? "説明は登録されていません。"}</p><p className="mt-5 text-[14px] leading-6 text-slate-500">{calendarFreshnessLabel(calendar)}。参加や作業の完了を表す記録ではありません。</p></StudioDialog>}{adding && <StudioEditor kind="task" onClose={()=>setAdding(false)} />}
  </div>;
}
