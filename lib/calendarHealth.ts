import type { CalendarEventDTO } from "./calendarProvider";
import { addCalendarDays, validCalendarDate } from "./calendarTime";

// カレンダー点検 (2026-09-30).
//
// calendarDiff は「OSの計画とCalendarが食い違っていないか」を見る。
// こちらは Calendar そのものに無理が無いかを見る。実データ（9/16〜10/7）で
// 目立ったのは次の3つで、どれも Calendar を読むだけで機械的に分かる:
//
//   DUPLICATE   同じ開始時刻に予定が2つ（二重登録の可能性）
//   OVERLAP     時間が重なっている（片方は実行できない）
//   SHORT_REST  夜の空き時間が短い（翌朝の予定が前夜に食い込まれている）
//
// 判定は読むだけで、Calendarを直さない（書き込み権限は持たない）。
// 「意図した重なり」かどうかはアプリには分からないので、内側に収まっている
// 予定は contained として区別し、決めるのは本人に返す。

export type CalendarHealthKind = "DUPLICATE" | "OVERLAP" | "SHORT_REST";

export interface CalendarHealthIssue {
  kind: CalendarHealthKind;
  /** 問題が起きている日（SHORT_REST は前夜の日付）。 */
  date: string;
  /** 根拠になった予定。表示と照合に使う。 */
  eventIds: string[];
  /** 何が起きているか。予定名と時刻を含む。 */
  detail: string;
  /** 次にやること。1つだけ。 */
  action: string;
  /** OVERLAP のうち、片方がもう片方の内側に完全に収まっているもの。 */
  contained: boolean;
}

export const HEALTH_KIND_LABEL: Record<CalendarHealthKind, string> = {
  DUPLICATE: "二重登録の可能性",
  OVERLAP: "時間の重なり",
  SHORT_REST: "夜の休息が短い",
};

/** 夜の空き時間の下限。これを下回る夜を知らせる。 */
export const MIN_REST_MINUTES = 6 * 60;
/** 夜の空き時間を探す範囲: その日の18:00〜翌日12:00。 */
const NIGHT_FROM = 18 * 60;
const NIGHT_TO = 24 * 60 + 12 * 60;
/** これより前に始まる予定は「夜の活動」。これ以降に始まる予定は「翌朝の活動」。 */
const REST_MUST_START_BY = 24 * 60 + 3 * 60;

/** 休息・空きとして登録された枠（【睡眠・回復】【予定なし】など）は予定ではないので、空き時間から引かない。 */
const REST_PATTERN = /睡眠|就寝|仮眠|予定なし|休日/;

function toMinutes(hm: string): number {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
}

