import type { CalendarSyncState, TimeBlock } from "./types";

// Google Calendar reflection state (2026-09-08, §27).
//
// The app has no Calendar API write. That is stated, not hidden: a block only
// reaches CONFIRMED when it carries a real calendarEventId. Deciding a time
// inside AI Work OS moves it to NEEDS_CALENDAR_SYNC — accurate, and visibly
// not the same thing as "Calendarに入っている".
export function calendarSyncState(
  block: TimeBlock,
  syncEnabledOverride?: boolean
): CalendarSyncState {
  if (block.calendarEventId !== null) return "CONFIRMED";
  const enabled = syncEnabledOverride ?? block.calendarSyncEnabled;
  return enabled ? "NEEDS_CALENDAR_SYNC" : "NOT_NEEDED";
}

export const CALENDAR_SYNC_LABEL: Record<CalendarSyncState, string> = {
  NOT_NEEDED: "Calendar未登録",
  NEEDS_CALENDAR_SYNC: "Calendarへ要反映",
  CONFIRMED: "Calendar登録済み",
};
