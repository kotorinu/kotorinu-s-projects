export interface ExecutionRecord { version: number; snapshot: Record<string, unknown> | null; updatedAt: string | null }
export const emptyExecution = (): ExecutionRecord => ({ version: 0, snapshot: null, updatedAt: null });
export function validSnapshot(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.currentDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v.currentDate)) return false;
  for (const key of ["done", "recurringDone", "manualActualTaskIds", "supersededBlockIds"])
    if (v[key] !== undefined && (!Array.isArray(v[key]) || !(v[key] as unknown[]).every(x => typeof x === "string"))) return false;
  for (const key of ["taskStartedAt", "taskCompletedAt", "taskActualMinutes", "varianceReasonByTaskId"])
    if (v[key] !== undefined && (!Array.isArray(v[key]) || !(v[key] as unknown[]).every(x => Array.isArray(x) && x.length === 2 && typeof x[0] === "string" && (typeof x[1] === "string" || typeof x[1] === "number")))) return false;
  for (const key of ["history", "carryover", "workDateOverrides", "calendarSyncOverrides", "completions", "dispositions", "deadlineOverrides", "lifecycleOverrides", "nextEstimates", "phaseOwnVersions", "replanFlags", "timeBlockOverrides"])
    if (v[key] !== undefined && (!v[key] || typeof v[key] !== "object" || Array.isArray(v[key]))) return false;
  return v.workSessions === undefined || Array.isArray(v.workSessions);
}
export function decodeExecution(raw: string | null): ExecutionRecord {
  if (!raw) return emptyExecution();
  const value = JSON.parse(raw) as ExecutionRecord;
  if (!Number.isSafeInteger(value.version) || value.version < 0 || (value.snapshot !== null && !validSnapshot(value.snapshot))) throw new Error("実績データの確認が必要です");
  return value;
}
