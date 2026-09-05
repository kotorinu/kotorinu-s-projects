import type { Area, FixedCalendarEvent, Task, TimeBlock } from "./types";

// TASK MAP Week View (2026-09-06 readability round). A lightweight roll-up
// of what's actually plannable this week — never a Google Calendar
// replacement (PRD.md's Google Calendar semantics section): FIXED events,
// Task deadlines, and real scheduled/assigned work. Small Steps and short
// (<15min) plain TimeBlocks (meals, sleep prep) are deliberately excluded —
// this view is for "what am I doing this week", not a full day itinerary.

export type WeekEntryKind = "FIXED" | "DEADLINE" | "PLANNED_WORK";

export interface WeekEntry {
  id: string;
  date: string;
  kind: WeekEntryKind;
  time: string | null; // HH:mm; null for all-day Fixed Events, Deadlines, and workDate-only placement
  label: string;
  taskId: string | null;
  area: Area | null;
}

function minutesBetween(startTime: string, endTime: string): number {
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  return eh * 60 + em - (sh * 60 + sm);
}

export function buildWeekEntries(
  dates: string[],
  tasks: Task[],
  timeBlocks: TimeBlock[],
  fixedEvents: FixedCalendarEvent[],
  workDateOverrides: Record<string, string>
): Map<string, WeekEntry[]> {
  const dateSet = new Set(dates);
  const map = new Map<string, WeekEntry[]>();
  for (const d of dates) map.set(d, []);

  const shownTaskByDate = new Set<string>(); // `${date}:${taskId}` — avoid double-listing the same Task twice on one day

  // PLANNED_WORK from real TimeBlocks — only ones pointing at an actual
  // Task, and only if the block is substantial enough to plan around (§3:
  // "5分〜10分のTaskは表示しない").
  for (const tb of timeBlocks) {
    if (!dateSet.has(tb.date) || !tb.taskId) continue;
    if (minutesBetween(tb.startTime, tb.endTime) < 15) continue;
    const task = tasks.find((t) => t.id === tb.taskId);
    if (!task) continue;
    map.get(tb.date)!.push({
      id: `tb-${tb.id}`,
      date: tb.date,
      kind: "PLANNED_WORK",
      time: tb.startTime,
      label: tb.label,
      taskId: task.id,
      area: task.area,
    });
    shownTaskByDate.add(`${tb.date}:${task.id}`);
  }

  // PLANNED_WORK from a Task's effective workDate (its own workDate, or a
  // Carryover's workDateOverride) when it has no TimeBlock of its own that
  // day — still worth showing as "this is the day it's assigned to".
  for (const t of tasks) {
    if (t.status === "完了" || t.status === "Archive") continue;
    const effectiveDate = workDateOverrides[t.id] ?? t.workDate;
    if (!effectiveDate || !dateSet.has(effectiveDate)) continue;
    if (shownTaskByDate.has(`${effectiveDate}:${t.id}`)) continue;
    map.get(effectiveDate)!.push({
      id: `workdate-${t.id}`,
      date: effectiveDate,
      kind: "PLANNED_WORK",
      time: null,
      label: t.title,
      taskId: t.id,
      area: t.area,
    });
    shownTaskByDate.add(`${effectiveDate}:${t.id}`);
  }

  // FIXED — Google Calendar-confirmed constraints (PRD.md §24), shown
  // wherever they overlap this week.
  for (const e of fixedEvents) {
    for (const d of dates) {
      if (d >= e.startDate && d <= e.endDate) {
        map.get(d)!.push({
          id: `fce-${e.id}-${d}`,
          date: d,
          kind: "FIXED",
          time: e.startTime,
          label: e.title,
          taskId: null,
          area: null,
        });
      }
    }
  }

  // DEADLINE — only when not already shown as PLANNED_WORK that same day,
  // so a Task due today that's also scheduled today isn't listed twice.
  for (const t of tasks) {
    if (t.status === "完了" || t.status === "Archive") continue;
    if (!t.deadline || !dateSet.has(t.deadline)) continue;
    if (shownTaskByDate.has(`${t.deadline}:${t.id}`)) continue;
    map.get(t.deadline)!.push({
      id: `deadline-${t.id}`,
      date: t.deadline,
      kind: "DEADLINE",
      time: null,
      label: t.title,
      taskId: t.id,
      area: t.area,
    });
  }

  for (const d of dates) {
    map.get(d)!.sort((a, b) => (a.time ?? "").localeCompare(b.time ?? "~"));
  }
  return map;
}
