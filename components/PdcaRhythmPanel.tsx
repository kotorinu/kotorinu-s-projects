"use client";
import Link from "next/link";
import { useWork } from "@/lib/work/client";
import { useTodayExecution } from "@/lib/todayExecutionStore";
import { useCalendarDay } from "@/lib/useCalendarDay";
import { addCalendarDays, validCalendarDate } from "@/lib/calendarTime";
import { isTaskOpen } from "@/lib/taskState";
import { googleCalendarCreateUrl } from "@/lib/googleCalendarLink";
import { pdcaRhythm, rhythmIssues, type RhythmCheck, type RhythmStatus } from "@/lib/pdcaRhythm";
import type { CalendarFetchResult } from "@/lib/calendarProvider";

// PDCAが回っているかの点検。足りないものは、その場でGoogle Calendarへ入れられる。
const TONE: Record<RhythmStatus, { tag: string; label: string }> = {
  OK: { tag: "bg-emerald-50! text-emerald-800!", label: "OK" },
  WARN: { tag: "bg-amber-50! text-amber-800!", label: "要確認" },
  MISSING: { tag: "bg-rose-50! text-rose-800!", label: "ない" },
  UNKNOWN: { tag: "bg-stone-100! text-stone-600!", label: "未確認" },
};
const STAGE: Record<RhythmCheck["stage"], string> = { P: "計画", D: "実行", C: "評価", A: "改善" };
function md(date: string) { return Number(date.slice(5, 7)) + "/" + Number(date.slice(8, 10)); }

type Work = ReturnType<typeof useWork>; type Store = ReturnType<typeof useTodayExecution>;
/** TODAYなど、すでにCalendarを読んでいる画面から呼ぶ（二重に読まない）。 */
export function computeRhythm(work: Work, store: Store, calendar: CalendarFetchResult, end: string) {
  const today = store.currentDate;
  const checks = validCalendarDate(today) ? pdcaRhythm({
    today, events: calendar.events, coverageEnd: calendar.coverageEnd < end ? calendar.coverageEnd : end,
    calendarRead: calendar.liveBacked && calendar.coverageEnd >= today, goals: work.goals, tasks: work.tasks,
    openTaskIds: new Set(work.tasks.filter(t => isTaskOpen(t, store)).map(t => t.id)),
    calendarReviews: store.calendarReviews, goalReviews: store.goalReviews,
  }) : [];
  return { checks, issues: rhythmIssues(checks), connected: work.connected };
}

export function usePdcaRhythm() {
  const work = useWork(); const store = useTodayExecution();
  const today = store.currentDate;
  const end = validCalendarDate(today) ? addCalendarDays(today, 7) : today;
  const calendar = useCalendarDay(today, end);
  return computeRhythm(work, store, calendar, end);
}

function Row({ c }: { c: RhythmCheck }) {
  return <li className="border-b border-[#eeeaf3] py-4 last:border-0">
    <div className="flex flex-wrap items-center gap-2"><span className="text-[12px] font-semibold text-[#877e94]">{STAGE[c.stage]}</span><span className="text-sm font-semibold text-[#3b334b]">{c.label}</span><span className={`studio-tag ${TONE[c.status].tag}`}>{TONE[c.status].label}</span></div>
    <p className="mt-1 text-sm leading-7">{c.detail}</p>
    {c.status !== "OK" && <p className="text-[14px] leading-6 text-[#756b85]">{c.action}</p>}
    {c.status !== "OK" && (c.draft || c.href) && <div className="mt-2 flex flex-wrap gap-2">
      {c.draft && <a className="studio-primary" href={googleCalendarCreateUrl(c.draft)} target="_blank" rel="noreferrer">Google カレンダーに入れる（{md(c.draft.date)} {c.draft.start}〜{c.draft.end}{c.draft.verified ? "" : "・空き未確認"}）</a>}
      {c.href && <Link className="studio-secondary" href={c.href}>アプリで開く</Link>}
    </div>}
  </li>;
}

export default function PdcaRhythmPanel() {
  const { checks, issues, connected } = usePdcaRhythm();
  const ok = checks.filter(c => c.status === "OK");
  const unknown = checks.filter(c => c.status === "UNKNOWN");
  return <section className="studio-card p-5 sm:p-6" aria-labelledby="pdca-rhythm-title">
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
      <h2 id="pdca-rhythm-title" className="text-base font-semibold text-[#3b334b]">PDCAが回っているかの点検</h2>
      <span className="studio-tag">{issues.length ? `直すところ ${issues.length}件` : "回っています"}</span>
    </div>
    <p className="mb-2 text-[14px] leading-6 text-[#877e94]">目標・タスク・Google Calendar・夜の記録を照らし合わせます。目標があっても時間が入っていなければ進みません。{connected ? "" : "（タスクと目標は接続後に確認できます）"}</p>
    <ul>{[...issues, ...unknown].map(c => <Row key={c.id} c={c} />)}</ul>
    {ok.length > 0 && <details className="studio-disclosure mt-2"><summary>できていること {ok.length}件</summary><ul>{ok.map(c => <Row key={c.id} c={c} />)}</ul></details>}
    <p className="mt-3 text-[13px] leading-6 text-[#877e94]">「Google カレンダーに入れる」は、内容入りの作成画面を開きます。保存を押すとCalendarに入ります（このアプリはCalendarを書き換えません）。</p>
  </section>;
}
