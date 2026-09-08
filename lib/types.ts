export type Area = "営業代行" | "RIALA" | "GENESIS" | "Skill Plus" | "その他";

// The areas that have an Area Home and appear as cards (2026-09-08).
// "Skill Plus" is deliberately absent: it is a time-limited learning source
// for 営業代行, not a strategic area of its own (§29). Its historical Tasks
// keep `area: "Skill Plus"` so nothing is rewritten, but it no longer
// presents as somewhere the user is heading.
export type HomeArea = "営業代行" | "RIALA" | "GENESIS";

// Where a Task sits relative to the plan being executed (2026-09-08, §2/§4).
//
// ACTIVE is a commitment: it MUST have a deadline, a workDate and a TimeBlock.
// "今日やるTaskなのに時間未定" is not allowed to exist — anything without a
// decided time is BACKLOG, and appears nowhere in TODAY / Week View / Day
// Detail. Everything else is a way of leaving the live plan without erasing
// what happened.
export type TaskLifecycle =
  | "ACTIVE" // 実行計画に入っている（deadline + workDate + TimeBlock 必須）
  | "BACKLOG" // やる意思はあるが実行日時が未定 — ACTIVE PLANには出さない
  | "SUPERSEDED" // 状況が変わり、別のTaskに置き換えられた
  | "MERGED" // 重複していたので別Taskへ統合した
  | "ARCHIVED" // 現役ではないが記録として残す
  | "DELETED"; // 誤登録。実績が一切ない場合のみ

export interface TaskLifecycleRecord {
  taskId: string;
  lifecycle: TaskLifecycle;
  reason: string;
  decidedOnDate: string;
  decidedAt: string;
  // Set for MERGED/SUPERSEDED — where the work actually lives now, so a Task
  // is never a dead end.
  replacedByTaskId: string | null;
}

// Why a Task is worth doing, at the grain that actually answers the question
// (2026-09-08, §13). A single "〜するため" sentence restates the title and
// tells the user nothing, so all three parts are required on an ACTIVE Task.
export interface TaskWhy {
  parentOutcome: string; // 何を達成するためか
  currentGap: string; // 現在なにが足りないのか
  whyNow: string; // なぜ今これをやる必要があるのか / 放置するとどうなるか
}

export type SourceType = "NOTION" | "PDF" | "VIDEO" | "APP" | "SPREADSHEET" | "SLIDE" | "OTHER";

// A real place the work is done or read from (2026-09-08, §17). Only URLs the
// user has actually given — never construct one that looks plausible. A
// Source with no confirmed URL still belongs here (url: null) so the user
// knows where to go, without the app pretending it can link there.
export interface SourceLink {
  label: string;
  url: string | null;
  sourceType: SourceType;
  purpose: string; // このTaskでこのSourceを何に使うのか
}

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
  // --- Task Series (2026-09-06) ---
  // A real split of one body of work into several independently-completable
  // Tasks (each with its own status/DoD/actualMinutes) — e.g. a book split
  // into per-session reading Tasks. Distinct from TimeBlock: a Task in a
  // Series is still "what to complete"; a TimeBlock is still "when to work
  // on it" (one Series-Task can itself span several TimeBlocks). Never
  // auto-split a Task into a Series without a real, already-confirmed basis
  // (e.g. Calendar-confirmed session dates) — see PRD.md's Task Series
  // section. null/null/null/null when a Task isn't part of any series.
  seriesId: string | null;
  seriesTitle: string | null; // the whole body of work's name, e.g. "『THE FORMAT』読了・実践化"
  sequenceNumber: number | null; // 1-based position within the series
  totalSteps: number | null; // how many Tasks make up the series
  // Reading-specific optional fields (§16) — only ever set from a real
  // confirmed page count/progress; never fabricated to make a book "feel"
  // trackable.
  totalPages: number | null;
  pageFrom: number | null;
  pageTo: number | null;
  currentPage: number | null;
  // What this Task needs in order to be executable (2026-09-08). Used to
  // decide whether it may go into the weekday lunch slot, which is phone-only.
  // null = not yet judged; a planner must not treat null as "anything goes".
  requiredEnvironment: ExecutionEnvironment | null;
  // 何をしている時間か（Areaとは独立）。null = 通常のArea作業。
  activityType: ActivityType | null;
  // --- Live plan membership + explanation (2026-09-08) ---
  lifecycle: TaskLifecycle;
  lifecycleReason: string | null; // required whenever lifecycle !== "ACTIVE"
  replacedByTaskId: string | null; // MERGED/SUPERSEDED → where the work went
  whyBreakdown: TaskWhy | null; // required on ACTIVE Tasks (§13/§14)
  sourceLinks: SourceLink[]; // only what this Task actually needs (§17)
  // Set when a Task cannot be finished because information the user doesn't
  // have yet is required (e.g. 商品固有の提案内容). Prevents "完成させた
  // ことにする" — the Task stays honest about what is missing.
  blockedOnInfo: string | null;
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
  // The date this Outcome has to be true by, when the user has committed to
  // one (2026-09-08). null when it is a standing target with no single date
  // (e.g. RIALA's AI-ops outcome) — never back-fill a date to make an Outcome
  // look scheduled. An Area can hold several Outcomes; the nearest-dated
  // ACTIVE one is the Area's current headline.
  deadline: string | null;
  // How far out this Outcome reaches. Lets a near-term Outcome (this week's
  // GENESIS target) coexist with a standing one without either overwriting
  // the other.
  horizon: "WEEK" | "SPRINT" | "STANDING";
}