function hm(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

function duration(minutes: number): string {
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return m ? `${h}時間${m}分` : `${h}時間`;
}

function dayLabel(date: string): string {
  return `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
}

interface Timed { event: CalendarEventDTO; start: number; end: number }

function timedEvents(events: CalendarEventDTO[], date: string): Timed[] {
  return events
    .filter(e => e.date === date && !e.allDay && e.startTime !== null && e.endTime !== null)
    .map(e => ({ event: e, start: toMinutes(e.startTime!), end: toMinutes(e.endTime!) }))
    .filter(t => t.end > t.start)
    .sort((a, b) => a.start - b.start || b.end - a.end);
}

function overlapIssues(date: string, day: Timed[]): CalendarHealthIssue[] {
  const issues: CalendarHealthIssue[] = [];
  for (let i = 0; i < day.length; i++) {
    for (let j = i + 1; j < day.length; j++) {
      const a = day[i], b = day[j];
      if (b.start >= a.end) continue; // 隣接（終了=開始）は重なりではない
      const span = (t: Timed) => `${t.event.summary}（${hm(t.start)}-${hm(t.end)}）`;
      if (a.start === b.start) {
        issues.push({ kind: "DUPLICATE", date, eventIds: [a.event.id, b.event.id], contained: false,
          detail: `${dayLabel(date)} ${hm(a.start)} に2つの予定: ${span(a)} / ${span(b)}`,
          action: "同じ予定の重複なら、Calendarで片方を削除してください。" });
        continue;
      }
      const contained = b.end <= a.end;
      issues.push({ kind: "OVERLAP", date, eventIds: [a.event.id, b.event.id], contained,
        detail: `${dayLabel(date)} ${span(a)} と ${span(b)} が${contained ? "重なっています（後者は前者の内側）" : ` ${hm(b.start)}-${hm(Math.min(a.end, b.end))} で重なっています`}`,
        action: contained
          ? "内側で行う前提の枠ならそのままで大丈夫です。別々に必要なら、どちらかを動かしてください。"
          : "どちらを優先するか決めて、もう一方をCalendarで動かしてください。" });
    }
  }
  return issues;
}

function restIssue(date: string, tonight: Timed[], tomorrow: Timed[]): CalendarHealthIssue | null {
  const busy = [...tonight.map(t => ({ ...t })), ...tomorrow.map(t => ({ ...t, start: t.start + 1440, end: t.end + 1440 }))]
    .filter(t => !REST_PATTERN.test(t.event.summary))
    .map(t => ({ event: t.event, start: Math.max(t.start, NIGHT_FROM), end: Math.min(t.end, NIGHT_TO) }))
    .filter(t => t.end > t.start)
    .sort((a, b) => a.start - b.start);
  // 夜の最後の活動 = 深夜3時より前に始まる予定のうち、いちばん遅く終わるもの。
  // 休息はそこから次の予定の開始まで。夕方の空きや朝の予定の後の空きは数えない。
  let before: CalendarEventDTO | null = null, from = NIGHT_FROM;
  for (const t of busy) if (t.start < REST_MUST_START_BY && t.end > from) { from = t.end; before = t.event; }
  const next = busy.find(t => t.start >= from) ?? null;
  const after = next?.event ?? null;
  const best = { from, to: next ? next.start : NIGHT_TO };
  const gap = best.to - best.from;
  if (gap >= MIN_REST_MINUTES) return null;
  const ids = [before?.id, after?.id].filter((id): id is string => typeof id === "string");
  const fromLabel = before ? `${before.summary} の終了 ${hm(best.from)}` : hm(best.from);
  const toLabel = after ? `翌朝 ${after.summary} の開始 ${hm(best.to)}` : `翌 ${hm(best.to)}`;
  return { kind: "SHORT_REST", date, eventIds: ids, contained: false,
    detail: `${dayLabel(date)}の夜の空きは ${duration(gap)}: ${fromLabel} → ${toLabel}`,
    action: `夜の予定を早めに終えるか、翌朝の予定を遅らせて ${duration(MIN_REST_MINUTES)}以上空けてください。` };
}

/**
 * today 以降、Calendarを読めた範囲（coverage）の中だけを点検する。
 * 範囲の外は「問題なし」ではなく未確認なので、判定しない。
 */
export function calendarHealth(input: {
  events: CalendarEventDTO[];
  today: string;
  coverageStart: string;
  coverageEnd: string;
}): CalendarHealthIssue[] {
  const { events, today, coverageStart, coverageEnd } = input;
  if (![today, coverageStart, coverageEnd].every(validCalendarDate) || coverageStart > coverageEnd) return [];
  const first = today > coverageStart ? today : coverageStart;
  const issues: CalendarHealthIssue[] = [];
  for (let date = first; date <= coverageEnd; date = addCalendarDays(date, 1)) {
    const day = timedEvents(events, date);
    issues.push(...overlapIssues(date, day));
    const next = addCalendarDays(date, 1);
    if (next <= coverageEnd) {
      const rest = restIssue(date, day, timedEvents(events, next));
      if (rest) issues.push(rest);
    }
  }
  const order: Record<CalendarHealthKind, number> = { DUPLICATE: 0, OVERLAP: 1, SHORT_REST: 2 };
  return issues.sort((a, b) => a.date.localeCompare(b.date) || Number(a.contained) - Number(b.contained) || order[a.kind] - order[b.kind]);
}

/** 本人が動く必要があるもの（内側に収まっている重なりは確認扱い）。 */
export function needsAction(issues: CalendarHealthIssue[]): CalendarHealthIssue[] {
  return issues.filter(i => !i.contained);
}
