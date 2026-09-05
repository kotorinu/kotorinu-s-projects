import type { VarianceReason } from "./types";

// Estimate vs Actual (PRD.md §25/§29). Never compute a percent against a
// null estimate — that would fabricate precision that doesn't exist.
export function computeVariance(
  estimateMinutes: number | null,
  actualMinutes: number
): { varianceMinutes: number | null; variancePercent: number | null } {
  if (estimateMinutes === null) return { varianceMinutes: null, variancePercent: null };
  const varianceMinutes = actualMinutes - estimateMinutes;
  const variancePercent = Math.round((varianceMinutes / estimateMinutes) * 100);
  return { varianceMinutes, variancePercent };
}

export const VARIANCE_REASONS: VarianceReason[] = [
  "UNEXPECTED_WORK",
  "MISSING_INFO",
  "AI_WAIT",
  "LOST_FOCUS",
  "ESTIMATE_MISS",
  "INTERRUPTED",
  "UNDER_DECOMPOSED",
  "TECHNICAL_ISSUE",
  "SCOPE_ADDED",
  "OTHER",
];

export const varianceReasonLabel: Record<VarianceReason, string> = {
  UNEXPECTED_WORK: "想定外の確認",
  MISSING_INFO: "情報不足",
  AI_WAIT: "AI待ち",
  LOST_FOCUS: "集中切れ",
  ESTIMATE_MISS: "作業量過小評価",
  INTERRUPTED: "割り込み",
  UNDER_DECOMPOSED: "分解不足",
  TECHNICAL_ISSUE: "技術的な問題",
  SCOPE_ADDED: "Task範囲の追加",
  OTHER: "その他",
};
