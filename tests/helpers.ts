import type { TaskStateOverlays } from "../lib/taskState";
import type {
  Task,
  TaskCompletionRecord,
  TaskDisposition,
  TaskDispositionRecord,
  TimeBlock,
} from "../lib/types";

/** No user decisions recorded yet — the baseline every test starts from. */
export function noOverlays(): TaskStateOverlays {
  return {
    completions: {},
    dispositions: {},
    deadlineOverrides: {},
    workDateOverrides: {},
    lifecycleOverrides: {},
  };
}

/** A Task with only the fields a scheduling test cares about. */
export function makeTask(over: Partial<Task> & Pick<Task, "id" | "title" | "area">): Task {
  return {
    description: "",
    why: "",
    deadline: null,
    workDate: null,
    estimateMinutes: null,
    actualMinutes: null,
    startedAt: null,
    completedAt: null,
    importance: "中",
    urgency: "中",
    aiCapability: "HUMAN_ONLY",
    aiStatus: null,
    blockedOn: null,
    status: "未着手",
    lifecycle: "ACTIVE",
    definitionOfDone: [],
    steps: [],
    overrunReason: null,
    nextImprovement: null,
    goalId: null,
    outcomeId: null,
    outputType: null,
    outputDestination: null,
    deliveryChannel: null,
    deliveryStatus: null,
    automationCandidate: false,
    automationType: null,
    linkedSalesMaster: false,
    parentOperationId: null,
    workflowId: null,
    requiredInputs: [],
    notes: null,
    preparationForTaskId: null,
    recommendedTiming: null,
    contextTags: [],
    varianceMinutes: null,
    variancePercent: null,
    ...(over as Partial<Task>),
  } as Task;
}

/** A completion record with every field the type demands. */
export function completion(taskId: string, onDate: string, met = true): TaskCompletionRecord {
  return {
    taskId,
    completedAt: `${onDate}T21:10:00+09:00`,
    completedOnDate: onDate,
    originalDeadline: null,
    deadlineAtCompletion: null,
    delayDays: null,
    metDefinitionOfDone: met,
    estimateMinutes: null,
    actualMinutes: null,
    varianceMinutes: null,
  };
}

export function disposition(
  taskId: string,
  d: TaskDisposition,
  onDate: string,
  note: string | null = null
): TaskDispositionRecord {
  return { taskId, disposition: d, decidedOnDate: onDate, decidedAt: `${onDate}T22:00:00+09:00`, note };
}

export function makeBlock(
  over: Partial<TimeBlock> & Pick<TimeBlock, "id" | "date" | "startTime" | "endTime">
): TimeBlock {
  return {
    taskId: null,
    recurringRuleId: null,
    label: "",
    status: "PLANNED",
    calendarSyncEnabled: false,
    calendarEventId: null,
    source: "AI_WORK_OS",
    lifecycle: "ACTIVE",
    supersededReason: null,
    supersededOn: null,
    executionEnvironment: "ANY",
    ...(over as Partial<TimeBlock>),
  } as TimeBlock;
}
