import { computeVariance } from "./execution";
import type { Task, TaskCompletionRecord, VarianceReason } from "./types";

// PDCA — 計測を次の計画へ戻す (2026-09-09, §33〜§50).
//
// 計測する目的はデータを見ることではない。**次の見積りを良くすること**。
// だから流れは Plan → Actual → Gap → Cause → Next Estimate → Next Calendar
// で、最後まで行かないものは出さない。
//
// グラフは作らない。見るのは「今回どうだった？」「次回どう変える？」の2つ。

// --- Grouping (§41/§42) ---
//
// 以前は area + environment へfallbackしていた。これだと「営業Areaの全く違う
// Task」が同じ袋に入り、平均が意味を失う。明確な繰り返しの単位が無いなら、
// **無理に平均化しない**——グループ無し(null)を返して、提案そのものを出さない。

export type EstimateGroup = { key: string; label: string; explicit: boolean };

export function estimateGroupOf(task: Task): EstimateGroup | null {
  if (task.estimateGroupId) {
    return { key: `group:${task.estimateGroupId}`, label: ESTIMATE_GROUP_LABEL[task.estimateGroupId] ?? task.estimateGroupId, explicit: true };
  }
  if (task.seriesId) {
    return { key: `series:${task.seriesId}`, label: task.seriesTitle ?? "同じシリーズのTask", explicit: true };
  }
  if (task.workflowId) {
    return { key: `workflow:${task.workflowId}`, label: "同じWorkflowのTask", explicit: true };
  }
  // area だけでは同種と言えない。ここで諦めるのが正しい。
  return null;
}

/** 明確な繰り返しTaskにだけ付ける。AIで大量生成しない (§42)。 */
export const ESTIMATE_GROUP_LABEL: Record<string, string> = {
  RIALA_MEMBER_STATUS: "RIALA 移行ステータス更新",
  SALES_PHASE_ARTICULATION: "営業17フェーズの言語化",
  READING_60P: "読書 60ページ",
  DAILY_REPORT: "日報",
  DAILY_PLANNING: "翌日計画",
  GENESIS_INQUIRY: "GENESIS 問い切り",
};

// --- Estimate suggestion (§38〜§40) ---

export type EstimateConfidence = "PROVISIONAL" | "REFERENCE" | "RECOMMENDED";

export const CONFIDENCE_LABEL: Record<EstimateConfidence, string> = {
  PROVISIONAL: "暫定",
  REFERENCE: "参考値",
  RECOMMENDED: "推奨",
};

export const CONFIDENCE_HINT: Record<EstimateConfidence, string> = {
  PROVISIONAL: "実績1件だけの暫定候補です。次に測ればもっと確かになります。",
  REFERENCE: "実績2件の参考値です。",
  RECOMMENDED: "実績3件以上の中央値です。外れ値に引っ張られません。",
};

export interface EstimateProposal {
  groupKey: string;
  groupLabel: string;
  samples: number[];
  currentEstimate: number | null;
  suggestedMinutes: number;
  confidence: EstimateConfidence;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];
}

function confidenceFor(n: number): EstimateConfidence {
  if (n >= 3) return "RECOMMENDED";
  if (n === 2) return "REFERENCE";
  return "PROVISIONAL";
}

/**
 * 次回の見積り候補。
 *
 * 1件でも出す (§38)——ただし「暫定」と明示する。3件以上なら中央値 (§40)。
 * グループが決まらないTaskには何も出さない。
 */
export function proposeEstimate(
  task: Task,
  allTasks: Task[],
  completions: Record<string, TaskCompletionRecord>
): EstimateProposal | null {
  const group = estimateGroupOf(task);
  if (group === null) return null;

  const samples = allTasks
    .filter((t) => estimateGroupOf(t)?.key === group.key)
    .map((t) => completions[t.id]?.actualMinutes)
    .filter((m): m is number => typeof m === "number" && m > 0);

  if (samples.length === 0) return null;

  return {
    groupKey: group.key,
    groupLabel: group.label,
    samples,
    currentEstimate: task.estimateMinutes,
    // 1〜2件は平均で丸めず、直近の実績をそのまま候補にする。少ない標本を
    // 平均しても精度は上がらず、値の出どころが分かりにくくなるだけ。
    suggestedMinutes: samples.length >= 3 ? median(samples) : samples[samples.length - 1],
    confidence: confidenceFor(samples.length),
  };
}

