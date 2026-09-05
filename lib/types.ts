export type Area = "営業代行" | "RIALA" | "GENESIS" | "Skill Plus" | "その他";

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
  estimateMinutes: number | null; // null when no real duration has been confirmed yet — never invent one (see PRD.md §28)
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
  // --- Goal → Decompose → Execute → Measure → Improve (PRD.md §25) ---
  preparationForTaskId: string | null; // set → this Task IS prep for another Task, not the execution itself
  recommendedTiming: RecommendedTiming | null; // when a Preparation Task should be done
  contextTags: string[]; // "いつ・どの状況でやるか" — only tags that prevent hesitation at execution time
  varianceMinutes: number | null; // actualMinutes - estimateMinutes, once both are known
  variancePercent: number | null;
  varianceReason: VarianceReason | null; // a category, picked only on a large overrun — not a prompt for prose
  nextEstimateMinutes: number | null; // AI-suggested next estimate, once same-type history exists (Phase 1: always null, no history yet)
  workContext: WorkContextTag | null; // which Work Principles (§26) apply to this Task, if any
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
  // A Goal node can point at the Area's real detail instead of duplicating
  // it — an Outcome/Master already has the canonical content (RIALA's
  // achievementCriteria[], Sales Master's phases, etc). Never copy that
  // content onto the Goal; link to it.
  linkedUrl: string | null; // e.g. "/riala-master", "/sales-master"
  note: string | null;
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
  taskId: string | null; // the Actual Task tracking this book (§28 — "1冊 = 1 Task", never 1冊 = 1 TimeBlock)
  learningPoints: string[];
  personalExamples: string[];
  actionItems: string[];
}

// --- Execution OS: Goal → Decompose → Execute → Measure → Improve (2026-09-05, PRD.md §25) ---
// The basic loop every Task sits inside. "done/not done" alone isn't enough:
// what to achieve → what it breaks into → estimated/actual minutes → why
// they diverged → what changes next time. Phase 1 has no DB, so instances
// of DayPlan/WeeklyReview/ConsultationPrep/SpeedPracticeCheck below are not
// persisted or populated with real data yet — types only, ready for Phase 2.
// Never fabricate an instance to make a feature look "done."

export type RecommendedTiming =
  | "PREVIOUS_NIGHT" // 前日の夜
  | "EARLY_MORNING" // 朝一
  | "BEFORE_LEAVING" // 外出前
  | "BEFORE_MEETING" // 商談・会議前
  | "START_OF_TASK" // 実行の直前
  | "DURING_COMMUTE" // 移動中
  | "ANYTIME";

export type VarianceReason =
  | "UNDER_DECOMPOSED" // 分解不足
  | "MISSING_INFO" // 必要情報不足
  | "LOST_FOCUS" // 集中途切れ
  | "UNEXPECTED_WORK" // 想定外対応
  | "TECHNICAL_ISSUE" // 技術問題
  | "ESTIMATE_MISS" // Estimateミス（作業量過小評価）
  | "SCOPE_ADDED" // Task Scope追加
  | "AI_WAIT" // AI待ち（2026-09-05追加）
  | "INTERRUPTED" // 割り込み（2026-09-05追加）
  | "OTHER"; // その他（2026-09-05追加）

// A confirmed plan for one day, produced by Manager Mode the night before —
// "翌朝、TODAYを開けば何を・何時に・どこまでやるか決まっている" state.
// Once confirmedAt is set, Executor Mode (TODAY) doesn't re-decide priority;
// only a genuinely new circumstance triggers Replan (a new DayPlan/status).
export type DayPlanStatus = "DRAFT" | "CONFIRMED" | "SUPERSEDED";

export interface DayPlan {
  id: string;
  date: string; // YYYY-MM-DD — the day this plan is for
  successState: string | null; // 「明日の成功状態」
  topGoalId: string | null; // Goal or Outcome id this day serves most
  taskIds: string[]; // Next Actions, in execution order
  doNotList: string[]; // 「明日やらないこと」
  estimateTotalMinutes: number | null;
  bufferMinutes: number | null;
  status: DayPlanStatus;
  confirmedAt: string | null;
}

