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
  parentOperationId: string | null; // OperationCategory (RIALA Operations Master, LEVEL 1)
  workflowId: string | null; // Workflow this was generated from (LEVEL 2), if any
  requiredInputs: string[]; // what had to be known/true before this could exist
  notes: string | null;
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

// --- Calendar Source of Truth (2026-09-05 rule) ---
// Google Calendar is not treated as uniformly "possibly stale." Confidence
// depends on the kind of entry — see PRD.md §24. USER_CONFIRMED is highest;
// CALENDAR_ONLY/NEEDS_CONFIRMATION are the floor and must never be promoted
// to a Task/Goal fact on inference alone.
export type CalendarConfidence =
  | "USER_CONFIRMED" // Priority 1: user explicitly said "this is decided"
  | "FIXED_ALL_DAY_EVENT" // Priority 2: all-day event = constraint, unless it's clearly a memo/placeholder
  | "CONFIRMED_WEEKLY_READING" // Priority 3: the 60-day challenge's weekly book list
  | "TIMED_EXECUTION_BLOCK" // Priority 4: a normal timed block — an execution plan, not a fixed fact
  | "CONFIRMED_FIXED_EVENT" // a specific timed appointment confirmed on Calendar
  | "CALENDAR_ONLY" // on Calendar but not elevated to any tier above
  | "NEEDS_CONFIRMATION"; // ambiguous — must not be treated as fact until confirmed

// What a fixed period should prevent from being auto-scheduled onto it.
// BLOCK_NORMAL_WORK: don't place the usual work volume in this window.
// NO_HEAVY_WORK: lighter-touch only (e.g. travel). BLOCK_TIME: don't place
// anything in this specific time range.
export type PlanningConstraint = "BLOCK_NORMAL_WORK" | "NO_HEAVY_WORK" | "BLOCK_TIME" | null;

export type FixedEventType = "MILESTONE" | "TRAVEL" | "FIXED_APPOINTMENT";

// A period or moment sourced from Google Calendar that this app treats as a
// hard constraint rather than a movable execution-plan block. Never invent
// one — only what the user has explicitly confirmed on Calendar belongs here.
//
// Display rule (2026-09-05): TASK MAP is not the home for these — it shows
// Task/Outcome progress first. An ordinary fixed event (e.g. a personal
// appointment, relatedOutcomeId: null) doesn't appear on TASK MAP at all;
// at most it's part of a collapsed "this month's fixed schedule" count.
// Only an event that actually bears on a Goal/Outcome's execution
// (relatedOutcomeId set) gets contextual display, and that's on the
// Outcome/Goal side, not TASK MAP.
export interface FixedCalendarEvent {
  id: string;
  title: string;
  type: FixedEventType;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD — same as startDate for a single day
  startTime: string | null; // HH:mm, null for all-day
  endTime: string | null;
  confidence: CalendarConfidence;
  planningConstraint: PlanningConstraint;
  relatedOutcomeId: string | null; // set only when this event bears on that Outcome's execution
  notes: string | null;
}

export type WeeklyReadingStatus = "CONFIRMED" | "IN_PROGRESS" | "DONE";

// The 60-day challenge's "read one book a week" practice. The book list
// itself is CONFIRMED per the user's own rule ("本に関しては確定でいい") —
// never demote it to CALENDAR_ONLY/NEEDS_CONFIRMATION. targetDate/
// calendarEventIds stay null/[] until actual Calendar data is read (Phase 3);
// the title list here may itself be incomplete — the user gave examples, not
// a closed list, so do not invent additional titles.
export interface WeeklyReading {
  id: string;
  bookTitle: string;
  targetDate: string | null;
  calendarEventIds: string[];
  status: WeeklyReadingStatus;
  outcomeId: string | null;
  learningPoints: string[];
  personalExamples: string[];
  actionItems: string[];
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

// --- RIALA Operations Master (3-layer model) ---
// LEVEL 1: "what operations exist" (never invented/added without the user
// naming them). LEVEL 2 (Workflow): "how that operation is processed when it
// occurs" — a template, not a scheduled task. LEVEL 3 (Task, via
// parentOperationId/workflowId): "what to actually do, by when" — TASK MAP
// only ever shows LEVEL 3, and only when currentStatus is ACTIVE.
export interface OperationCategory {
  id: string;
  categoryNumber: number;
  area: Area;
  title: string;
  purpose: string;
}

export interface Workflow {
  id: string;
  categoryId: string;
  title: string;
  description: string;
  steps: string[];
  aiCapability: AiCapability;
  outputType: OutputType | null;
  requiredInputs: string[];
}

// Never set ACTIVE or DONE on inference alone — ACTIVE needs a concrete
// current subject (an actual event/member/thread), DONE needs evidence the
// completion condition is met *now*, not just that something happened once.
export type AuditStatus = "ACTIVE" | "DONE" | "NOT_NEEDED_NOW" | "UNKNOWN" | "BLOCKED";

export interface OperationalAudit {
  id: string;
  categoryId: string;
  title: string;
  currentStatus: AuditStatus;
  evidence: string | null;
  requiredAction: string | null;
  missingInputs: string[];
  actualTaskId: string | null;
  notes: string | null;
}

export type AutomationStatus = "CANDIDATE" | "CONFIRMED" | "NOT_APPLICABLE";

// A candidate handoff mapping, not a confirmed one — see automationStatus.
export interface AiOperationMatrixEntry {
  id: string;
  operation: string;
  categoryId: string;
  frequency: string | null;
  trigger: string | null;
  requiredInputs: string[];
  aiCapability: AiCapability;
  aiProcess: string[];
  humanAction: string[];
  outputType: OutputType | null;
  outputDestination: string | null;
  completionCondition: string | null;
  automationStatus: AutomationStatus;
  missingInputs: string[];
}
