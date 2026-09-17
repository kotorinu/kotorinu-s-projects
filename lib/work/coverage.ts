import type { Goal, Task } from "../types";
import type { WorkRun } from "./model";
import { effectiveDeadline, isTaskOpen, isTaskLive, type TaskStateOverlays } from "../taskState";
/** Missing evidence, not an achievement score. */
export function workCoverage(tasks: Task[], goals: Goal[], runs: WorkRun[], today: string, overlays: TaskStateOverlays = {completions:{},dispositions:{},deadlineOverrides:{},workDateOverrides:{}}) {
  const pending = tasks.filter(t => isTaskLive(t,overlays) && isTaskOpen(t,overlays));
  const ids = new Set(goals.map(g => g.id));
  const openGoals = goals.filter(g => ["進行中", "未達成"].includes(g.status));
  return {
    pending, overdue: pending.filter(t => { const deadline=effectiveDeadline(t,overlays); return deadline && deadline < today; }),
    unlinked: pending.filter(t => !t.goalId || !ids.has(t.goalId)),
    noCriteria: pending.filter(t => !t.definitionOfDone.some(x => x.trim())),
    goalsWithoutWork: openGoals.filter(g => !pending.some(t => t.goalId === g.id)),
    goalsWithoutCriteria: openGoals.filter(g => !g.achievementCriteria.trim()),
    review: runs.filter(r => r.status === "REVIEW" && pending.some(t => t.id === r.taskId)),
    blocked: runs.filter(r => r.status === "BLOCKED" && pending.some(t => t.id === r.taskId)),
    queued: runs.filter(r => r.status === "QUEUED" && pending.some(t => t.id === r.taskId)),
  };
}