// Preparation before asking someone for help — replaces a bare "Slackで相談
// する" Task, which is not allowed on its own. Must specify what/why/whom/
// what answer is wanted before the Task counts as ready.
export type HelpType = "INFORMATION" | "ADVICE" | "DECISION" | "REVIEW" | "EXECUTION_HELP" | "SHARING_ONLY";

export interface ConsultationPrep {
  id: string;
  relatedTaskId: string | null;
  purpose: string;
  currentSituation: string;
  whatIKnow: string[];
  whatIDontKnow: string[];
  hypothesis: string | null;
  concern: string | null;
  helpType: HelpType;
  desiredAnswer: string;
  recipient: string | null;
  bestTiming: string | null;
  bestChannel: string | null;
  createdAt: string;
}

// The 7 checklist items the user has actually confirmed for weekly Speed
// Practice review. The book's "3つのすぐ" is referenced but its exact 3
// items were never confirmed in chat — do not invent names/definitions for
// it; this type holds only what's confirmed.
export interface SpeedPracticeCheck {
  weekKey: string;
  setGoal: boolean; // 目標を立てたか
  decomposed: boolean; // 分解したか
  measuredTime: boolean; // 時間を測ったか
  prepared: boolean; // 事前準備したか
  noHesitationAtExecution: boolean; // 実行時に迷わなかったか
  startedImmediately: boolean; // すぐ着手したか
  clarifiedHelpNeed: boolean; // Help Needを明確にしたか
}

// Weekly aggregate over Estimate/Actual. Every number here must come from
// real completed Tasks with real actualMinutes — with none yet recorded,
// no WeeklyReview instance should exist; never compute one from all-null
// data and present it as if it were real.
export interface WeeklyReview {
  id: string;
  weekKey: string;
  tasksCompleted: number;
  estimateTotalMinutes: number | null;
  actualTotalMinutes: number | null;
  avgVariancePercent: number | null;
  biggestOverruns: string[]; // Task ids
  underDecomposedTasks: string[]; // Task ids
  underPreparedTasks: string[]; // Task ids
  improvedTasks: string[]; // Task ids that got faster after a change
  helpNeedUsed: number;
  nextImprovements: string[]; // 1-3 items, never more
}

// --- TimeBlock — Task ≠ Time (2026-09-05, PRD.md §27; revised §28) ---
// Task = what to complete. TimeBlock = when to work on it. One Task can
// span several TimeBlocks; a TimeBlock moving doesn't change the Task's own
// definition of done. Schema is Google-Calendar-sync-ready (calendarEventId)
// even though no live sync exists yet — don't build that sync now.
//
// Not every Calendar block has a clear deliverable (§28): a TimeBlock can
// point at a Task, at a RecurringRule (a daily practice slot), or at
// neither — a purely descriptive block (meals, commute, sleep prep) that
// exists only to occupy time on the Timeline. Exactly one of
// taskId/recurringRuleId should be set, or neither; never both.
export type TimeBlockStatus = "PLANNED" | "IN_PROGRESS" | "DONE" | "SKIPPED";
export type TimeBlockSource = "AI_WORK_OS" | "GOOGLE_CALENDAR" | "USER";

export interface TimeBlock {
  id: string;
  taskId: string | null;
  recurringRuleId: string | null;
  label: string; // display title — required even when taskId/recurringRuleId is set, for a quick Timeline label without a lookup
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  status: TimeBlockStatus;
  calendarEventId: string | null;
  source: TimeBlockSource;
}

// --- Work Principles / 仕事の型 — Knowledge Layer (2026-09-05, PRD.md §26) ---
// Not a Task, not a Calendar Event: a small reusable "how to communicate/
// judge quality" reference. The point is that the user shouldn't have to
// remember these every time — a Task declares which communication context
// it's in (workContext), and the right Principles surface automatically in
// TaskDetailSheet. Never show every Principle on every Task.

export type WorkPrincipleId =
  | "PURPOSE_FIRST"
  | "CONCLUSION_FIRST"
  | "SHORT_SENTENCE"
  | "FACT_INTERPRETATION"
  | "HUMAN_INTERPRETATION"
  | "QUALITY_BAR";

