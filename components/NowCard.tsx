"use client";
import Link from "next/link";
import type { NowEntry } from "@/lib/nowEvent";
import { eventActions } from "@/lib/nowEvent";
import type { Task } from "@/lib/types";
import TaskWorkActions from "./TaskWorkActions";

// TODAYの先頭: いまの予定（無ければ次の予定）と、その完了条件・すぐやる操作。
// 計画はCalendarにあるので、アプリのTaskが無くても「いま何をするか」が出る。
function span(m: number) { return m >= 60 ? `${Math.floor(m / 60)}時間${m % 60 ? `${m % 60}分` : ""}` : `${m}分`; }

export default function NowCard({ current, next, started, reviewPending, totalToday, onOpenTask }: {
  current: NowEntry | null; next: NowEntry | null; started: Task | null; reviewPending: number; totalToday: number;
  onOpenTask: (id: string) => void;
}) {
  const main = current ?? next;
  return <section className="studio-card p-6 sm:p-8" aria-labelledby="now-title">
    {started && <div className="mb-5 rounded-2xl bg-[#f5f1fb] p-4">
      <p className="studio-eyebrow">いま記録中の作業</p>
      <button className="text-left text-base font-semibold leading-8" onClick={() => onOpenTask(started.id)}>{started.title}</button>
      <div className="mt-3"><TaskWorkActions key={started.id} task={started} /></div>
    </div>}
    {main ? <>
      <p id="now-title" className="studio-eyebrow">{current ? `いまの予定 · あと${span(current.minutesLeft!)}` : `次の予定 · ${span(next!.minutesUntil!)}後`}</p>
      <h2 className="mb-3 text-xl font-semibold leading-9 text-[#3b334b]">{main.event.startTime}〜{main.event.endTime}　{main.event.summary}</h2>
      {main.criteria.length > 0 ? <div className="mb-4 rounded-xl bg-[#f5f1fb] p-4 text-sm leading-7 text-[#4c405f]"><p className="font-semibold">ここまでできたら完了</p><ul className="mt-1 list-disc pl-5">{main.criteria.map(c => <li key={c}>{c}</li>)}</ul></div>
        : <p className="mb-4 text-[14px] leading-6 text-[#877e94]">この予定には完了条件が書かれていません。Google Calendarの説明に「完了条件：〜」と書くと、ここに出ます。</p>}
      <div className="flex flex-wrap gap-3">
        {eventActions(main.event).map((a, i) => a.external ? <a key={a.href} className={i === 0 ? "studio-primary" : "studio-secondary"} href={a.href} target="_blank" rel="noreferrer">{a.label}</a>
          : a.fullNavigation ? <a key={a.href} className={i === 0 ? "studio-primary" : "studio-secondary"} href={a.href}>{a.label}</a>
          : <Link key={a.href} className={i === 0 ? "studio-primary" : "studio-secondary"} href={a.href}>{a.label}</Link>)}
        {main.task && !started && <button className="studio-secondary" onClick={() => onOpenTask(main.task!.id)}>タスクを開く（開始・完了）</button>}
      </div>
      {current && next && <p className="mt-4 border-t border-[#eeeaf3] pt-3 text-[14px] leading-6 text-[#877e94]">次: {next.event.startTime} {next.event.summary}</p>}
    </> : <div>
      <p id="now-title" className="studio-eyebrow">今日の予定</p>
      {totalToday === 0 ? <><p className="text-base font-semibold leading-8">今日のCalendarに予定がありません</p><p className="text-sm leading-7 text-[#877e94]">何をするかを決めて、Google Calendarに時間を入れましょう。</p><Link className="studio-secondary mt-3" href="/tasks">やることから選ぶ</Link></>
        : <><p className="text-base font-semibold leading-8">今日の予定はすべて終わりました</p>
          {reviewPending > 0 ? <Link className="studio-primary mt-3" href="/pdca">振り返る（あと{reviewPending}件に○△×）</Link> : <p className="text-sm leading-7 text-[#877e94]">振り返りも記録済みです。おつかれさまでした。</p>}</>}
    </div>}
  </section>;
}
