import type { TimeBlock, TimeBlockSyncState } from "./types";

// Google Calendar reflection state (2026-09-08, §17/§18).
//
// There is no Calendar API write in this app. That is stated, not hidden:
// CALENDAR_CONFIRMED requires a real calendarEventId, so nothing currently
// reaches it and nothing pretends to.
//
//   DRAFT                — OS内の下書き。実行すると決めていない
//   COMMITTED            — 実行すると決めた。Calendarには載せない判断
//   NEEDS_CALENDAR_SYNC  — Calendarへ反映が必要（新規・変更どちらも）
//   CALENDAR_CONFIRMED   — 実際のCalendarイベントと対応している
//
// A block edited inside the OS moves back to NEEDS_CALENDAR_SYNC even if it
// once had an event id, because the event out there is now wrong.
export function calendarSyncState(
  block: TimeBlock,
  overrides?: { syncEnabled?: boolean; changedInOs?: boolean }
): TimeBlockSyncState {
  const enabled = overrides?.syncEnabled ?? block.calendarSyncEnabled;
  if (overrides?.changedInOs) return "NEEDS_CALENDAR_SYNC";
  if (block.calendarEventId !== null) return "CALENDAR_CONFIRMED";
  if (enabled) return "NEEDS_CALENDAR_SYNC";
  return block.lifecycle === "ACTIVE" ? "COMMITTED" : "DRAFT";
}

export const CALENDAR_SYNC_LABEL: Record<TimeBlockSyncState, string> = {
  DRAFT: "下書き",
  COMMITTED: "OS内で確定",
  NEEDS_CALENDAR_SYNC: "Calendarへ要反映",
  CALENDAR_CONFIRMED: "Calendar登録済み",
};

export const CALENDAR_SYNC_HINT: Record<TimeBlockSyncState, string> = {
  DRAFT: "まだ実行すると決めていない予定です。",
  COMMITTED: "AI Work OS上では確定していますが、Google Calendarには載せていません。",
  NEEDS_CALENDAR_SYNC:
    "Google Calendarへの反映がまだです。このアプリからCalendarへ書き込む機能は未実装なので、手動またはCalendar連携のあるセッションから反映してください。",
  CALENDAR_CONFIRMED: "実際のGoogle Calendarイベントと対応しています。",
};

/** How many live blocks are waiting to be reflected into Calendar (§18). */
export function needsCalendarSyncCount(
  blocks: TimeBlock[],
  syncOverrides: Record<string, boolean>,
  changedInOs: Set<string>
): number {
  return blocks.filter(
    (b) =>
      b.lifecycle === "ACTIVE" &&
      calendarSyncState(b, {
        syncEnabled: syncOverrides[b.id],
        changedInOs: changedInOs.has(b.id),
      }) === "NEEDS_CALENDAR_SYNC"
  ).length;
}
