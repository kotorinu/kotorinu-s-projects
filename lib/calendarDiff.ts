import { calendarSnapshot, type CalendarSnapshot, type CalendarSnapshotEvent } from "./calendarSnapshot";
import type { TimeBlock } from "./types";

// OS ⇄ Google Calendar 差分 (2026-09-09, §22/§23 → §3/§4で役割を確定).
//
// Google Calendar が WHEN の正本になったので、差分の意味も変わった。以前は
// 「どちらかを直す」だったが、いまは向きが決まっている:
//
//   時刻が違う      → OSがCalendarへ合わせる（Calendarを直しに行かない）
//   Calendarに無い  → まだ「いつやるか」が決まっていない
//   OSに無い        → Calendarにある予定をOSが取り込めていない
//
// そして「判定できない」という言い方をやめた (§4)。照合範囲の外や、照合後に
// 予定が動いた場合は、判定不能なのではなく **再照合すれば分かる** ので、そう
// 書く。ユーザーが取れる行動が違う。

export type CalendarDiffType =
  /** OSで実行すると決めたが、Calendarに枠が無い。＝いつやるかが未確定。 */
  | "MISSING_IN_CALENDAR"
  /** 時刻が違う。Calendarが正なので、OS側を合わせる。 */
  | "ADOPT_CALENDAR_TIME"
  /** OSで別日へ移したのに、Calendarに古いイベントが残っている。 */
  | "STALE_IN_CALENDAR"
  /** Calendarにある予定を、OSがまだ取り込んでいない。 */
  | "MISSING_IN_OS"
  /** 照合すれば分かる。範囲外、またはイベントが見つからない。 */
  | "NEEDS_RECHECK"
  /** 一致。calendarEventIdがあるものだけがここに来る。 */
  | "MATCHED";

export interface CalendarDiffItem {
  type: CalendarDiffType;
  blockId: string | null;
  eventId: string | null;
  title: string;
  /** OSが持っている予定。null＝OS側に無い。 */
  osWhen: string | null;
  /** Calendarが持っている予定。null＝Calendar側に無い（または未取得）。 */
  calendarWhen: string | null;
  /** 次にやること。1つだけ。 */
  action: string;
}

export const DIFF_TYPE_LABEL: Record<CalendarDiffType, string> = {
  MISSING_IN_CALENDAR: "Calendarに枠が無い",
  ADOPT_CALENDAR_TIME: "Calendarの時刻に合わせる",
  STALE_IN_CALENDAR: "Calendarに残骸がある",
  MISSING_IN_OS: "Calendarのみ",
  NEEDS_RECHECK: "再照合が必要",
  MATCHED: "一致",
};

export const DIFF_TYPE_HINT: Record<CalendarDiffType, string> = {
  MISSING_IN_CALENDAR:
    "実行すると決めたのにCalendarへ枠がありません。枠が入るまで、このTaskは「実行枠が未定」として扱います。",
  ADOPT_CALENDAR_TIME: "時刻はCalendarが正本です。OS側の予定をCalendarに合わせます。",
  STALE_IN_CALENDAR: "OSで別日へ移した予定のCalendarイベントが残っています。",
  MISSING_IN_OS: "Calendarにあり、OS側にTaskはありません。参加予定・面談・移動などは、これが正常な状態です。",
  NEEDS_RECHECK: "照合範囲の外、または対応するイベントが見つかりません。もう一度Calendarを読めば分かります。",
  MATCHED: "OSとCalendarが一致しています。",
};

function when(date: string, start: string | null, end: string | null): string {
  const [, m, d] = date.split("-");
  const day = `${Number(m)}/${Number(d)}`;
  if (start === null || end === null) return `${day} 終日`;
  return `${day} ${start}-${end}`;
}

function inCoverage(date: string, snap: CalendarSnapshot): boolean {
  return date >= snap.coverageStart && date <= snap.coverageEnd;
}

/**
 * タイトルは一致判定に使わない。OSはTaskのラベル、Calendarは整形済みの
 * サマリを持っているので、文字列としては最初から違う。意味があるのは時刻の
 * 比較だけ。
 */
function timeDiffers(block: TimeBlock, event: CalendarSnapshotEvent): boolean {
  return (
    block.date !== event.date ||
    block.startTime !== event.startTime ||
    block.endTime !== event.endTime
  );
}

export interface CalendarDiffInput {
  /** ライブの計画（reschedule後）。fixtureではない。 */
  planBlocks: TimeBlock[];
  /** 差し替えで置き換えられた枠。Calendarに残骸が残りうる。 */
  supersededBlocks: TimeBlock[];
  snapshot?: CalendarSnapshot;
  /**
   * この日付以降だけを照合する。昨日の食い違いは履歴であって、いま直せる
   * ものではない——queueに入れても、本当に直すべきものを埋めるだけ。
   */
  from?: string;
}

