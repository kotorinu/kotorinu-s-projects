import type { CalendarEventDTO } from "./calendarProvider";
import { themeForCalendarColorId } from "./calendarDay";

// カレンダーで回すPDCA (2026-09-30).
//
// これまでの振り返りは、アプリで「開始→完了」を押したTaskだけを数えていた。
// 本人の計画は Google Calendar にあり、アプリのTaskはほぼ使われていないので、
// 振り返りは毎回空になり、PDCAが回っていなかった。
//
// ここでは順番を本人の使い方に合わせる:
//
//   P  Google Calendar の予定そのもの（アプリでTaskを作らなくていい）
//   D  予定どおりに過ごす
//   C  夜に、今日の予定へ ○(できた) △(一部) ×(できなかった) を付ける。
//      × には理由を1つ選ぶ
//   A  「明日ひとつ変えること」を1行書く。翌日のTODAYの先頭に出る
//
// 記録には予定名・時刻・色も写しておく。Calendarの予定は後で動いたり消えたり
// するので、そのときの計画が何だったかは記録側に残す必要がある。
// 印を付けなかった予定は「未記録」で、できなかったとは数えない。

export type BlockResult = "DONE" | "PARTIAL" | "MISSED";
export type MissReason = "TIRED" | "OVERRAN" | "INTERRUPTED" | "TOO_BIG" | "FORGOT" | "REPLANNED";

export const RESULT_LABEL: Record<BlockResult, string> = { DONE: "できた", PARTIAL: "一部", MISSED: "できなかった" };
export const RESULT_MARK: Record<BlockResult, string> = { DONE: "○", PARTIAL: "△", MISSED: "×" };

export const MISS_REASON_LABEL: Record<MissReason, string> = {
  TIRED: "疲れていた・眠かった",
  OVERRAN: "前の予定が押した",
  INTERRUPTED: "割り込みが入った",
  TOO_BIG: "枠に対して量が多すぎた",
  FORGOT: "予定を忘れていた",
  REPLANNED: "意図して予定を変えた",
};

/** 理由ごとの、次に試せる変え方。決めるのは本人なので「案」として出す。 */
export const MISS_REASON_HINT: Record<MissReason, string> = {
  TIRED: "夜遅い枠を減らすか、頭を使う作業を朝へ移す",
  OVERRAN: "予定と予定の間に15分の余白を入れる",
  INTERRUPTED: "割り込みを受ける時間（RIALA確認など）を1つの枠にまとめる",
  TOO_BIG: "枠の中身を半分に分け、1枠で終わる量にする",
  FORGOT: "Calendarの通知を開始10分前に設定する",
  REPLANNED: "変えた理由を当日のうちにCalendarへ反映しておく",
};

export interface ReviewedBlock {
  result: BlockResult;
  /** MISSED / PARTIAL のときだけ。DONE では null。 */
  reason: MissReason | null;
  /** 記録した時点のCalendarの内容。後で予定が動いても計画が分かるように写す。 */
  title: string;
  startTime: string | null;
  endTime: string | null;
  colorId: string | null;
}

export interface CalendarDayReview {
  date: string;
  /** key: Calendar event id */
  blocks: Record<string, ReviewedBlock>;
  /** A: 明日ひとつ変えること。空なら未記入。 */
  nextChange: string;
  savedAt: string;
}

/** 睡眠・空き枠は振り返りの対象にしない。 */
const NOT_A_PLAN = /睡眠|就寝|仮眠|予定なし|休日|休憩/;

/** 振り返りの対象: 時刻のある予定。終日の締切や休息枠は除く。 */
export function reviewableEvents(events: CalendarEventDTO[], date: string): CalendarEventDTO[] {
  return events
    .filter(e => e.date === date && !e.allDay && e.startTime !== null && e.endTime !== null && !NOT_A_PLAN.test(e.summary))
    .sort((a, b) => a.startTime!.localeCompare(b.startTime!));
}

