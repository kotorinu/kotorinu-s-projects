import type { MasteryStatus, PhaseOwnVersion, RoleplayFeedback, SalesPhase } from "./types";

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
// 2026-09-08: the worksheet arrived, so ①基礎 is now filled for all 17 phases.
// That changes what "progress" means. Reading the worksheet is not the same as
// being able to run the conversation, so coverage is split in two and never
// added together:
//
//   基礎  = the worksheet's own content (given — 17/17 from the moment it was
//           transcribed; it measures nothing about the user)
//   自分版 = the user's own understanding and their own questions/talk
//           (the worksheet's 【ワーク】 sections) — this is the real progress
//
// A phase that needs product knowledge is counted separately again, so
// "できていない" and "まだ情報が無い" never blur together.
export interface PhaseCoverage {
  total: number;
  // 基礎（ワークシート由来）
  purpose: number;
  okState: number;
  means: number; // 確認事項 or 質問例
  // 自分版（本人が書く）
  myUnderstanding: number;
  myQuestions: number;
  productInfoRequired: number;
  /** 自分版が完成しているフェーズ数（理解＋自分の質問が両方ある） */
  ownVersionDone: number;
  /** 商品情報が要るフェーズを除いた、いま自分版を書けるフェーズ数 */
  ownVersionAchievable: number;
  ownFieldsFilled: number;
  ownFieldsTotal: number;
}

// --- 自分版の中身 (2026-09-08 §5) ---
//
// "自分版 0/11" on its own doesn't tell the user what would make it 1/11. A
// phase's own version is three specific fields, and the count is ALWAYS
// derived from whether they are filled — there is no counter anyone
// increments. The three are shown per phase as 2/3 etc. so the missing one is
// obvious.
export interface PhaseOwnState {
  phase: SalesPhase;
  purpose: string | null;
  okState: string | null;
  means: string | null;
  filled: number; // 0-3
  complete: boolean;
  needsProductInfo: boolean;
}

export const OWN_FIELD_LABEL = {
  purpose: "自分の言葉の目的",
  okState: "自分の言葉のOK状態",
  means: "自分の質問・引き出し方",
} as const;

export type OwnField = keyof typeof OWN_FIELD_LABEL;
export const OWN_FIELDS: OwnField[] = ["purpose", "okState", "means"];

const nonEmpty = (v: string | null | undefined) => v !== null && v !== undefined && v.trim() !== "";

/**
 * Resolves a phase's own version from the fixture plus whatever the user has
 * typed (stored as an overlay, since the fixture is immutable). Legacy
 * myUnderstanding/myQuestions still count, so nothing already recorded is
 * lost.
 */
export function phaseOwnState(
  phase: SalesPhase,
  overrides: Record<string, PhaseOwnVersion> = {}
): PhaseOwnState {
  const o = overrides[phase.id];
  const purpose = nonEmpty(o?.purpose) ? o!.purpose! : nonEmpty(phase.myUnderstanding) ? phase.myUnderstanding : null;
  const okState = nonEmpty(o?.okState) ? o!.okState! : null;
  const means = nonEmpty(o?.means)
    ? o!.means!
    : phase.myQuestions.length > 0
      ? phase.myQuestions.join("／")
      : phase.myTalkExamples.length > 0
        ? phase.myTalkExamples.join("／")
        : null;
  const filled = [purpose, okState, means].filter(nonEmpty).length;
  return {
    phase,
    purpose,
    okState,
    means,
    filled,
    complete: filled === OWN_FIELDS.length,
    needsProductInfo: phase.caseSpecificKnowledge.includes("PRODUCT_INFO_REQUIRED"),
  };
}

export function phaseCoverage(
  phases: SalesPhase[],
  ownOverrides: Record<string, PhaseOwnVersion> = {}
): PhaseCoverage {
  const needsProduct = (p: SalesPhase) => p.caseSpecificKnowledge.includes("PRODUCT_INFO_REQUIRED");
  const own = phases.map((p) => phaseOwnState(p, ownOverrides));
  const achievable = own.filter((s) => !s.needsProductInfo);
  return {
    total: phases.length,
    purpose: phases.filter((p) => nonEmpty(p.purpose)).length,
    okState: phases.filter((p) => p.okConditions.length > 0 || nonEmpty(p.okState)).length,
    means: phases.filter((p) => p.checkPoints.length > 0 || p.sourceQuestions.length > 0).length,
    myUnderstanding: own.filter((s) => nonEmpty(s.purpose)).length,
    myQuestions: own.filter((s) => nonEmpty(s.means)).length,
    productInfoRequired: phases.filter(needsProduct).length,
    ownVersionDone: achievable.filter((s) => s.complete).length,
    ownVersionAchievable: achievable.length,
    // Partial credit, so a phase with 2/3 doesn't read as zero progress.
    ownFieldsFilled: achievable.reduce((sum, s) => sum + s.filled, 0),
    ownFieldsTotal: achievable.length * OWN_FIELDS.length,
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
