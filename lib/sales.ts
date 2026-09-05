import type { MasteryStatus, RoleplayFeedback, SalesPhase } from "./types";

export const MASTERY_ORDER: MasteryStatus[] = [
  "NOT_STARTED",
  "UNDERSTANDING",
  "FILLED",
  "PRACTICING",
  "FEEDBACK_RECEIVED",
  "USABLE",
];

export function masteryStatusLabel(status: MasteryStatus): string {
  switch (status) {
    case "UNDERSTANDING":
      return "理解中";
    case "FILLED":
      return "入力済";
    case "PRACTICING":
      return "練習中";
    case "FEEDBACK_RECEIVED":
      return "FB済";
    case "USABLE":
      return "実践可能";
    default:
      return "未着手";
  }
}

function atLeast(status: MasteryStatus, target: MasteryStatus): boolean {
  return MASTERY_ORDER.indexOf(status) >= MASTERY_ORDER.indexOf(target);
}

export function feedbackForPhase<T extends { relatedPhaseIds: string[] }>(list: T[], phaseId: string): T[] {
  return list.filter((item) => item.relatedPhaseIds.includes(phaseId));
}

export interface SprintProgress {
  structureCoverage: { done: number; total: number };
  practiceCoverage: { done: number; total: number };
  roleplayDone: boolean;
  selfFeedbackDone: boolean;
}

export function computeSprintProgress(phases: SalesPhase[], roleplayFeedback: RoleplayFeedback[]): SprintProgress {
  const total = phases.length;
  const structureDone = phases.filter((p) => atLeast(p.masteryStatus, "FILLED")).length;
  const practiceDone = phases.filter((p) => atLeast(p.masteryStatus, "PRACTICING")).length;
  return {
    structureCoverage: { done: structureDone, total },
    practiceCoverage: { done: practiceDone, total },
    roleplayDone: roleplayFeedback.length > 0,
    selfFeedbackDone: roleplayFeedback.some((r) => r.goodPoints.length > 0 || r.issues.length > 0),
  };
}