// The standing description of an Area — what it is for and what long-term
// state it is heading toward (2026-09-08, §7). Distinct from Outcome: the
// Outcome is the dated thing being executed right now, this is the reason the
// Area exists at all. RIALA's "AI-firstで回せる状態" is the Goal here; the
// 9/11 migration deadline is the Outcome.
export interface AreaProfile {
  area: HomeArea;
  slug: string; // /area/<slug>
  purpose: string; // ① 何のためにこのAreaへ取り組んでいるか
  standingGoal: string; // ② 今どんな状態を目指しているか（長期）
  currentState: string; // ④ 何ができていて、何がまだできていないか
  masterLabel: string | null; // ⑦ Sales Master / Operations Master 等
  masterHref: string | null;
  knowledge: string[]; // ⑦ Master以外に参照するKnowledge
  sources: SourceLink[]; // ⑧ 実際の参照元
  blockers: string[]; // ⑨ 進まない理由・不足情報
  // ⑩ Outcome に即した進捗の見方。Task完了率と混同させないため、何を数えて
  // いるのかを言葉で持たせる。
  progressLabel: string;
}

// Google Calendar reflection state (2026-09-08, §27). The app still has no
// Calendar API write, and never claims otherwise: CONFIRMED requires a real
// calendarEventId. NEEDS_CALENDAR_SYNC is the honest middle state — the time
// is decided inside AI Work OS, but nothing has been written to Calendar yet.
export type CalendarSyncState = "NOT_NEEDED" | "NEEDS_CALENDAR_SYNC" | "CONFIRMED";

// GENESIS営業実践事前動画 (§12). The user has confirmed the count and total
// running time only — 12 videos, 268 minutes. Individual titles, durations
// and ordering have never been provided, so `videos` stays empty rather than
// being filled with invented entries; the count is displayed from
// totalVideos/totalMinutes. A watched video is only useful once its lesson is
// attached to a phase, so linkedPhaseIds/lesson are part of the record.
export interface SalesVideo {
  id: string;
  title: string;
  minutes: number | null;
  watched: boolean;
  linkedPhaseIds: string[];
  lesson: string | null;
  usagePoint: string | null;
}

