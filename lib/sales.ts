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

// Coverage at the UNDERSTANDING level (2026-09-08, §10): how many of the 17
// phases actually have a purpose, an OK state, and a way to draw the
// information out. Counted from the content itself, not from masteryStatus —
// a phase is only covered when the field is non-empty. Kept deliberately
// separate from "使える": filling 17/17 is not the same as being able to run
// the conversation, and the two must never be shown as one number.
export interface PhaseCoverage {
  total: number;
  purpose: number;
  okState: number;
  means: number; // 確認事項 or 質問例 のどちらかが入っている
  productInfoRequired: number;
}

export function phaseCoverage(phases: SalesPhase[]): PhaseCoverage {
  const nonEmpty = (v: string | null) => v !== null && v.trim() !== "";
  return {
    total: phases.length,
    purpose: phases.filter((p) => nonEmpty(p.purpose) || nonEmpty(p.myUnderstanding)).length,
    okState: phases.filter((p) => nonEmpty(p.okState)).length,
    means: phases.filter((p) => p.checkPoints.length > 0 || p.sourceQuestions.length > 0 || p.myQuestions.length > 0)
      .length,
    productInfoRequired: phases.filter((p) => p.caseSpecificKnowledge.includes("PRODUCT_INFO_REQUIRED")).length,
  };
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
