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

// A Task's finished output, when it produces one. RIALA-shaped for now but
// deliberately on the shared Task type — any area's tasks can use it.
export type OutputType = "MESSAGE_DRAFT" | "EVENT_REMINDER" | "MEMBER_STATUS_LIST" | "OPERATION_DOC" | "OTHER";

export type DeliveryChannel = "RIALA App" | "DM" | "Slack" | "Email" | "Other";

// DRAFT: being worked on. READY_TO_SEND: a human could send this as-is.
// SCHEDULED/SENT: future states once real delivery exists (Phase 1: mock
// only). BLOCKED: AI could produce this but required input is missing.
export type DeliveryStatus = "DRAFT" | "READY_TO_SEND" | "SCHEDULED" | "SENT" | "BLOCKED";

export type AutomationType = "SCHEDULED_POST" | "AUTO_MESSAGE" | "REMINDER_GENERATION" | "STATUS_CLASSIFICATION" | "NONE";

export interface Task {
  id: string;
  title: string;
  description: string;
  why: string;
  area: Area;
  deadline: string | null; // YYYY-MM-DD — null when genuinely unscheduled (see PRD.md 22)
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
  goalId: string | null; // life-timeline Goal (GOAL TREE)
  outcomeId: string | null; // area-level Outcome (e.g. RIALA's AI-ops outcome)
  outputType: OutputType | null;
  outputDestination: string | null;
  deliveryChannel: DeliveryChannel | null;
  deliveryStatus: DeliveryStatus | null;
  automationCandidate: boolean;
  automationType: AutomationType | null;
  linkedSalesMaster: boolean; // true → TaskDetailSheet offers "＞ 営業Masterを見る"
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

// --- Sales Master (営業プレイブック) ---
// USABLE requires spoken practice/roleplay evidence, not just filled text —
// see PRD-adjacent instructions; never set by "text exists" alone.
export type MasteryStatus = "NOT_STARTED" | "UNDERSTANDING" | "FILLED" | "PRACTICING" | "FEEDBACK_RECEIVED" | "USABLE";

// The 17 phases and their order/names are fixed by the user's own worksheet
// — never reorder or rename them. purpose/okState/checkPoints/sourceQuestions/
// ngExamples are the worksheet's own content (①基礎) and must come from that
// source, never be invented; they are empty until the worksheet is provided.
export interface SalesPhase {
  id: string;
  phaseNumber: number;
  title: string;
  purpose: string | null;
  okState: string | null;
  checkPoints: string[];
  sourceQuestions: string[];
  ngExamples: string[];
  myUnderstanding: string | null;
  myTalkExamples: string[];
  myQuestions: string[];
  myTransitionTalk: string[];
  caseSpecificKnowledge: string[];
  nextImprovement: string[];
  improvementHistory: string[];
  masteryStatus: MasteryStatus;
}

// A lesson from someone more experienced, mapped onto whichever phases it
// applies to. One PractitionerFeedback can and often does apply to several.
export interface PractitionerFeedback {
  id: string;
  title: string;
  content: string;
  source: string;
  relatedPhaseIds: string[];
  lesson: string;
  exampleTalk: string[];
  addedAt: string;
}

export interface RoleplayFeedback {
  id: string;
  date: string | null;
  relatedPhaseIds: string[];
  goodPoints: string[];
  issues: string[];
  stuckPoints: string[];
  nextImprovements: string[];
  feedbackFrom: string | null;
  recordingReference: string | null;
  transcriptReference: string | null;
}

export interface LiveSalesFeedback {
  id: string;
  date: string | null;
  result: string | null;
  relatedPhaseIds: string[];
  customerSituation: string | null;
  whatHappened: string | null;
  goodPoints: string[];
  issues: string[];
  objections: string[];
  nextImprovement: string[];
  recordingReference: string | null;
  transcriptReference: string | null;
}

export interface SalesSprintDeliverable {
  title: string;
  definitionOfDone: string[];
}

// A near-term checkpoint (not a completion deadline) for the Sales Master —
// e.g. "show up to Wednesday's feedback session with a v1 draft and one
// roleplay done," not "finish all 17 phases."
export interface SalesSprint {
  id: string;
  goal: string;
  checkpointLabel: string;
  checkpointDate: string | null;
  deliverables: SalesSprintDeliverable[];
}
