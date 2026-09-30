"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- The script reader requires a full document navigation, not an RSC transition. */
import Link from "next/link";
import { useWork } from "@/lib/work/client";
import { useTodayExecution } from "@/lib/todayExecutionStore";
import { useCalendarDay } from "@/lib/useCalendarDay";
import { addCalendarDays, validCalendarDate } from "@/lib/calendarTime";
import { areaOf } from "@/lib/calendarTasks";
import { calendarFreshnessLabel } from "@/lib/calendarProvider";
import { findFreeSlot } from "@/lib/pdcaRhythm";
import { googleCalendarCreateUrl } from "@/lib/googleCalendarLink";
import { isTaskOpen } from "@/lib/taskState";
import type { Area } from "@/lib/types";

// 領域ページの先頭: いまの実データ (2026-10-01)。
// このページの下半分は9月上旬に固定で書いた計画（Outcome・Gap）で、期限が過ぎても
// 「いま必達」と出続けていた。先頭には Calendar と中央のタスクから作る「いま」を出し、
// 営業代行では営業スクリプトへの入口をいちばん上に置く。
function md(date: string) { return Number(date.slice(5, 7)) + "/" + Number(date.slice(8, 10)); }
function minutes(hm: string) { const [h, m] = hm.split(":").map(Number); return h * 60 + m; }

export default function AreaLiveBlock({ area }: { area: Area }) {
  const work = useWork(); const store = useTodayExecution();
  const today = store.currentDate; const end = validCalendarDate(today) ? addCalendarDays(today, 6) : today;
  const calendar = useCalendarDay(today, end);
  const events = calendar.events.filter(e => !e.allDay && e.startTime && e.endTime && e.date >= today && areaOf(e) === area)
    .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
  const total = events.reduce((s, e) => s + minutes(e.endTime!) - minutes(e.startTime!), 0);
  const open = work.tasks.filter(t => t.area === area && isTaskOpen(t, store));
  const read = calendar.liveBacked && calendar.coverageEnd >= today;
  const slot = read && events.length === 0 && validCalendarDate(today) ? findFreeSlot(calendar.events, today, end, 60, { weekday: ["20:00", "19:00", "21:00"], weekend: ["09:00", "13:00"] }) : null;
  return <section className="studio-card mx-5 mb-4 p-5" aria-labelledby="area-live-title">
    <h2 id="area-live-title" className="text-base font-semibold">{area}のいま</h2>
    {area === "営業代行" && <div className="mt-3 grid gap-2 sm:grid-cols-2">
      <a className="studio-primary justify-center" href="/sales-script">営業スクリプトを開く（読む・覚える・編集）</a>
      <Link className="studio-secondary justify-center" href="/tasks">営業のタスクを見る（未完了 {work.connected ? open.length : "—"}件）</Link>
    </div>}
    <h3 className="mt-5 text-sm font-semibold">今後7日のCalendar（{md(today)}〜{md(end)}）</h3>
    {!read ? <p className="mt-1 text-sm leading-7 text-[#877e94]">Calendarを読めていません。TODAYの「予定を再確認」を押してください。</p>
      : events.length === 0 ? <div className="mt-2 rounded-xl bg-amber-50 p-3 text-sm leading-7 text-amber-900">
        <p className="font-semibold">{area}の時間が1つも入っていません</p>
        <p className="text-[14px]">目標があっても、時間が無ければ進みません。まず1枠入れましょう。</p>
        {slot && <a className="studio-primary mt-2" target="_blank" rel="noreferrer" href={googleCalendarCreateUrl({ ...slot, title: `【${area}】（内容を決める）`, details: "完了条件：（この枠で何ができたら終わりか）" })}>Google カレンダーに入れる（{md(slot.date)} {slot.start}〜{slot.end}）</a>}
      </div>
      : <><p className="mt-1 text-[14px] text-[#877e94]">{events.length}枠・合計{Math.round(total / 6) / 10}時間 · {calendarFreshnessLabel(calendar)}</p>
        <ul className="mt-2">{events.slice(0, 6).map(e => <li key={e.id} className="border-b border-[#eeeaf3] py-2 text-sm leading-6 last:border-0"><span className="mr-2 tabular-nums text-[#877e94]">{md(e.date)} {e.startTime}</span>{e.summary}</li>)}</ul>
        {events.length > 6 && <p className="text-[13px] text-[#877e94]">ほか{events.length - 6}枠</p>}</>}
    {area !== "営業代行" && work.connected && <p className="mt-4 text-sm"><Link className="text-accent-dark underline" href="/tasks">{area}の未完了タスク {open.length}件 →</Link></p>}
  </section>;
}
