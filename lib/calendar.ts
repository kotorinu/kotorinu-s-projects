import { daysInMonth } from "./date";
import type { CalendarConfidence, FixedCalendarEvent, PlanningConstraint } from "./types";

export function confidenceLabel(c: CalendarConfidence): string {
  switch (c) {
    case "USER_CONFIRMED":
      return "本人確定";
    case "FIXED_ALL_DAY_EVENT":
      return "固定終日予定";
    case "CONFIRMED_WEEKLY_READING":
      return "確定（週次読書）";
    case "TIMED_EXECUTION_BLOCK":
      return "実行計画（変動あり）";
    case "CONFIRMED_FIXED_EVENT":
      return "固定予定（確定）";
    case "CALENDAR_ONLY":
      return "Calendar記載のみ";
    default:
      return "要確認";
  }
}

export function planningConstraintLabel(p: PlanningConstraint): string | null {
  switch (p) {
    case "BLOCK_NORMAL_WORK":
      return "通常稼働ブロック";
    case "NO_HEAVY_WORK":
      return "重い作業を避ける";
    case "BLOCK_TIME":
      return "この時間帯は予定を入れない";
    default:
      return null;
  }
}

// True when [event.startDate, event.endDate] overlaps monthKey (YYYY-MM), inclusive.
export function eventsForMonth(events: FixedCalendarEvent[], monthKey: string): FixedCalendarEvent[] {
  const monthStart = `${monthKey}-01`;
  const monthEnd = `${monthKey}-${String(daysInMonth(monthKey)).padStart(2, "0")}`;
  return events.filter((e) => e.startDate <= monthEnd && e.endDate >= monthStart);
}