// --- Daily review (§35〜§36, §47) ---

/** ズレを「説明する価値がある」と見なす線 (§36)。 */
export const CHECK_MINUTES = 15;
export const CHECK_PERCENT = 20;

export function isCheckWorthy(estimateMinutes: number | null, actualMinutes: number | null): boolean {
  if (estimateMinutes === null || actualMinutes === null || estimateMinutes <= 0) return false;
  const diff = Math.abs(actualMinutes - estimateMinutes);
  return diff >= CHECK_MINUTES || (diff / estimateMinutes) * 100 >= CHECK_PERCENT;
}

export interface CheckItem {
  task: Task;
  estimateMinutes: number | null;
  actualMinutes: number;
  varianceMinutes: number | null;
  variancePercent: number | null;
  reason: VarianceReason | null;
  proposal: EstimateProposal | null;
}

export interface DailyReview {
  date: string;
  /** 完了したTaskのうち、見積りがあったものの合計。 */
  plannedMinutes: number | null;
  actualMinutes: number | null;
  varianceMinutes: number | null;
  completed: number;
  /** 実績が入っていない完了Task。数字を作らずに件数だけ出す。 */
  missingActual: number;
  /** 予定より時間がかかった / 早かった、説明する価値のあるものだけ。 */
  over: CheckItem[];
  under: CheckItem[];
}

export interface DailyReviewInput {
  date: string;
  tasks: Task[];
  completions: Record<string, TaskCompletionRecord>;
  varianceReasons: Map<string, VarianceReason>;
  allTasks: Task[];
}

export function buildDailyReview({
  date,
  tasks,
  completions,
  varianceReasons,
  allTasks,
}: DailyReviewInput): DailyReview {
  const doneToday = tasks.filter((t) => completions[t.id]?.completedOnDate === date);

  let planned = 0;
  let actual = 0;
  let counted = 0;
  let missingActual = 0;
  const over: CheckItem[] = [];
  const under: CheckItem[] = [];

  for (const task of doneToday) {
    const rec = completions[task.id];
    const a = rec?.actualMinutes ?? null;
    if (a === null) {
      missingActual++;
      continue;
    }
    const est = rec?.estimateMinutes ?? task.estimateMinutes;
    if (est !== null) {
      planned += est;
      counted++;
    }
    actual += a;

    if (!isCheckWorthy(est, a)) continue;
    const v = computeVariance(est, a);
    const item: CheckItem = {
      task,
      estimateMinutes: est,
      actualMinutes: a,
      varianceMinutes: v.varianceMinutes,
      variancePercent: v.variancePercent,
      reason: varianceReasons.get(task.id) ?? null,
      proposal: proposeEstimate(task, allTasks, completions),
    };
    if ((v.varianceMinutes ?? 0) > 0) over.push(item);
    else under.push(item);
  }

  // 実績が1件も無ければ、合計も出さない。0分と書くと「0分で終わった」に読める。
  const hasActual = actual > 0 || doneToday.length > missingActual;
  return {
    date,
    plannedMinutes: counted > 0 ? planned : null,
    actualMinutes: hasActual ? actual : null,
    varianceMinutes: counted > 0 && hasActual ? actual - planned : null,
    completed: doneToday.length,
    missingActual,
    over: over.sort((a, b) => (b.varianceMinutes ?? 0) - (a.varianceMinutes ?? 0)),
    under: under.sort((a, b) => (a.varianceMinutes ?? 0) - (b.varianceMinutes ?? 0)),
  };
}

// --- Weekly review (§48) ---

