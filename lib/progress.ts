import type { Task } from "./types";

// Phase 1: count-based only. Future modes ("time" = estimateMinutes-weighted,
// "importance" = importance-weighted, "goal" = achievement-criteria-based)
// can be added here without touching callers.
export type ProgressMode = "count";

export interface ProgressResult {
  done: number;
  total: number;
  pct: number;
}

export function computeProgress(tasks: Task[], mode: ProgressMode = "count"): ProgressResult {
  void mode;
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === "完了").length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return { done, total, pct };
}

// Progress toward a single Goal, derived from the tasks linked to it via goalId.
export function computeGoalProgress(allTasks: Task[], goalId: string): ProgressResult {
  return computeProgress(allTasks.filter((t) => t.goalId === goalId));
}