export function markBlock(
  review: CalendarDayReview | undefined,
  date: string,
  event: CalendarEventDTO,
  result: BlockResult | null,
  reason: MissReason | null,
  now: string,
): CalendarDayReview {
  const base: CalendarDayReview = review ?? { date, blocks: {}, nextChange: "", savedAt: now };
  const blocks = { ...base.blocks };
  if (result === null) delete blocks[event.id];
  else blocks[event.id] = {
    result,
    reason: result === "DONE" ? null : reason,
    title: event.summary,
    startTime: event.startTime,
    endTime: event.endTime,
    colorId: event.colorId,
  };
  return { ...base, blocks, savedAt: now };
}

export function setNextChange(review: CalendarDayReview | undefined, date: string, text: string, now: string): CalendarDayReview {
  const base: CalendarDayReview = review ?? { date, blocks: {}, nextChange: "", savedAt: now };
  return { ...base, nextChange: text.slice(0, 200), savedAt: now };
}

export interface ReviewCounts { done: number; partial: number; missed: number; recorded: number }

export function countResults(blocks: ReviewedBlock[]): ReviewCounts {
  const done = blocks.filter(b => b.result === "DONE").length;
  const partial = blocks.filter(b => b.result === "PARTIAL").length;
  const missed = blocks.filter(b => b.result === "MISSED").length;
  return { done, partial, missed, recorded: done + partial + missed };
}

/** できた率。△は半分と数える。記録が無ければ null（0%とは言わない）。 */
export function doneRate(c: ReviewCounts): number | null {
  return c.recorded === 0 ? null : Math.round(((c.done + c.partial * 0.5) / c.recorded) * 100);
}

function areaLabel(colorId: string | null): string {
  return themeForCalendarColorId(colorId)?.label ?? "色なし・その他";
}

export interface WeeklyCalendarReview {
  from: string;
  to: string;
  /** 振り返りを記録した日数 / 期間の日数 */
  reviewedDays: number;
  totalDays: number;
  counts: ReviewCounts;
  byArea: { area: string; counts: ReviewCounts; rate: number | null }[];
  reasons: { reason: MissReason; count: number }[];
  /** 期間中に書いた「明日ひとつ変えること」。新しい順。 */
  changes: { date: string; text: string }[];
}

export function weeklyCalendarReview(reviews: Record<string, CalendarDayReview>, from: string, to: string, totalDays: number): WeeklyCalendarReview {
  const days = Object.values(reviews).filter(r => r.date >= from && r.date <= to).sort((a, b) => b.date.localeCompare(a.date));
  const blocks = days.flatMap(d => Object.values(d.blocks));
  const areas = new Map<string, ReviewedBlock[]>();
  for (const b of blocks) areas.set(areaLabel(b.colorId), [...(areas.get(areaLabel(b.colorId)) ?? []), b]);
  const reasonCount = new Map<MissReason, number>();
  for (const b of blocks) if (b.reason && b.result !== "DONE") reasonCount.set(b.reason, (reasonCount.get(b.reason) ?? 0) + 1);
  return {
    from, to, totalDays,
    reviewedDays: days.filter(d => Object.keys(d.blocks).length > 0 || d.nextChange.trim() !== "").length,
    counts: countResults(blocks),
    byArea: [...areas.entries()]
      .map(([area, list]) => { const counts = countResults(list); return { area, counts, rate: doneRate(counts) }; })
      .sort((a, b) => b.counts.recorded - a.counts.recorded),
    reasons: [...reasonCount.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
    changes: days.filter(d => d.nextChange.trim() !== "").map(d => ({ date: d.date, text: d.nextChange.trim() })),
  };
}

/** 昨日決めた「明日ひとつ変えること」。TODAYの先頭に出す。 */
export function carriedChange(reviews: Record<string, CalendarDayReview>, yesterday: string): string | null {
  const text = reviews[yesterday]?.nextChange.trim();
  return text ? text : null;
}

export function validDayReview(value: unknown): value is CalendarDayReview {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (typeof v.date !== "string" || typeof v.nextChange !== "string" || typeof v.savedAt !== "string") return false;
  if (!v.blocks || typeof v.blocks !== "object" || Array.isArray(v.blocks)) return false;
  return Object.values(v.blocks as Record<string, unknown>).every(b => {
    const x = b as Record<string, unknown>;
    return !!x && ["DONE", "PARTIAL", "MISSED"].includes(String(x.result)) && typeof x.title === "string"
      && (x.reason === null || Object.keys(MISS_REASON_LABEL).includes(String(x.reason)));
  });
}
