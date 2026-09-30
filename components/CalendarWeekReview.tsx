"use client";

import { MISS_REASON_HINT, MISS_REASON_LABEL, weeklyCalendarReview } from "@/lib/calendarReview";
import { useTodayExecution } from "@/lib/todayExecutionStore";

// 1週間分の ○△× から、分野ごとのできた率・多かった理由・自分で決めた改善を並べる。
// 率は記録した予定だけで計算する。未記録を「できなかった」とは数えない。

function md(date: string) { return Number(date.slice(5, 7)) + "/" + Number(date.slice(8, 10)); }

export default function CalendarWeekReview({ from, to }: { from: string; to: string }) {
  const store = useTodayExecution();
  const week = weeklyCalendarReview(store.calendarReviews, from, to, 7);
  const top = week.reasons[0];
  return <section className="studio-card p-5 sm:p-6" aria-labelledby="calendar-week-title">
    <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
      <h2 id="calendar-week-title" className="text-base font-semibold text-[#3b334b]">{md(from)}〜{md(to)} のカレンダー振り返り</h2>
      <span className="studio-tag">振り返った日 {week.reviewedDays}/{week.totalDays}</span>
    </div>
    {week.counts.recorded === 0
      ? <p className="py-4 text-sm leading-7 text-[#877e94]">この期間はまだ記録がありません。夜に「1日」タブで今日の予定に ○△× を付けると、ここに集まります。</p>
      : <>
        <p className="mb-4 text-[14px] leading-6 text-[#877e94]">記録した予定 {week.counts.recorded}件: ○{week.counts.done} △{week.counts.partial} ×{week.counts.missed}（△は半分として計算）</p>
        <h3 className="mb-2 text-sm font-semibold">分野ごとのできた率</h3>
        <ul className="mb-5 space-y-2">{week.byArea.map(a => <li key={a.area} className="flex items-center gap-3 text-sm">
          <span className="w-28 shrink-0 text-[#5f566e]">{a.area}</span>
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-[#eeeaf3]" aria-hidden="true"><span className="block h-full rounded-full bg-[#8c7ab0]" style={{ width: `${a.rate ?? 0}%` }} /></span>
          <span className="w-24 shrink-0 text-right tabular-nums text-[#5f566e]">{a.rate}%（{a.counts.recorded}件）</span>
        </li>)}</ul>
        {top && <div className="mb-5 rounded-xl bg-[#f5f1fb] p-4 text-sm leading-7 text-[#4c405f]">
          <p>いちばん多かった理由: <strong>{MISS_REASON_LABEL[top.reason]}</strong>（{top.count}件）</p>
          <p className="text-[#756b85]">試せる変え方の案: {MISS_REASON_HINT[top.reason]}</p>
          {week.reasons.length > 1 && <p className="mt-1 text-[14px] text-[#877e94]">ほか: {week.reasons.slice(1).map(r => `${MISS_REASON_LABEL[r.reason]} ${r.count}件`).join(" / ")}</p>}
        </div>}
      </>}
    {week.changes.length > 0 && <><h3 className="mb-2 text-sm font-semibold">自分で決めた「明日ひとつ変えること」</h3>
      <ul>{week.changes.map(c => <li key={c.date} className="border-b border-[#eeeaf3] py-2 text-sm leading-7 last:border-0"><span className="mr-2 tabular-nums text-[#877e94]">{md(c.date)}</span>{c.text}</li>)}</ul></>}
  </section>;
}
