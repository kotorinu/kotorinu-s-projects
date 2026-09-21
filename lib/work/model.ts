import { tasks as initialTasks, goals as initialGoals } from "../dummy-data";
import type { Task, Goal } from "../types";

export interface WorkRun {
  id: string; taskId: string; status: "QUEUED" | "RUNNING" | "REVIEW" | "BLOCKED" | "ACCEPTED";
  claim: string | null; leaseUntil: string | null; provider: string | null;
  output: string | null; evidence: string[]; blocker: string | null;
  createdAt: string; updatedAt: string;
}
export interface WorkLedger {
  schemaVersion: 1; version: number; tasks: Task[]; goals: Goal[]; runs: WorkRun[];
  audit: { at: string; operation: string; id: string }[];
  requests?: Record<string, { fingerprint: string; entityId: string }>;
}
export const initialLedger = (): WorkLedger => ({ schemaVersion: 1, version: 0,
  tasks: structuredClone(initialTasks), goals: structuredClone(initialGoals),
  runs: initialTasks.filter(t => ["AI_EXECUTE", "AI_DRAFT"].includes(t.aiCapability) && t.status !== "完了" && t.status !== "Archive" && !["ARCHIVED", "DELETED", "SUPERSEDED", "MERGED"].includes(t.lifecycle))
    .map(t => ({ id: `${t.id}:run`, taskId: t.id, status: t.aiStatus === "Blocked" ? "BLOCKED" as const : "QUEUED" as const,
      claim: null, leaseUntil: null, provider: null, output: null, evidence: [], blocker: t.blockedOnInfo,
      createdAt: t.createdAt, updatedAt: t.updatedAt })), audit: [] });
export class WorkConflict extends Error {}
export class WorkInputError extends Error {}
export function decodeWork(raw: string | null): WorkLedger {
  if (!raw) return initialLedger();
  const value = JSON.parse(raw) as WorkLedger;
  if (value.schemaVersion !== 1 || !Number.isSafeInteger(value.version) || value.version < 0 ||
    !Array.isArray(value.tasks) || !Array.isArray(value.goals) || !Array.isArray(value.runs) || !Array.isArray(value.audit) ||
    new Set(value.tasks.map(t => t.id)).size !== value.tasks.length || new Set(value.goals.map(g => g.id)).size !== value.goals.length)
    throw new Error("中央データの確認が必要です");
  return value;
}
export function text(value: unknown, max = 1000): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new WorkInputError("入力を確認してください");
  return value.trim();
}
export function ymd(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw new WorkInputError("日付を確認してください");
  return value;
}
export function createTask(input: Record<string, unknown>, id: string, now: string): Task {
  const title = text(input.title, 200);
  const area = input.area ?? "その他";
  if (!["営業代行", "RIALA", "GENESIS", "Skill Plus", "その他"].includes(String(area))) throw new WorkInputError("Areaを確認してください");
  const aiCapability = input.aiCapability ?? "HUMAN";
  if (!["HUMAN", "AI_EXECUTE", "AI_DRAFT", "HYBRID", "DECISION", "BLOCKED"].includes(String(aiCapability))) throw new WorkInputError("担当を確認してください");
  const estimate = input.estimateMinutes ?? null;
  if (estimate !== null && (typeof estimate !== "number" || !Number.isInteger(estimate) || estimate < 1 || estimate > 1440)) throw new WorkInputError("所要時間を確認してください");
  const dod = Array.isArray(input.definitionOfDone) ? input.definitionOfDone.map(x => text(x, 500)) : [];
  if (dod.length > 20) throw new WorkInputError("完了条件が多すぎます");
  return { id, title, area: area as Task["area"], description: typeof input.description === "string" ? text(input.description, 6000) : "",
    why: "", deadline: ymd(input.deadline), workDate: null, estimateMinutes: estimate as number | null,
    actualMinutes: null, startedAt: null, completedAt: null, importance: "中", urgency: "中",
    aiCapability: aiCapability as Task["aiCapability"], aiStatus: aiCapability === "HUMAN" ? null : "未着手", blockedOn: null,
    status: "未着手", definitionOfDone: dod, steps: [], overrunReason: null, nextImprovement: null,
    goalId: typeof input.goalId === "string" ? input.goalId : null, outcomeId: null, outputType: null, outputDestination: null,
    deliveryChannel: null, deliveryStatus: null, automationCandidate: false, automationType: null,
    linkedSalesMaster: false, parentOperationId: null, workflowId: null, requiredInputs: [], notes: null,
    preparationForTaskId: null, recommendedTiming: null, contextTags: [], varianceMinutes: null, estimateGroupId: null,
    variancePercent: null, varianceReason: null, nextEstimateMinutes: null, workContext: null,
    seriesId: null, seriesTitle: null, sequenceNumber: null, totalSteps: null, totalPages: null, pageFrom: null,
    pageTo: null, currentPage: null, requiredEnvironment: null, activityType: null, lifecycle: "BACKLOG",
    lifecycleReason: "実行日時は未設定", replacedByTaskId: null, whyBreakdown: null, sourceLinks: [], blockedOnInfo: null,
    source: "USER", createdAt: now, updatedAt: now };
}

