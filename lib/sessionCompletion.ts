import { computeVariance } from "./execution";
import { delayDaysFor, effectiveDeadline } from "./taskState";
import { minutesBetweenIso } from "./workSession";
import type { Task, TaskCompletionRecord, TaskWorkSession } from "./types";

export function measuredTaskMinutes(taskId: string, sessions: TaskWorkSession[], actual: Map<string, number>, nowIso: string): number | null {
  const closed = sessions.filter(s => s.taskId === taskId && s.endedAt !== null && s.minutes !== null);
  const running = sessions.find(s => s.taskId === taskId && s.endedAt === null);
  const saved = actual.get(taskId) ?? (closed.length ? closed.reduce((n,s) => n + (s.minutes ?? 0), 0) : null);
  return running ? (saved ?? 0) + minutesBetweenIso(running.startedAt, nowIso) : saved;
}

export function sessionCompletion(task: Task, args: { date: string; nowIso: string; sessions: TaskWorkSession[]; actual: Map<string, number>; deadlineOverrides: Record<string,string>; metDefinitionOfDone: boolean }): TaskCompletionRecord {
  const actualMinutes = measuredTaskMinutes(task.id, args.sessions, args.actual, args.nowIso);
  const deadlineAtCompletion = effectiveDeadline(task, args);
  return { taskId: task.id, completedAt: args.nowIso, completedOnDate: args.date, originalDeadline: task.deadline, deadlineAtCompletion, delayDays: delayDaysFor(deadlineAtCompletion, args.date), metDefinitionOfDone: args.metDefinitionOfDone, estimateMinutes: task.estimateMinutes, actualMinutes, varianceMinutes: actualMinutes === null ? null : computeVariance(task.estimateMinutes, actualMinutes).varianceMinutes };
}
