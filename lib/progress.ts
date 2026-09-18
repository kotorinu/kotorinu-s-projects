import type { Task } from "./types";
import { isTaskLive, isTaskDone, type TaskStateOverlays } from "./taskState";

// Phase 1: count-based only. Future modes ("time" = estimateMinutes-weighted,
// "importance" = importance-weighted, "goal" = achievement-criteria-based)
// can be added here without touching callers.
export type ProgressMode = "count";

export interface ProgressResult {
  done: number;
  total: number;
  pct: number;
}

export function computeProgress(tasks: Task[], mode: ProgressMode = "count", overlays?: TaskStateOverlays): ProgressResult {
  void mode;
  const current = overlays ? tasks.filter(t=>isTaskLive(t,overlays)) : tasks;
  const total = current.length;
  const done = current.filter(t=>overlays ? isTaskDone(t,overlays) && overlays.completions[t.id]?.metDefinitionOfDone!==false : t.status==="完了").length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return { done, total, pct };
}

// Progress toward a single Goal, derived from the tasks linked to it via goalId.
export function computeGoalProgress(allTasks: Task[], goalId: string, overlays?: TaskStateOverlays): ProgressResult {
  return computeProgress(allTasks.filter((t) => t.goalId === goalId),"count",overlays);
}
