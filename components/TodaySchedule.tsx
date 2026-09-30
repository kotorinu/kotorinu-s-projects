"use client";
import type { DayEntry } from "@/lib/calendarDay";
import type { CalendarEventDTO } from "@/lib/calendarProvider";
import { markBlock, RESULT_MARK, reviewableEvents, type BlockResult } from "@/lib/calendarReview";
import { taskForEvent } from "@/lib/nowEvent";
import { isTaskDone } from "@/lib/taskState";
import { useTodayExecution } from "@/lib/todayExecutionStore";
import type { Task } from "@/lib/types";

// 今日の予定。終わった予定には、その場で ○△× を付けられる (2026-10-01)。
// 夜に振り返り画面へ移らなくても、予定が終わったタイミングで1タップで記録できる。
// × の理由と「明日ひとつ変えること」は振り返り画面で書く。
const RESULTS: BlockResult[] = ["DONE", "PARTIAL", "MISSED"];
const TONE: Record<BlockResult, string> = { DONE: "border-emerald-300 bg-emerald-50 text-emerald-800", PARTIAL: "border-amber-300 bg-amber-50 text-amber-800", MISSED: "border-rose-300 bg-rose-50 text-rose-800" };

export default function TodaySchedule({ date, nowHm, entries, events, tasks, onOpenTask, onOpenEvent }: {
  date: string; nowHm: string; entries: DayEntry[]; events: CalendarEventDTO[]; tasks: Task[];
  onOpenTask: (id: string) => void; onOpenEvent: (e: DayEntry) => void;
}) {
  const store = useTodayExecution();
  const review = store.calendarReviews[date];
  const reviewable = new Map(reviewableEvents(events, date).map(e => [e.id, e]));
  return <ol>{entries.map(entry => {
    const event = reviewable.get(entry.key);
    const linked = entry.task ?? taskForEvent(tasks, entry.key);
    const ended = !!entry.endTime && entry.endTime <= nowHm;
    const now = !!entry.startTime && !!entry.endTime && entry.startTime <= nowHm && nowHm < entry.endTime;
    const mark = review?.blocks[entry.key]?.result;
    return <li key={entry.key} className={`border-b border-[#eeeaf3] py-4 last:border-0 ${now ? "-mx-3 rounded-xl bg-[#f5f1fb] px-3" : ""}`}>
      <button className="flex w-full gap-4 text-left" onClick={() => linked ? onOpenTask(linked.id) : onOpenEvent(entry)}>
        <span className="w-12 shrink-0 text-[14px] leading-6 text-[#877e94]">{entry.startTime}<br />{entry.endTime}</span>
        <span className="min-w-0"><span className={`block text-sm font-semibold leading-7 ${ended && mark ? "text-[#877e94]" : ""}`}>{now && <span className="mr-2 text-accent-dark">いま</span>}{entry.title}</span>
          <span className="mt-1 block text-[13px] text-[#877e94]">{entry.role === "OS_PENDING_CALENDAR" ? "アプリ内の計画・Calendar未反映" : linked && isTaskDone(linked, store) ? "タスク完了の記録あり" : linked ? "タスクあり（タップで開始・完了）" : "Calendarの予定"}</span>
          {entry.osTimeWas && <span className="mt-1 block text-[13px] leading-6 text-amber-700">アプリ内の時刻と違います。Calendarの時刻を表示しています。</span>}</span>
      </button>
      {event && ended && <div className="mt-2 grid grid-cols-3 gap-2 pl-16" role="group" aria-label={`${entry.title} の結果`}>
        {RESULTS.map(r => <button key={r} type="button" aria-pressed={mark === r}
          className={`min-h-10 rounded-xl border text-sm ${mark === r ? TONE[r] : "border-[#e4dfeb] bg-white text-[#5f566e]"}`}
          onClick={() => store.saveCalendarReview(markBlock(review, date, event, mark === r ? null : r, review?.blocks[event.id]?.reason ?? null, new Date().toISOString()))}>
          {RESULT_MARK[r]}</button>)}
      </div>}
    </li>;
  })}</ol>;
}