export interface SalesVideoLibrary {
  label: string;
  totalVideos: number;
  totalMinutes: number;
  videos: SalesVideo[];
  note: string;
  // 2026-09-08: the user placed these explicitly as reference material, below
  // deciding their own approach. Recorded so no planner or UI can promote
  // them back into the critical path on its own.
  priority: string;
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
  // §28 originally said "1冊 = 1 Task, never 1冊 = 1 TimeBlock" — refined
  // 2026-09-06 by the Task Series section: a book with real confirmed
  // multi-session Calendar data is "1冊 = 1 Series (one Task per real
  // session)", not one Task per TimeBlock. taskId stays for a book that's
  // still a single Task; seriesId is set instead once it's been split.
  // Exactly one of the two is set, never both.
  taskId: string | null;
  seriesId: string | null;
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

// Where this block came from (2026-09-08, P0-2). GOOGLE_CALENDAR means
// "currently corresponds to an event in Google Calendar" — NOT "was confirmed
// against Calendar at some point in the past". A block may only claim
// GOOGLE_CALENDAR while it also carries a real calendarEventId; anything that
// was once Calendar-confirmed but no longer reflects the live plan is
// HISTORICAL_CALENDAR, and anything carried over from early fixture data with
// no confirmed origin is LEGACY_FIXTURE.
export type TimeBlockSource =
  | "USER" // 本人が直接この時間に決めた
  | "AI_WORK_OS" // このアプリが提案・生成した
  | "GOOGLE_CALENDAR" // 現在Google Calendarのイベントと対応している（calendarEventId必須）
  | "HISTORICAL_CALENDAR" // 過去にCalendarで確認したが、現在の計画ではない
  | "LEGACY_FIXTURE"; // 初期fixture由来。実データの裏付けが取れていない

// Whether this block is part of the plan being executed right now (P0-1).
// ACTIVE is the only lifecycle that TODAY / Day Detail / Week View / overlap
// detection may read. Superseded and historical blocks are kept — deleting
// them would erase history — but they must never be presented as the current
// plan, or the OS reports conflicts against schedules that no longer exist.
export type TimeBlockLifecycle =
  | "ACTIVE" // 現在の実行計画
  | "SUPERSEDED" // 後から計画が変わり、置き換えられた
  | "HISTORICAL"; // 過去日の記録（すでに実行済み/実行されなかった）

export type ExecutionEnvironment =
  | "MOBILE_ONLY" // スマホだけで完結する（昼休みスマホ枠で実行可能）
  | "PC_AVAILABLE" // PCが必要
  | "OUTSIDE" // 外出・移動中に行う
  | "ANY"; // 環境を選ばない

export interface TimeBlock {
  id: string;
  taskId: string | null;
  recurringRuleId: string | null;
  label: string; // display title — required even when taskId/recurringRuleId is set, for a quick Timeline label without a lookup
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  status: TimeBlockStatus;
  // Google Calendar PLANNED_WORK sync (2026-09-06). calendarSyncEnabled is
  // the user's own decision that this block is "worth putting on Calendar"
  // (§18: FIXED/DEADLINE/TRAVEL/BLOCKED already always belong there; a
  // PLANNED_WORK TimeBlock needs this explicit opt-in — never sync
  // everything by default). calendarEventId is set only once a sync has
  // actually happened (this app has no server-side OAuth yet — Phase 1
  // syncing is done by an operator with real Calendar access, e.g. via a
  // Claude session with a Calendar connector; never claim "synced" without
  // a real event id here).
  calendarSyncEnabled: boolean;
  calendarEventId: string | null;
  source: TimeBlockSource;
  // --- Live plan vs history (2026-09-08, P0-1) ---
  lifecycle: TimeBlockLifecycle;
  // Why this stopped being part of the live plan, in the user's terms.
  // Required whenever lifecycle !== "ACTIVE" so a removed block can always be
  // explained rather than just disappearing.
  supersededReason: string | null;
  supersededOn: string | null; // YYYY-MM-DD the decision was made
  // What can actually be done in this slot. A 12:00-13:00 lunch block on a
  // workday is MOBILE_ONLY: only Tasks whose requiredEnvironment is
  // MOBILE_ONLY or ANY may be placed there.
  executionEnvironment: ExecutionEnvironment;
}

// --- Day Rollover / Carryover (2026-09-06) ---
// What the user decided about a Task that was still incomplete at the end
// of a given day. Never "deleted" — a decision is a permanent historical
// record, kept even once the Task itself later completes or is dropped.
// MOVED_TODAY: re-placed onto the very next day (toDate = that day).
// RESCHEDULED: re-placed onto a specific later date the user picked.
// DROPPED: the user chose not to do it — recorded, not silently removed.
export type CarryoverDisposition = "MOVED_TODAY" | "RESCHEDULED" | "DROPPED";

export interface CarryoverRecord {
  taskId: string;
  fromDate: string; // the day the Task was left incomplete on
  disposition: CarryoverDisposition;
  toDate: string | null; // set for MOVED_TODAY/RESCHEDULED; null for DROPPED
  decidedAt: string; // ISO — when the user actually made this decision
}

// --- Execution Management (2026-09-06) ---
// A Task's completion is durable runtime state, not fixture data: the
// `tasks` array in dummy-data.ts is immutable (its `status` is always the
// originally-authored one), so "this Task is finished" has to live here.
// This is what makes an OVERDUE Task completable and makes it leave the
// overdue list afterwards — while still never rewriting history into
// "finished on time".
//
// deadlineAtCompletion is the deadline that actually applied at the moment
// of completion (a 期限再設定 may have moved it); originalDeadline is the
// Task's own authored deadline and is never overwritten. delayDays is
// derived from those two so "9/4締切を9/7に完了＝3日遅れ" survives.
export interface TaskCompletionRecord {
  taskId: string;
  completedAt: string; // ISO timestamp
  completedOnDate: string; // YYYY-MM-DD (the execution day it was completed on)
  originalDeadline: string | null; // the Task's authored deadline — never rewritten
  deadlineAtCompletion: string | null; // the effective deadline when it was completed
  delayDays: number | null; // >0 = completed after the deadline; null when there was no deadline
  // 達成基準を満たして完了 (true) vs 未達だが終了 (false). A false here must
  // never be presented as a clean completion.
  metDefinitionOfDone: boolean;
  estimateMinutes: number | null;
  actualMinutes: number | null;
  varianceMinutes: number | null;
}

// What the user decided about a Task that is not being completed now.
// BLOCKED: can't proceed (waiting on someone/something). DROPPED: 今回は
// やめる — recorded as a decision, never a silent delete.
export type TaskDisposition = "BLOCKED" | "DROPPED";

export interface TaskDispositionRecord {
  taskId: string;
  disposition: TaskDisposition;
  decidedOnDate: string;
  decidedAt: string; // ISO
  note: string | null;
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
  // The worksheet lists OK状態 as several tick-box conditions, not one
  // sentence (2026-09-08). Kept as a list so each condition can be read and
  // checked on its own; okState is their joined form for compact display.
  okConditions: string[];
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

// ============================================================
// Execution Control Tower (2026-09-08 第4ラウンド)
// ============================================================

// Where a piece of work sits on the way to an Outcome (§4).
// WAITING is deliberately distinct from BACKLOG: waiting means it cannot move
// because something outside the user is missing (product info, a reply, an
// external decision), and it must never be coloured as a failure.
export type GapStatus = "BACKLOG" | "READY" | "DOING" | "WAITING" | "DONE";

// Not everything between here and the Outcome is a Task. A missing skill, an
// unanswered question, a piece of knowledge not yet absorbed, an operation
// that isn't set up — these block the Outcome just as hard, and if the board
// only shows Tasks the real gap stays invisible.
export type GapKind =
  | "TASK" // 実行Taskそのもの
  | "CAPABILITY" // できるようになる必要がある能力
  | "PROBLEM" // 解決すべき問題
  | "LEARNING" // 理解・知識の不足
  | "OPERATION"; // 運用として回っていないもの

// Who moves this forward. RIALA is AI-first: work AI can do is shown as an AI
// operation, not as something queued on the user (§8).
export type GapOwner = "HUMAN" | "AI" | "AI_THEN_HUMAN" | "EXTERNAL";

export interface GapItem {
  id: string;
  area: HomeArea;
  kind: GapKind;
  status: GapStatus;
  title: string;
  /** 何が満たされたらDONEか。Taskと同じく判定できる形で書く。 */
  doneWhen: string;
  owner: GapOwner;
  /** Linked execution Task, when this gap is currently being worked as one. */
  taskId: string | null;
  /** Why it is WAITING — required for WAITING, so a blocked item explains itself. */
  waitingOn: string | null;
  /** Progress within the item, when it has countable parts (e.g. 17 phases). */
  progress: { done: number; total: number; unit: string } | null;
  /** Ordering within a column: lower first. */
  sortOrder: number;
  note: string | null;
}

// --- Session Runbook (§13) ---
// A long block ("19:00-21:30 営業") tells the user nothing about how to spend
// it. A runbook breaks it into 15-30 minute steps WITHOUT creating a swarm of
// Calendar events. Written per Task from its actual content — never a
// mechanical 15-minute split applied to everything.
export interface RunbookStep {
  id: string;
  startTime: string; // HH:mm
  endTime: string;
  label: string;
  /** What this step must produce before moving on. */
  outputs: string;
}

export interface SessionRunbook {
  timeBlockId: string;
  steps: RunbookStep[];
  note: string | null;
}

// --- Replan (§12) ---
export type ReplanReason =
  | "POSTPONED" // 予定を後ろへ動かした
  | "DEADLINE_AT_RISK" // このままでは期限に間に合わない見込み
  | "BLOCKED" // 進められない
  | "LARGE_OVERRUN" // 予定時間を大幅に超過した
  | "OUTCOME_CHANGED" // 上位Outcomeが変わった
  | "NEW_INFORMATION"; // 新しい情報が入った（商品レクチャー等）

export interface ReplanFlag {
  taskId: string;
  reason: ReplanReason;
  detail: string;
  raisedOnDate: string;
  raisedAt: string;
}

// --- Calendar sync state (§17) ---
// Four states, and the app never skips one. CALENDAR_CONFIRMED requires a real
// calendarEventId; there is no Calendar API write yet, so nothing reaches it
// and nothing pretends to.
export type TimeBlockSyncState =
  | "DRAFT" // OS内の下書き。まだ実行すると決めていない
  | "COMMITTED" // 実行すると決めた。Calendarにはまだ無い
  | "NEEDS_CALENDAR_SYNC" // Calendarへ反映が必要（新規・変更どちらも）
  | "CALENDAR_CONFIRMED"; // 実際のCalendarイベントと対応している

// --- Sales 自分版 (§5) ---
// The three fields that make a phase's own version complete. Stored per phase
// so "0/11" is always derived, never a counter someone increments.
export interface PhaseOwnVersion {
  purpose: string | null; // 自分の言葉での目的
  okState: string | null; // 自分の言葉でのOK状態
  means: string | null; // 自分の質問・引き出し方
}

// --- RIALA outcome milestones (§7) ---
// While the total number of people is unknown, progress is shown as the steps
// of the migration, not as an invented headcount.
export interface OutcomeMilestone {
  id: string;
  outcomeId: string;
  order: number;
  title: string;
  status: GapStatus;
  doneWhen: string;
  owner: GapOwner;
}

// A TimeBlock created by rescheduling inside the OS (§10). Carries everything
// needed to render it as a real block; the fixture block it replaces is left
// untouched and marked superseded separately.
export interface TimeBlockOverride {
  id: string;
  taskId: string;
  label: string;
  date: string;
  startTime: string;
  endTime: string;
  createdOnDate: string;
  createdAt: string;
  replacesBlockId: string | null;
  reason: string;
}

// What kind of time this is, independent of which Area it serves
// (2026-09-08 第5ラウンド, §5/§7). Reading for growth belongs to GENESIS —
// it is not its own Area — but it should still be recognisable as reading at
// a glance, and yellow on the Calendar. Keeping the two axes apart is what
// lets "何のための時間か" and "何をしている時間か" both survive.
export type ActivityType = "READING" | "OS" | "PLANNING" | "DEEP_WORK" | "OPERATION";

// 実行セッション (2026-09-09, P0-4).
//
// actualMinutes was a single start→finish span, so switching from Task A to
// Task B left A's span running and B's time leaked into A's total. Work is
// now a ledger of closed sessions: switching closes A's session before B's
// begins, and a Task's actual is the sum of its own sessions.
export type WorkSessionEndReason = "COMPLETE" | "SWITCH" | "RESCHEDULE" | "STOPPED";

export interface TaskWorkSession {
  id: string;
  taskId: string;
  startedAt: string; // ISO
  endedAt: string | null; // null = still running
  minutes: number | null; // filled when the session closes
  endReason: WorkSessionEndReason | null;
}

// GENESIS Capability Map (2026-09-09, P2-6/P16).
//
// Portable skills, tracked by evidence rather than a score. A completion
// percentage would say how many boxes were ticked, not whether the skill
// exists — so this holds only what can be pointed at: what was practised,
// what proves it, what is missing, what is next. Never invent a number.
export interface Capability {
  id: string;
  area: HomeArea;
  title: string;
  why: string;
  practices: string[];
  evidence: string[];
  currentGap: string;
  nextPractice: string;
  linkedRecurringRuleIds: string[];
  linkedTaskIds: string[];
}

// 気になっていること (2026-09-09, P5).
//
// These were plain strings, so "4件" was an opaque count — the user could see
// that something was in the way but not what, or where to go about it. Every
// blocker now says who it is waiting on and what it links to, and an
// un-navigable one at least carries its source.
export type BlockerType =
  | "WAITING_EXTERNAL" // 相手待ち
  | "MISSING_INFO" // 情報が足りない
  | "NEEDS_DECISION" // 決めれば動く
  | "RISK"; // まだ問題ではないが、放置すると問題になる

export interface Blocker {
  id: string;
  area: HomeArea;
  title: string;
  detail: string;
  type: BlockerType;
  owner: string;
  linkedGapId: string | null;
  linkedTaskId: string | null;
  linkedHref: string | null;
  source: string;
  status: "OPEN" | "RESOLVED";
}
