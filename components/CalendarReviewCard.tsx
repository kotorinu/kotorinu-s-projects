"use client";

import { useState } from "react";
import {
  countResults,
  doneRate,
  markBlock,
  MISS_REASON_HINT,
  MISS_REASON_LABEL,
  RESULT_LABEL,
  RESULT_MARK,
  reviewableEvents,
  setNextChange,
  type BlockResult,
  type MissReason,
} from "@/lib/calendarReview";
import { calendarFreshnessLabel, type CalendarFetchResult } from "@/lib/calendarProvider";
import { useTodayExecution } from "@/lib/todayExecutionStore";

// 夜の3分振り返り。Calendarの今日の予定に ○△× を付け、明日ひとつ変えることを書く。
// 押した瞬間に実績データとして保存され、中央保存は他の実績と同じ経路で行われる。

const RESULTS: BlockResult[] = ["DONE", "PARTIAL", "MISSED"];
const REASONS = Object.keys(MISS_REASON_LABEL) as MissReason[];

const RESULT_TONE: Record<BlockResult, string> = {
  DONE: "border-emerald-300 bg-emerald-50 text-emerald-800",
  PARTIAL: "border-amber-300 bg-amber-50 text-amber-800",
  MISSED: "border-rose-300 bg-rose-50 text-rose-800",
};

function md(date: string) { return Number(date.slice(5, 7)) + "/" + Number(date.slice(8, 10)); }

export default function CalendarReviewCard({ date, calendar }: { date: string; calendar: CalendarFetchResult }) {
  const store = useTodayExecution();
  const review = store.calendarReviews[date];
  const inCoverage = date >= calendar.coverageStart && date <= calendar.coverageEnd;
  const events = inCoverage ? reviewableEvents(calendar.events, date) : [];
  // Calendarで予定が消えても、記録した分は残す（そのときの計画だったため）。
  const recordedOnly = Object.entries(review?.blocks ?? {}).filter(([id]) => !events.some(e => e.id === id));
  const [draft, setDraft] = useState<string | null>(null);
  const now = () => new Date().toISOString();
  const counts = countResults(Object.values(review?.blocks ?? {}));
  const rate = doneRate(counts);
  const reasonsToday = [...new Set(Object.values(review?.blocks ?? {}).map(b => b.reason).filter((r): r is MissReason => r !== null))];
  const nextChange = draft ?? review?.nextChange ?? "";
  const unmarked = events.filter(e => !review?.blocks[e.id]).length;

  return <section className="studio-card p-5 sm:p-6" aria-labelledby="calendar-review-title">
    <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
      <h2 id="calendar-review-title" className="text-base font-semibold text-[#3b334b]">{md(date)} の予定を振り返る</h2>
      <span className="studio-tag">{counts.recorded ? `○${counts.done} △${counts.partial} ×${counts.missed}${rate !== null ? ` · ${rate}%` : ""}` : "未記録"}</span>
    </div>
    <p className="mb-4 text-[14px] leading-6 text-[#877e94]">Google Calendarの予定に、できた○・一部△・できなかった× を付けるだけです。印を付けない予定は数えません。{inCoverage ? calendarFreshnessLabel(calendar) : "この日はCalendarの読取範囲外なので、記録済みの分だけ表示します。"}</p>

    {inCoverage && events.length === 0 && <p className="py-3 text-sm leading-7 text-[#877e94]">{calendar.stale && !calendar.liveBacked ? "Calendarを読めていません。TODAYの「予定を再確認」かCalendar接続を確認してください。" : "振り返る予定はありません（睡眠・休憩・終日の予定は除いています）。"}</p>}
    <ul>{events.map(e => {
      const mark = review?.blocks[e.id];
      return <li key={e.id} className="border-b border-[#eeeaf3] py-4 last:border-0">
        <p className="text-sm font-semibold leading-7"><span className="mr-2 font-normal tabular-nums text-[#877e94]">{e.startTime}-{e.endTime}</span>{e.summary}</p>
        <div className="mt-2 grid grid-cols-3 gap-2" role="group" aria-label={`${e.summary} の結果`}>
          {RESULTS.map(r => <button key={r} type="button" aria-pressed={mark?.result === r}
            className={`min-h-11 rounded-xl border px-2 text-sm ${mark?.result === r ? RESULT_TONE[r] : "border-[#e4dfeb] bg-white text-[#5f566e]"}`}
            onClick={() => store.saveCalendarReview(markBlock(review, date, e, mark?.result === r ? null : r, mark?.reason ?? null, now()))}>
            {RESULT_MARK[r]} {r === "MISSED" ? "できず" : RESULT_LABEL[r]}</button>)}
        </div>
        {mark && mark.result !== "DONE" && <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="できなかった理由">
          {REASONS.map(reason => <button key={reason} type="button" aria-pressed={mark.reason === reason}
            className={`min-h-10 rounded-full border px-3 text-[13px] ${mark.reason === reason ? "border-[#8c7ab0] bg-[#f1ecf8] text-[#4c405f]" : "border-[#e4dfeb] bg-white text-[#877e94]"}`}
            onClick={() => store.saveCalendarReview(markBlock(review, date, e, mark.result, mark.reason === reason ? null : reason, now()))}>
            {MISS_REASON_LABEL[reason]}</button>)}
        </div>}
      </li>;
    })}</ul>
    {recordedOnly.length > 0 && <details className="studio-disclosure mt-2"><summary>記録済みでCalendarから消えた予定 {recordedOnly.length}件</summary><ul>{recordedOnly.map(([id, b]) => <li key={id} className="py-2 text-sm leading-7">{RESULT_MARK[b.result]} {b.startTime}-{b.endTime} {b.title}{b.reason ? ` · ${MISS_REASON_LABEL[b.reason]}` : ""}</li>)}</ul></details>}
    {unmarked > 0 && counts.recorded > 0 && <p className="mt-2 text-[14px] leading-6 text-[#877e94]">未記録 {unmarked}件</p>}

    <div className="mt-5 border-t border-[#eeeaf3] pt-5">
      <label htmlFor="next-change" className="block text-sm font-semibold text-[#3b334b]">明日ひとつ変えること</label>
      <p className="mb-3 mt-1 text-[14px] leading-6 text-[#877e94]">1つだけ。翌日のTODAYの一番上に表示されます。</p>
      {reasonsToday.length > 0 && <div className="mb-3 flex flex-wrap gap-2">{reasonsToday.map(r => <button key={r} type="button" className="min-h-10 rounded-full border border-dashed border-[#bdb2d1] px-3 text-left text-[13px] text-[#5f566e]" onClick={() => setDraft(MISS_REASON_HINT[r])}>案: {MISS_REASON_HINT[r]}</button>)}</div>}
      <textarea id="next-change" rows={2} maxLength={200} value={nextChange} onChange={ev => setDraft(ev.target.value)}
        placeholder="例: 読書は夜ではなく朝6:30の枠に移す"
        className="w-full rounded-xl border border-[#e4dfeb] p-3 text-sm leading-7" />
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button type="button" className="studio-secondary" disabled={draft === null || draft === (review?.nextChange ?? "")}
          onClick={() => { store.saveCalendarReview(setNextChange(review, date, nextChange, now())); setDraft(null); }}>保存する</button>
        <span className="text-[14px] leading-6 text-[#877e94]">{draft !== null && draft !== (review?.nextChange ?? "") ? "未保存" : review?.nextChange ? "保存済み" : ""}{store.executionStatus ? " · " + store.executionStatus : ""}</span>
      </div>
    </div>
  </section>;
}