export function calendarDiff({
  planBlocks,
  supersededBlocks,
  snapshot = calendarSnapshot,
  from,
}: CalendarDiffInput): CalendarDiffItem[] {
  const onOrAfter = (date: string) => from === undefined || date >= from;
  const byId = new Map(snapshot.events.map((e) => [e.id, e]));
  const claimed = new Set<string>();
  const items: CalendarDiffItem[] = [];

  for (const block of planBlocks) {
    if (block.lifecycle !== "ACTIVE") continue;
    if (!onOrAfter(block.date)) continue;
    const osWhen = when(block.date, block.startTime, block.endTime);

    if (block.calendarEventId === null) {
      // idが無いものを「一致」と呼ぶことは絶対にしない。Calendarが正本である
      // 以上、枠が無いということは「いつやるかが決まっていない」ということ。
      items.push({
        type: "MISSING_IN_CALENDAR",
        blockId: block.id,
        eventId: null,
        title: block.label,
        osWhen,
        calendarWhen: null,
        action: "Google Calendarへ実行枠を作る（枠ができるまで実行枠は未定）",
      });
      continue;
    }

    claimed.add(block.calendarEventId);
    const event = byId.get(block.calendarEventId);

    if (!event) {
      items.push({
        type: "NEEDS_RECHECK",
        blockId: block.id,
        eventId: block.calendarEventId,
        title: block.label,
        osWhen,
        calendarWhen: null,
        action: inCoverage(block.date, snapshot)
          ? "Calendar側にこのイベントが見つからない。削除されたかを再照合で確かめる"
          : `照合した範囲(${snapshot.coverageStart}〜${snapshot.coverageEnd})の外。Calendarを読み直す`,
      });
      continue;
    }

    if (timeDiffers(block, event)) {
      items.push({
        type: "ADOPT_CALENDAR_TIME",
        blockId: block.id,
        eventId: event.id,
        title: block.label,
        osWhen,
        calendarWhen: when(event.date, event.startTime, event.endTime),
        action: "OS側の予定をCalendarの時刻に合わせる",
      });
    } else {
      items.push({
        type: "MATCHED",
        blockId: block.id,
        eventId: event.id,
        title: block.label,
        osWhen,
        calendarWhen: when(event.date, event.startTime, event.endTime),
        action: "対応不要",
      });
    }
  }

  // 別日へ移した枠のCalendarイベントがまだ生きている場合。Calendarが正本
  // である以上、これは「その時刻にやることになっている」と言い続けている。
  for (const block of supersededBlocks) {
    if (block.calendarEventId === null) continue;
    if (!onOrAfter(block.date)) continue;
    if (claimed.has(block.calendarEventId)) continue;
    const event = byId.get(block.calendarEventId);
    if (!event) continue;
    // ここでもclaimedへ入れる。下のループで「OSに無い」として二重に出さない。
    claimed.add(event.id);
    items.push({
      type: "STALE_IN_CALENDAR",
      blockId: block.id,
      eventId: event.id,
      title: block.label,
      osWhen: null,
      calendarWhen: when(event.date, event.startTime, event.endTime),
      action: "OSで別日へ移した予定。Calendar側の古いイベントを削除／移動する",
    });
  }

  // Calendarにあって、OSが知らない予定。正本はCalendarなので、これは
  // 「Calendarが間違っている」ではなく「OSが取り込めていない」。
  for (const event of snapshot.events) {
    if (claimed.has(event.id)) continue;
    if (event.allDay) continue; // 終日はメモであって実行枠ではない
    if (!onOrAfter(event.date)) continue;
    items.push({
      type: "MISSING_IN_OS",
      blockId: null,
      eventId: event.id,
      title: event.summary,
      osWhen: null,
      calendarWhen: when(event.date, event.startTime, event.endTime),
      action: "対応不要。Taskにする必要があれば、OS側で作る",
    });
  }

  const order: Record<CalendarDiffType, number> = {
    ADOPT_CALENDAR_TIME: 0,
    STALE_IN_CALENDAR: 1,
    MISSING_IN_CALENDAR: 2,
    MISSING_IN_OS: 3,
    NEEDS_RECHECK: 4,
    MATCHED: 5,
  };
  return items.sort(
    (a, b) =>
      order[a.type] - order[b.type] ||
      (a.osWhen ?? a.calendarWhen ?? "").localeCompare(b.osWhen ?? b.calendarWhen ?? "")
  );
}

/** 一致していないものすべて。Manager Inboxが出すもの。 */
export function calendarActionItems(items: CalendarDiffItem[]): CalendarDiffItem[] {
  return items.filter((i) => i.type !== "MATCHED");
}

/** 再照合すれば消えるかもしれないもの。行動が「Calendarを読み直す」に集約される。 */
export function needsRecheck(items: CalendarDiffItem[]): CalendarDiffItem[] {
  return items.filter((i) => i.type === "NEEDS_RECHECK");
}

/**
 * いま人が手を動かして直すもの。
 *
 * MISSING_IN_OS は含めない (§7)。Calendarにあってもすべてが独立したTaskに
 * なるわけではない——参加する会、面談、移動、契約手続き。それらは「OSが
 * 取りこぼしている」のではなく、Taskにする必要が無いだけ。ここへ入れると
 * 毎日ゼロにならない警告が出続け、本当に直すべきものが埋もれる。
 */
export function actionableNow(items: CalendarDiffItem[]): CalendarDiffItem[] {
  return items.filter(
    (i) => i.type === "ADOPT_CALENDAR_TIME" || i.type === "STALE_IN_CALENDAR" || i.type === "MISSING_IN_CALENDAR"
  );
}

/** Calendarにあり、OSはTaskとして持っていないもの。正常な状態 (§7)。 */
export function calendarOnlyItems(items: CalendarDiffItem[]): CalendarDiffItem[] {
  return items.filter((i) => i.type === "MISSING_IN_OS");
}
