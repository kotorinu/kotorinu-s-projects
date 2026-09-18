import { effectiveDeadline, effectiveWorkDate, isTaskBlocked, isTaskOpen, overdueTasks, type TaskStateOverlays } from "./taskState";
import type { Task, TimeBlock } from "./types";

// Suggestions are derived from decided dates, not an invented AI priority.
export function focusDay(tasks: Task[], blocks: TimeBlock[], date: string, nowHm: string, overlays: TaskStateOverlays, startedTaskId: string | null) {
  const open = tasks.filter(t => isTaskOpen(t, overlays));
  const dayBlocks = blocks.filter(b => b.date === date && b.lifecycle === "ACTIVE");
  const scheduled = open.filter(t => {
    const moved = overlays.workDateOverrides[t.id];
    if (moved && moved !== date) return false;
    return effectiveWorkDate(t, overlays) === date || dayBlocks.some(b => b.taskId === t.id);
  });
  const ids = new Set(scheduled.map(t => t.id));
  const due = open.filter(t => effectiveDeadline(t, overlays) === date && !ids.has(t.id));
  const active = open.find(t => t.id === startedTaskId) ?? null;
  const candidates = scheduled.filter(t => !isTaskBlocked(t, overlays));
  const nextBlock = dayBlocks.filter(b => b.taskId && candidates.some(t => t.id === b.taskId) && b.endTime > nowHm).sort((a,b) => a.startTime.localeCompare(b.startTime))[0];
  const focus = active ?? candidates.find(t => t.id === nextBlock?.taskId) ?? candidates[0] ?? due.find(t => !isTaskBlocked(t, overlays) && (!effectiveWorkDate(t, overlays) || effectiveWorkDate(t, overlays) === date)) ?? null;
  return { scheduled, due, active, focus, overdue: overdueTasks(tasks, date, overlays), waiting: open.filter(t => isTaskBlocked(t, overlays)) };
}
