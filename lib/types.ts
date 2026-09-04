export type Area = "営業代行" | "RIALA" | "GENESIS" | "その他";

export type TaskStatus = "未着手" | "進行中" | "待ち" | "完了" | "Archive";

export type AiStatus = "未着手" | "実行中" | "人間確認待ち" | "完了" | "Blocked";

export type Priority = "高" | "中" | "低";

// The OS's core execution classification. Every task is judged into exactly
// one of these — this is what decides whether "AIに任せる" can appear at all.
export type AiCapability =
  | "HUMAN" // 人間にしかできない
  | "AI_EXECUTE" // AIだけで完結可能
  | "AI_DRAFT" // AIが成果物を作り、人間が確認
  | "HYBRID" // AIが前処理し、人間が最終実行
  | "DECISION" // AIが案を作り、人間が意思決定
  | "BLOCKED"; // AIで可能だが、情報・権限不足

export interface Task {
  id: string;
  title: string;
  description: string;
  why: string;
  area: Area;
  deadline: string; // YYYY-MM-DD
  workDate: string | null; // YYYY-MM-DD
  estimateMinutes: number;
  actualMinutes: number | null;
  startedAt: string | null;
  completedAt: string | null;
  importance: Priority;
  urgency: Priority;
  aiCapability: AiCapability;
  aiStatus: AiStatus | null;
  blockedOn: string[] | null;
  status: TaskStatus;
  definitionOfDone: string[];
  steps: string[];
  overrunReason: string | null;
  nextImprovement: string | null;
  goalId: string | null;
  source: string;
  createdAt: string;
  updatedAt: string;
}

export type GoalStatus = "進行中" | "達成" | "一時停止" | "未達成";

export interface Goal {
  id: string;
  parentId: string | null;
  title: string;
  targetDate: string | null;
  desiredState: string;
  achievementCriteria: string;
  status: GoalStatus;
  createdAt: string;
  updatedAt: string;
}

export interface MonthEndState {
  monthKey: string; // YYYY-MM
  area: Area;
  state: string;
}

export type OutcomeStatus = "ACTIVE" | "PROVISIONAL" | "COMPLETE";

// An area-level outcome that recurring practice (not a dated Task) works
// toward — e.g. GENESIS's 60-day challenge. Deliberately separate from Goal:
// this is a standing behavior/practice target, not a point on the life timeline.
export interface Outcome {
  id: string;
  area: Area;
  title: string;
  desiredState: string;
  why: string;
  achievementCriteria: string[];
  status: OutcomeStatus;
}

export type RecurringFrequency = "DAILY";

export interface RecurringRule {
  id: string;
  title: string;
  frequency: RecurringFrequency;
  area: Area;
  estimateMinutes: number | null;
  aiCapability: AiCapability;
  description: string;
  definitionOfDone: string[];
  allowedMedium: string[];
  why: string;
  outcomeId: string | null;
  streakDays: number; // consecutive days completed before today
}

// One day's actual execution of a RecurringRule. Phase 1 defines the shape
// only — nothing persists it yet (no DB), so today's UI has no real history
// to read from here.
export interface DailyOccurrence {
  date: string; // YYYY-MM-DD
  recurringRuleId: string;
  status: TaskStatus;
  actualMinutes: number | null;
  completedAt: string | null;
  overrunReason: string | null;
  note: string | null;
}
