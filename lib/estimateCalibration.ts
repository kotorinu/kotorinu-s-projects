import type { Task, TaskCompletionRecord } from "./types";

// Estimate calibration (2026-09-08, §16).
//
// Suggest a next estimate only once there is enough real history to mean
// anything: three or more completed Tasks of the same kind, each with a
// measured actual. Below that the app says nothing rather than extrapolating
// from one data point.
//
// The suggestion is never applied automatically — the user's estimate is
// their judgement, and silently rewriting it would hide that the plan changed.
export const MIN_SAMPLES = 3;

export interface EstimateSuggestion {
  samples: number[];
  suggestedMinutes: number;
  currentEstimate: number | null;
  /** How the samples are grouped, in words, so the basis is inspectable. */
  basis: string;
}

/**
 * Same-kind grouping. Deliberately conservative: an explicit series first
 * (those really are the same work split up), otherwise area + rough shape of
 * the title. Never "all Tasks", which would average unrelated work.
 */
export function estimateGroupKey(task: Task): string {
  if (task.seriesId) return `series:${task.seriesId}`;
  if (task.contextTags.includes("昼スマホ枠")) return `lunch:${task.area}`;
  return `area:${task.area}:${task.requiredEnvironment ?? "UNKNOWN"}`;
}

export function estimateGroupLabel(task: Task): string {
  if (task.seriesId) return task.seriesTitle ?? "同じシリーズのTask";
  if (task.contextTags.includes("昼スマホ枠")) return `${task.area}の昼スマホ枠Task`;
  return `${task.area}の同種Task`;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];
}

export function suggestEstimate(
  task: Task,
  allTasks: Task[],
  completions: Record<string, TaskCompletionRecord>
): EstimateSuggestion | null {
  const key = estimateGroupKey(task);
  const samples = allTasks
    .filter((t) => t.id !== task.id && estimateGroupKey(t) === key)
    .map((t) => completions[t.id]?.actualMinutes)
    .filter((m): m is number => typeof m === "number" && m > 0);

  if (samples.length < MIN_SAMPLES) return null;
  return {
    samples,
    suggestedMinutes: median(samples),
    currentEstimate: task.estimateMinutes,
    basis: estimateGroupLabel(task),
  };
}

// --- Variance reason prompting (§15) ---
// Asking "why?" after every task trains the user to dismiss it. Only ask when
// the gap is actually worth explaining: 20% or more, or at least 15 minutes.
export const VARIANCE_PROMPT_PERCENT = 20;
export const VARIANCE_PROMPT_MINUTES = 15;

export function shouldAskVarianceReason(
  estimateMinutes: number | null,
  actualMinutes: number | null
): boolean {
  if (estimateMinutes === null || actualMinutes === null) return false;
  const diff = Math.abs(actualMinutes - estimateMinutes);
  if (diff >= VARIANCE_PROMPT_MINUTES) return true;
  return estimateMinutes > 0 && (diff / estimateMinutes) * 100 >= VARIANCE_PROMPT_PERCENT;
}