export interface WeeklyGroupStat {
  groupKey: string;
  groupLabel: string;
  samples: number[];
  estimates: number[];
  /** 平均してどれだけズレたか。プラス＝見積りが足りない。 */
  averageDriftMinutes: number | null;
  suggestedMinutes: number;
  confidence: EstimateConfidence;
}

export interface WeeklyReview {
  from: string;
  to: string;
  completed: number;
  withActual: number;
  /** 繰り返しズレているグループ。ここが次週変えるものの候補。 */
  groups: WeeklyGroupStat[];
  reasons: Array<{ reason: VarianceReason; count: number }>;
}

export function buildWeeklyReview(
  from: string,
  to: string,
  tasks: Task[],
  completions: Record<string, TaskCompletionRecord>,
  varianceReasons: Map<string, VarianceReason>
): WeeklyReview {
  const inRange = tasks.filter((t) => {
    const d = completions[t.id]?.completedOnDate;
    return d !== undefined && d >= from && d <= to;
  });

  const byGroup = new Map<string, { label: string; actuals: number[]; estimates: number[] }>();
  for (const t of inRange) {
    const group = estimateGroupOf(t);
    if (group === null) continue;
    const rec = completions[t.id];
    if (rec?.actualMinutes == null) continue;
    const entry = byGroup.get(group.key) ?? { label: group.label, actuals: [], estimates: [] };
    entry.actuals.push(rec.actualMinutes);
    if (rec.estimateMinutes !== null) entry.estimates.push(rec.estimateMinutes);
    byGroup.set(group.key, entry);
  }

  const groups: WeeklyGroupStat[] = [...byGroup.entries()].map(([key, e]) => {
    const drift =
      e.estimates.length > 0
        ? Math.round(
            (e.actuals.reduce((s, v) => s + v, 0) - e.estimates.reduce((s, v) => s + v, 0)) /
              e.estimates.length
          )
        : null;
    return {
      groupKey: key,
      groupLabel: e.label,
      samples: e.actuals,
      estimates: e.estimates,
      averageDriftMinutes: drift,
      suggestedMinutes: e.actuals.length >= 3 ? median(e.actuals) : e.actuals[e.actuals.length - 1],
      confidence: confidenceFor(e.actuals.length),
    };
  });

  const reasonCounts = new Map<VarianceReason, number>();
  for (const t of inRange) {
    const r = varianceReasons.get(t.id);
    if (r) reasonCounts.set(r, (reasonCounts.get(r) ?? 0) + 1);
  }

  return {
    from,
    to,
    completed: inRange.length,
    withActual: inRange.filter((t) => completions[t.id]?.actualMinutes != null).length,
    // ズレの大きい順。次週何を変えるかを決めるための並び。
    groups: groups.sort((a, b) => Math.abs(b.averageDriftMinutes ?? 0) - Math.abs(a.averageDriftMinutes ?? 0)),
    reasons: [...reasonCounts.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count),
  };
}

// --- Calendar duration proposal (§45/§46) ---

/**
 * 次回の見積りを採用したとき、Calendarへ提案する枠の長さ。
 *
 * 状態は必ず PROPOSED。このアプリはCalendarへ書けないので、
 * 「Calendarを90分へ変更しました」とは絶対に言わない (§46)。
 */
export type CalendarChangeState = "CALENDAR_CHANGE_PROPOSED";

export interface CalendarDurationProposal {
  state: CalendarChangeState;
  currentMinutes: number | null;
  proposedMinutes: number;
  label: string;
}

export function proposeCalendarDuration(
  currentMinutes: number | null,
  proposal: EstimateProposal
): CalendarDurationProposal | null {
  if (currentMinutes === proposal.suggestedMinutes) return null;
  return {
    state: "CALENDAR_CHANGE_PROPOSED",
    currentMinutes,
    proposedMinutes: proposal.suggestedMinutes,
    label: `次回は${proposal.suggestedMinutes}分枠を提案`,
  };
}
