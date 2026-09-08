import { calendarSnapshot, type CalendarSnapshot, type CalendarSnapshotEvent } from "./calendarSnapshot";
import type { TimeBlock } from "./types";

// OS ⇄ Google Calendar diff (2026-09-09, §22/§23).
//
// The rule this exists to enforce: a block with NO calendarEventId is never
// reported as MATCHED. "I can't tell" is a real answer and it has its own
// type. Silently assuming agreement is how a plan drifts for a week without
// anyone noticing.

export type CalendarDiffType = "CREATE" | "UPDATE" | "DELETE" | "MATCHED" | "UNKNOWN";

export interface CalendarDiffItem {
  type: CalendarDiffType;
  blockId: string | null;
  eventId: string | null;
  title: string;
  /** What the OS plans, as "9/9 19:00-21:10" — null when the OS has nothing. */
  osWhen: string | null;
  /** What Calendar holds — null when Calendar has nothing (or wasn't read). */
  calendarWhen: string | null;
  /** The one thing to do about it, in the user's words. */
  action: string;
}

export const DIFF_TYPE_LABEL: Record<CalendarDiffType, string> = {
  CREATE: "Calendarに無い",
  UPDATE: "時間・内容がずれている",
  DELETE: "Calendarに残骸がある",
  MATCHED: "一致",
  UNKNOWN: "判定できない",
};

export const DIFF_TYPE_HINT: Record<CalendarDiffType, string> = {
  CREATE: "OSで決めた予定がCalendarに登録されていません。",
  UPDATE: "同じ予定がOSとCalendarで違う時間・違うタイトルになっています。",
  DELETE: "OS側で差し替えた予定のCalendarイベントが残っています。",
  MATCHED: "OSとCalendarが一致しています。",
  UNKNOWN: "Calendarを読んだ範囲外、または対応するイベントIDが無いため判定できません。",
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
 * Titles never match character-for-character — the OS stores a task label,
 * Calendar stores a formatted summary. Comparing time is meaningful;
 * comparing titles is not, so only time drives UPDATE.
 */
function timeDiffers(block: TimeBlock, event: CalendarSnapshotEvent): boolean {
  return (
    block.date !== event.date ||
    block.startTime !== event.startTime ||
    block.endTime !== event.endTime
  );
}

export interface CalendarDiffInput {
  /** The live plan (post-reschedule), not the fixture. */
  planBlocks: TimeBlock[];
  /** Blocks replaced by a reschedule — their Calendar events are now stale. */
  supersededBlocks: TimeBlock[];
  snapshot?: CalendarSnapshot;
  /**
   * Only reconcile from this date forward (YYYY-MM-DD). Yesterday's
   * disagreements are history: nobody is going to go back and fix a Calendar
   * event for a day that has already happened, so putting them in the queue
   * just buries the ones that matter.
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
      // No id — the only two honest answers are "needs creating" (the user
      // asked for it on Calendar) or "we can't tell".
      if (block.calendarSyncEnabled) {
        items.push({
          type: "CREATE",
          blockId: block.id,
          eventId: null,
          title: block.label,
          osWhen,
          calendarWhen: null,
          action: "Google Calendarへこの予定を新規作成する",
        });
      } else {
        items.push({
          type: "UNKNOWN",
          blockId: block.id,
          eventId: null,
          title: block.label,
          osWhen,
          calendarWhen: null,
          action: "Calendarに載せるかどうかを決める（IDが無いので一致とは判定しない）",
        });
      }
      continue;
    }

    claimed.add(block.calendarEventId);
    const event = byId.get(block.calendarEventId);

    if (!event) {
      // Either outside the window we read, or the event is gone. Those are
      // different problems, so they get different wording.
      items.push({
        type: "UNKNOWN",
        blockId: block.id,
        eventId: block.calendarEventId,
        title: block.label,
        osWhen,
        calendarWhen: null,
        action: inCoverage(block.date, snapshot)
          ? "Calendar側にこのイベントが見つからない。削除されたか確認する"
          : `Calendarを読んだ範囲(${snapshot.coverageStart}〜${snapshot.coverageEnd})の外。再取得が必要`,
      });
      continue;
    }

    if (timeDiffers(block, event)) {
      items.push({
        type: "UPDATE",
        blockId: block.id,
        eventId: event.id,
        title: block.label,
        osWhen,
        calendarWhen: when(event.date, event.startTime, event.endTime),
        action: "Calendarイベントの日時をOSに合わせて修正する",
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

  // A rescheduled-away block whose Calendar event still exists: the calendar
  // is now telling the user to do something at a time they already moved.
  for (const block of supersededBlocks) {
    if (block.calendarEventId === null) continue;
    if (!onOrAfter(block.date)) continue;
    if (claimed.has(block.calendarEventId)) continue;
    const event = byId.get(block.calendarEventId);
    if (!event) continue;
    // Claimed here too, so the orphan pass below does not ALSO report it as
    // "Calendar has this, the OS does not" — it is one problem, not two.
    claimed.add(event.id);
    items.push({
      type: "DELETE",
      blockId: block.id,
      eventId: event.id,
      title: block.label,
      osWhen: null,
      calendarWhen: when(event.date, event.startTime, event.endTime),
      action: "OSで別日へ移した予定。Calendar側の古いイベントを削除／移動する",
    });
  }

  // Calendar events inside the read window that the OS has no block for.
  for (const event of snapshot.events) {
    if (claimed.has(event.id)) continue;
    if (event.allDay) continue; // all-day markers are notes, not work blocks
    if (!onOrAfter(event.date)) continue;
    items.push({
      type: "UNKNOWN",
      blockId: null,
      eventId: event.id,
      title: event.summary,
      osWhen: null,
      calendarWhen: when(event.date, event.startTime, event.endTime),
      action: "Calendarにあるが、OSに対応するTimeBlockが無い",
    });
  }

  const order: Record<CalendarDiffType, number> = {
    UPDATE: 0,
    DELETE: 1,
    CREATE: 2,
    UNKNOWN: 3,
    MATCHED: 4,
  };
  return items.sort((a, b) => order[a.type] - order[b.type] || (a.osWhen ?? a.calendarWhen ?? "").localeCompare(b.osWhen ?? b.calendarWhen ?? ""));
}

/** Everything that is not already agreeing — what the Manager Inbox shows. */
export function calendarActionItems(items: CalendarDiffItem[]): CalendarDiffItem[] {
  return items.filter((i) => i.type !== "MATCHED");
}