// A confirmed Principle. `options` holds named categories/levels the
// Principle itself defines (e.g. PURPOSE_FIRST's 5 purposeTypes, QUALITY_BAR's
// 3 levels) — [] when the Principle doesn't have named sub-categories.
// `caveat` carries an explicit "don't over-formalize this" note the user
// gave for that Principle, verbatim; never invent one where none was given.
export interface WorkPrinciple {
  id: WorkPrincipleId;
  title: string;
  summary: string;
  guidance: string[];
  options: string[];
  examples: string[];
  caveat: string | null;
}

// The confirmed Task-context → Principle-set mappings (PRD.md §26). Help
// Need Workflow (ConsultationPrep, §25) is a separate existing concept, not
// a WorkPrinciple — usesHelpNeed just says this context should also surface
// that reference, without duplicating it as a fake 7th principle.
export type WorkContextTag =
  | "SLACK_CONSULTATION" // Slack相談
  | "RIALA_ANNOUNCEMENT" // RIALA告知文
  | "SALES_FEEDBACK_CONSULTATION" // 営業FB相談
  | "REFLECTION" // 振り返り
  | "KEY_DELIVERABLE"; // 重要成果物

export interface WorkContextMapping {
  principleIds: WorkPrincipleId[];
  usesHelpNeed: boolean;
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
  // --- Recurring content workflow extensions (2026-09-05). Optional because
  // only a genuinely recurring content workflow (e.g. RIALA Daily Learning
  // Share) populates these — every other Workflow leaves them undefined
  // rather than being forced to declare empty values.
  postStructure?: string[]; // HOOK→状況→おすすめ→理由→印象→URL→CTA、など投稿の型（毎回同文にはしない）
  ctaTypes?: DailyLearningCtaType[];
  schedulingCapability?: SchedulingCapability; // 実際に自動投稿できるかどうかを、外部権限確認前は絶対に過大表示しない
  contentPoolCount?: number | null; // 参照するコンテンツ総数（個別タイトル・URLは未取得なら架空生成しない）
  contentPoolNote?: string | null;
}

export type DailyLearningCtaType = "READ" | "COMMENT" | "SHARE_EXPERIENCE" | "TRY_TODAY";

// How far this app can currently take a scheduled/automated post. Never
// display AUTO_SCHEDULE_AVAILABLE until an actual external API/permission is
// confirmed working — see PRD.md's Daily Learning Share section.
export type SchedulingCapability = "UNAVAILABLE" | "DRAFT_ONLY" | "HUMAN_APPROVAL" | "AUTO_SCHEDULE_AVAILABLE";

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

// --- Problem Decomposition / 問い切りと統合 — Knowledge Layer (2026-09-05) ---
// A Training/Knowledge reference, like WorkPrinciple above — never a Task,
// never a Calendar Event. Loosely related to GENESIS's 具体⇄抽象トレーニング
// (RecurringRule r-001) and to GENESIS合宿's Leadership Training, but never
// turned into a mandatory confirmed Task ("合宿で必ずこの方法を使う" is
// explicitly NOT a rule). The 5 perspectives are lenses to reach for when
// decomposing a problem, not a fixed 5-question checklist to run every time.

export type DecompositionPerspectiveId = "DEFINITION" | "CURRENT_STATE" | "GAP" | "METHOD" | "PRIORITY";

export interface DecompositionPerspective {
  id: DecompositionPerspectiveId;
  label: string;
  question: string;
}

export type DecompositionTypeId = "PROCESS" | "ISSUE";

export interface DecompositionTypeExample {
  id: DecompositionTypeId;
  title: string;
  description: string;
  example: string[];
}

export interface ProblemDecompositionKnowledge {
  id: string;
  title: string;
  purpose: string;
  flow: string[]; // GOAL→FACT→GAP→CENTRAL QUESTION→DECOMPOSE→ASSIGN→SYNTHESIZE→PRIORITIZE→ACTION
  loopPrinciple: string; // 「一発で完全分解しない」の原則
  perspectives: DecompositionPerspective[];
  synthesisCategories: string[]; // FACT / CONSTRAINT / OPTION / UNKNOWN
  qualityBarQuestion: string; // 良いSub Questionの基準
  goodExampleQuestions: string[];
  badExampleQuestions: string[];
  decompositionTypes: DecompositionTypeExample[];
  relatedRecurringRuleId: string | null;
  relatedGoalId: string | null;
  caveat: string | null;
}
