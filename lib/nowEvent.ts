import type { CalendarEventDTO } from "./calendarProvider";
import { completionCriteria } from "./calendarTasks";
import { reviewableEvents } from "./calendarReview";
import type { Task } from "./types";

// TODAYの先頭に出す「いま」と「次」(2026-10-01)。
//
// 計画はCalendarにある。以前のTODAYはアプリのTaskから「今日の作業」を探し、
// Calendarに予定が並んでいても「今日の作業は、まだ決まっていません」と出していた。
// ここではCalendarの予定を正にして、いまの予定・次の予定と、その完了条件を返す。
// 睡眠・休憩・予定なし・終日の予定は対象にしない。

export interface NowEntry {
  event: CalendarEventDTO;
  criteria: string[];
  /** この予定から作ったタスク（あれば開始・完了をここで記録できる）。 */
  task: Task | null;
  minutesLeft: number | null;
  minutesUntil: number | null;
}

function minutes(hm: string) { const [h, m] = hm.split(":").map(Number); return h * 60 + m; }

export function taskForEvent(tasks: Task[], eventId: string): Task | null {
  return tasks.find(t => (t.contextTags ?? []).includes(`calendar:${eventId}`)) ?? null;
}

export function nowAndNext(events: CalendarEventDTO[], date: string, nowHm: string, tasks: Task[]) {
  const list = reviewableEvents(events, date);
  const now = minutes(nowHm);
  const toEntry = (e: CalendarEventDTO): NowEntry => ({
    event: e, criteria: completionCriteria(e.description), task: taskForEvent(tasks, e.id),
    minutesLeft: minutes(e.endTime!) - now, minutesUntil: minutes(e.startTime!) - now,
  });
  const current = list.filter(e => minutes(e.startTime!) <= now && now < minutes(e.endTime!)).map(toEntry);
  const upcoming = list.filter(e => minutes(e.startTime!) > now).map(toEntry);
  const ended = list.filter(e => minutes(e.endTime!) <= now);
  return { current: current[0] ?? null, next: upcoming[0] ?? null, later: upcoming.slice(1), ended, total: list.length };
}

/** 営業代行の予定には、営業スクリプトへの入口を出す。 */
export function isSalesEvent(e: CalendarEventDTO): boolean {
  return e.colorId === "9" || /営業|ロープレ|商談|スクリプト/.test(e.summary);
}
