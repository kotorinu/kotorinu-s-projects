import type { Task } from "./types";

// Task Series (2026-09-06): a real split of one body of work into several
// independently-completable Tasks — distinct from TimeBlock (§15: Series =
// what the work is broken into, TimeBlock = when you sit down to do it).
// finalDeadline is derived, not stored: the latest deadline among the
// series' own Tasks, so any Task in the series can show "最終期限" without
// duplicating that date onto every member.

export interface SeriesInfo {
  seriesTitle: string;
  sequenceNumber: number;
  totalSteps: number;
  finalDeadline: string | null;
  previous: Task | null;
  current: Task;
  next: Task | null;
  members: Task[]; // all series Tasks, sorted by sequenceNumber
}

export function resolveSeries(task: Task, allTasks: Task[]): SeriesInfo | null {
  if (!task.seriesId) return null;
  const members = allTasks
    .filter((t) => t.seriesId === task.seriesId)
    .sort((a, b) => (a.sequenceNumber ?? 0) - (b.sequenceNumber ?? 0));
  const idx = members.findIndex((t) => t.id === task.id);
  if (idx === -1) return null;

  let finalDeadline: string | null = null;
  for (const m of members) {
    if (m.deadline && (!finalDeadline || m.deadline > finalDeadline)) finalDeadline = m.deadline;
  }

  return {
    seriesTitle: task.seriesTitle ?? task.title,
    sequenceNumber: task.sequenceNumber ?? idx + 1,
    totalSteps: task.totalSteps ?? members.length,
    finalDeadline,
    previous: idx > 0 ? members[idx - 1] : null,
    current: task,
    next: idx < members.length - 1 ? members[idx + 1] : null,
    members,
  };
}
