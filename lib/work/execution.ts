import { validDayReview } from "../calendarReview";
import { validGoalReview } from "../goalReview";
import { validSaleRecord } from "../salesProgress";
export interface ExecutionRecord { version: number; snapshot: Record<string, unknown> | null; updatedAt: string | null }
export interface ExecutionAcknowledgement { version: number; serialized: string }
export function executionReadDecision(local: string, acknowledged: ExecutionAcknowledgement | null, remoteVersion: number): "CENTRAL"|"DEVICE"|"CONFLICT" {
  if(!acknowledged || acknowledged.serialized===local)return "CENTRAL";
  return acknowledged.version===remoteVersion?"DEVICE":"CONFLICT";
}
export function closedExecutionTaskIds(snapshot: Record<string, unknown> | null): string[] {
  const records = (key:string):[string,unknown][] => {
    const value=snapshot?.[key];return value && typeof value==="object" && !Array.isArray(value)?Object.entries(value):[];
  };
  const field=(value:unknown,key:string)=>value && typeof value==="object"?(value as Record<string,unknown>)[key]:null;
  return [...new Set([...records("completions").map(([id])=>id),...records("dispositions").filter(([,v])=>field(v,"disposition")==="DROPPED").map(([id])=>id),...records("lifecycleOverrides").filter(([,v])=>["ARCHIVED","DELETED","SUPERSEDED","MERGED"].includes(String(field(v,"lifecycle")))).map(([id])=>id)])];
}
export const emptyExecution = (): ExecutionRecord => ({ version: 0, snapshot: null, updatedAt: null });
export function validSnapshot(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.currentDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v.currentDate)) return false;
  for (const key of ["done", "recurringDone", "manualActualTaskIds", "supersededBlockIds"])
    if (v[key] !== undefined && (!Array.isArray(v[key]) || !(v[key] as unknown[]).every(x => typeof x === "string"))) return false;
  for (const key of ["taskStartedAt", "taskCompletedAt", "taskActualMinutes", "varianceReasonByTaskId"])
    if (v[key] !== undefined && (!Array.isArray(v[key]) || !(v[key] as unknown[]).every(x => Array.isArray(x) && x.length === 2 && typeof x[0] === "string" && (typeof x[1] === "string" || typeof x[1] === "number")))) return false;
  for (const key of ["history", "carryover", "workDateOverrides", "calendarSyncOverrides", "completions", "dispositions", "deadlineOverrides", "lifecycleOverrides", "nextEstimates", "calendarReviews", "goalReviews", "salesRecords", "phaseOwnVersions", "replanFlags", "timeBlockOverrides"])
    if (v[key] !== undefined && (!v[key] || typeof v[key] !== "object" || Array.isArray(v[key]))) return false;
  if (v.calendarReviews !== undefined && !Object.entries(v.calendarReviews as Record<string, unknown>).every(([date, review]) => validDayReview(review) && review.date === date)) return false;
  if (v.goalReviews !== undefined && !Object.entries(v.goalReviews as Record<string, unknown>).every(([id, review]) => validGoalReview(review) && review.goalId === id)) return false;
  if (v.salesRecords !== undefined && !Object.entries(v.salesRecords as Record<string, unknown>).every(([id, r]) => validSaleRecord(r) && r.id === id)) return false;
  if (v.salesCloseRate !== undefined && v.salesCloseRate !== null && !(typeof v.salesCloseRate === "number" && v.salesCloseRate > 0 && v.salesCloseRate <= 1)) return false;
  if (v.declaration !== undefined && v.declaration !== null) {
    const d = v.declaration as Record<string, unknown>;
    if (typeof d !== "object" || typeof d.text !== "string" || d.text.length > 5000 || typeof d.updatedAt !== "string") return false;
  }
  return v.workSessions === undefined || Array.isArray(v.workSessions);
}
export function decodeExecution(raw: string | null): ExecutionRecord {
  if (!raw) return emptyExecution();
  const value = JSON.parse(raw) as ExecutionRecord;
  if (!Number.isSafeInteger(value.version) || value.version < 0 || (value.snapshot !== null && !validSnapshot(value.snapshot))) throw new Error("実績データの確認が必要です");
  return value;
}