/** Pure transaction. IDs and time are supplied by the caller, never generated during a CAS retry. */
export function mutateWork(l: WorkLedger, body: Record<string, unknown>, now: string, id: string, finishedTaskIds: string[] = []) {
  const requestId = typeof body.requestId === "string" ? text(body.requestId, 100) : null;
  const fingerprint = JSON.stringify(Object.fromEntries(Object.entries(body).filter(([key]) => !["version", "requestId"].includes(key))));
  if (requestId && l.requests?.[requestId]) {
    if (l.requests[requestId].fingerprint !== fingerprint) throw new WorkConflict("同じリクエストIDで内容を変更できません");
    return { ok: true, replayed: true, entityId: l.requests[requestId].entityId };
  }
  if (body.version !== l.version) throw new WorkConflict("別の画面またはAIが更新しました。再読み込みしてください");
  const command = body.command;
  const task = l.tasks.find(t => t.id === body.id);
  const run = l.runs.find(r => r.id === body.id);
  if (command === "initialize") { /* Seed only existing approved data. */ }
  else if (command === "createTask") {
    const task = createTask(body, id, now);
    if (task.goalId && !l.goals.some(g => g.id === task.goalId)) throw new WorkInputError("Goalがありません");
    l.tasks.push(task);
    if (["AI_EXECUTE", "AI_DRAFT", "HYBRID", "DECISION"].includes(task.aiCapability)) {
      l.runs.push({ id: `${id}:run`, taskId: id, status: "QUEUED", claim: null, leaseUntil: null, provider: null,
        output: null, evidence: [], blocker: null, createdAt: now, updatedAt: now });
    }
  } else if (command === "updateTask" && task) {
    if (body.title !== undefined) task.title = text(body.title, 200);
    if (body.deadline !== undefined) task.deadline = ymd(body.deadline);
    if (body.goalId !== undefined) {
      if (body.goalId !== null && (typeof body.goalId !== "string" || !l.goals.some(g => g.id === body.goalId))) throw new WorkInputError("Goalがありません");
      task.goalId = body.goalId as string | null;
    }
    if (body.description !== undefined) task.description = text(body.description, 6000);
    if (body.definitionOfDone !== undefined) {
      if (!Array.isArray(body.definitionOfDone) || body.definitionOfDone.length > 20) throw new WorkInputError("完了条件を確認してください");
      task.definitionOfDone = body.definitionOfDone.map(x => text(x, 500));
    }
    if (body.status !== undefined) {
      if (!["未着手", "進行中", "待ち", "完了", "Archive"].includes(String(body.status))) throw new WorkInputError("状態を確認してください");
      const latestRun = l.runs.filter(r => r.taskId === task.id).at(-1);
      if (body.status === "完了" && latestRun && latestRun.status !== "ACCEPTED") throw new WorkInputError("AIの成果物確認が必要です");
      task.status = body.status as Task["status"];
      task.completedAt = body.status === "完了" ? now : null;
      if (body.status === "Archive") { task.lifecycle = "ARCHIVED"; task.lifecycleReason = "ユーザーがArchive"; }
    }
    task.updatedAt = now;
  } else if (command === "createGoal") {
    const parentId = typeof body.parentId === "string" && body.parentId ? body.parentId : null;
    if (parentId && !l.goals.some(g => g.id === parentId)) throw new WorkInputError("親Goalがありません");
    const horizon = String(body.horizon ?? "1M");
    if (!["1M", "3M", "6M", "1Y", "3Y", "5Y", "PHILOSOPHY", "AREA"].includes(horizon)) throw new WorkInputError("期間を確認してください");
    l.goals.push({ id, parentId, title: text(body.title, 200), desiredState: text(body.desiredState, 3000),
      achievementCriteria: text(body.achievementCriteria, 3000), targetDate: ymd(body.targetDate), status: "進行中",
      horizon: horizon as Goal["horizon"], currentGap: null, nextEvidence: null, pathGapIds: [], northStars: [],
      isNorthStar: null, linkedUrl: null, note: null, createdAt: now, updatedAt: now });
  } else if (command === "updateGoal") {
    const goal = l.goals.find(g => g.id === body.id); if (!goal) throw new WorkInputError("Goalがありません");
    if (body.title !== undefined) goal.title = text(body.title, 200);
    if (body.desiredState !== undefined) goal.desiredState = text(body.desiredState, 3000);
    if (body.targetDate !== undefined) goal.targetDate = ymd(body.targetDate);
    if (body.achievementCriteria !== undefined) goal.achievementCriteria = text(body.achievementCriteria, 3000);
    if (body.status !== undefined) {
      if (!["進行中", "達成", "一時停止", "未達成"].includes(String(body.status))) throw new WorkInputError("Goal状態を確認してください");
      goal.status = body.status as Goal["status"];
    }
    goal.updatedAt = now;
  } else if (command === "enqueue" && task) {
    if (!["AI_EXECUTE", "AI_DRAFT", "HYBRID", "DECISION"].includes(task.aiCapability)) throw new WorkInputError("AI受付の対象ではありません");
    if (finishedTaskIds.includes(task.id) || ["完了", "Archive"].includes(task.status) || !["ACTIVE", "BACKLOG"].includes(task.lifecycle)) throw new WorkInputError("終了または整理済みの作業は実行できません");
    const existing = l.runs.filter(r => r.taskId === task.id).at(-1);
    if (existing) return { run: existing, reused: true };
    if (!task.description.trim() || !task.definitionOfDone.length || task.blockedOnInfo) throw new WorkInputError(task.blockedOnInfo ?? "作業の説明と完了条件が必要です");
    l.runs.push({ id, taskId: task.id, status: "QUEUED", claim: null, leaseUntil: null, provider: null, output: null, evidence: [], blocker: null, createdAt: now, updatedAt: now });
    task.aiStatus = "未着手"; task.updatedAt = now;
  } else if (command === "claim") {
    const next = l.runs.find(r => { const t=l.tasks.find(t=>t.id===r.taskId); return r.status === "QUEUED" && !!t && !["完了","Archive"].includes(t.status) && ["ACTIVE","BACKLOG"].includes(t.lifecycle) && (body.taskId === undefined || r.taskId === body.taskId); });
    if (!next) return { run: null };
    const task = l.tasks.find(t => t.id === next.taskId)!;
    if (finishedTaskIds.includes(task.id)) {
      next.status = "BLOCKED"; next.blocker = "終了実績が保存されています。再実行前に人間の確認が必要です"; task.aiStatus = "Blocked";
    } else if (!task.definitionOfDone.length || !task.description.trim() || task.blockedOnInfo) {
      next.status = "BLOCKED"; next.blocker = task.blockedOnInfo ?? "作業の説明と完了条件が必要です"; task.aiStatus = "Blocked";
    } else {
      next.status = "RUNNING"; next.claim = id; next.provider = text(body.provider, 100);
      next.leaseUntil = new Date(Date.parse(now) + 15 * 60000).toISOString(); task.aiStatus = "実行中";
    }
    next.updatedAt = now;
    l.audit.push({ at: now, operation: "claim", id: next.id });
    return { run: next, task };
  } else if (command === "result" && run) {
    if (run.status !== "RUNNING" || run.claim !== body.claim || !run.leaseUntil || run.leaseUntil <= now) throw new WorkConflict("実行権が無効です。自動再実行はしません");
    run.output = body.blocker ? null : text(body.output, 20000);
    run.blocker = body.blocker ? text(body.blocker, 1000) : null;
    run.evidence = Array.isArray(body.evidence) ? body.evidence.map(x => text(x, 2000)) : [];
    if (run.evidence.length > 20) throw new WorkInputError("根拠が多すぎます");
    run.status = run.blocker ? "BLOCKED" : "REVIEW"; run.updatedAt = now;
    const task = l.tasks.find(t => t.id === run.taskId)!;
    task.aiStatus = run.blocker ? "Blocked" : "人間確認待ち"; task.updatedAt = now;
  } else if (command === "retry" && run) {
    if (l.runs.filter(r => r.taskId === run.taskId).at(-1)?.id !== run.id) throw new WorkInputError("新しい実行がすでにあります");
    if (!["BLOCKED", "RUNNING"].includes(run.status) || (run.status === "RUNNING" && run.leaseUntil && run.leaseUntil > now) || body.previousExecutionChecked !== true) throw new WorkInputError("前回の実行結果確認と停止状態が必要です");
    // A new run retains the failed attempt; never erase evidence or send history.
    run.status = "BLOCKED"; run.blocker ??= "実行期限を過ぎたため、確認後に新しい実行を作成"; run.updatedAt = now;
    l.runs.push({ id, taskId: run.taskId, status: "QUEUED", claim: null, leaseUntil: null, provider: null,
      output: null, evidence: [], blocker: null, createdAt: now, updatedAt: now });
    l.tasks.find(t => t.id === run.taskId)!.aiStatus = "未着手";
  } else if (command === "accept" && run) {
    if (l.runs.filter(r => r.taskId === run.taskId).at(-1)?.id !== run.id) throw new WorkInputError("最新の成果物を確認してください");
    if (run.status !== "REVIEW" || !run.output || !run.evidence.length || body.factsChecked !== true) throw new WorkInputError("成果物と根拠の確認が必要です");
    run.status = "ACCEPTED"; run.updatedAt = now;
    const task = l.tasks.find(t => t.id === run.taskId)!;
    task.aiStatus = "完了";
    // Assist/Decision/Draft outputs never complete the human's remaining task.
    if (task.aiCapability === "AI_EXECUTE") { task.status = "完了"; task.completedAt = now; }
    task.updatedAt = now;
  } else throw new WorkInputError("操作または対象を確認してください");
  l.audit.push({ at: now, operation: String(command), id: typeof body.id === "string" ? body.id : id });
  if (requestId) { l.requests ??= {}; l.requests[requestId] = { fingerprint, entityId: typeof body.id === "string" ? body.id : id }; }
  return { ok: true };
}

