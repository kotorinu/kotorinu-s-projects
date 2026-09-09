import { daysBetween } from "./date";
import type { GapItem, Goal, GoalHorizon } from "./types";

// GOAL TREE の並べ替え (2026-09-09, P1/P2/P5).
//
// データ上の親子は「何が何につながるか」を持っているが、「どれが一番近いか」
// は持っていない。GOAL TREEを開いた人が最初に知りたいのは後者なので、
// 表示は日付の昇順——近い順——で組み立てる。親子チェーンは 5年→3年→…→1か月
// と遠い方から書かれているため、そのまま描くと一番遠い未来が一番上に来る。

/** 期間Goalの並び順（近い順）。 */
const SPINE_ORDER: GoalHorizon[] = ["1M", "3M", "6M", "1Y", "3Y", "5Y"];

export interface JourneyNode {
  goal: Goal;
  /** 今日から何日後か。日付が無いGoalは null。 */
  daysAway: number | null;
  /** いま一番近い未来のGoal。GOAL TREE最上部に出す。 */
  isNextMilestone: boolean;
}

/**
 * 日付を持つ期間Goalを近い順に。AREA（この期間の中身）と PHILOSOPHY（why）は
 * 時間軸に乗らないので外す。
 */
export function journeySpine(goals: Goal[], today: string): JourneyNode[] {
  const next = nextMilestone(goals, today);
  return goals
    .filter((g) => g.horizon !== "AREA" && g.horizon !== "PHILOSOPHY" && g.targetDate !== null)
    .sort((a, b) => SPINE_ORDER.indexOf(a.horizon) - SPINE_ORDER.indexOf(b.horizon))
    .map((goal) => ({
      goal,
      daysAway: goal.targetDate === null ? null : daysBetween(today, goal.targetDate),
      isNextMilestone: goal.id === next?.id,
    }));
}

/**
 * いま一番近い未来のGoal。「22日後に何になればいいか」を一目で出すためのもの
 * なので、AREAのGoalも候補に含める（合宿はれっきとした締切）。過ぎたものは
 * 候補にしない。
 */
export function nextMilestone(goals: Goal[], today: string): Goal | null {
  let best: { goal: Goal; days: number } | null = null;
  for (const goal of goals) {
    if (goal.targetDate === null) continue;
    const days = daysBetween(today, goal.targetDate);
    if (days < 0) continue;
    if (best === null || days < best.days) best = { goal, days };
  }
  return best?.goal ?? null;
}

/** 「この期間の中身」——いま実際に動かしている3領域。 */
export function areaGoals(goals: Goal[]): Goal[] {
  return goals.filter((g) => g.horizon === "AREA");
}

/** why側。時間軸には乗らないが、Journeyの終点として最後に置く。 */
export function philosophyGoals(goals: Goal[]): Goal[] {
  return goals.filter((g) => g.horizon === "PHILOSOPHY");
}

/**
 * Goalの道筋を、既存のGapItemとして解決する。pathGapIds の順番がそのまま工程
 * の順番。存在しないidは黙って捨てず、呼び出し側が気づけるように単に落とす
 * （データ側は tests/goalTree.test.ts で参照切れを禁止している）。
 */
export function goalPath(goal: Goal, gaps: GapItem[]): GapItem[] {
  const byId = new Map(gaps.map((g) => [g.id, g]));
  return goal.pathGapIds.map((id) => byId.get(id)).filter((g): g is GapItem => g !== undefined);
}

/** 道筋のうち、いまどこまで満たされているか。捏造ではなくGapItemの status から。 */
export function pathProgress(path: GapItem[]): { done: number; total: number; current: GapItem | null } {
  const done = path.filter((g) => g.status === "DONE").length;
  const current = path.find((g) => g.status === "DOING") ?? path.find((g) => g.status !== "DONE") ?? null;
  return { done, total: path.length, current };
}

/** 「1か月後」など。Journeyの見出しに使う。 */
export function horizonHeadline(goal: Goal, today: string): string | null {
  if (goal.targetDate === null) return null;
  const days = daysBetween(today, goal.targetDate);
  if (days < 0) return "期限を過ぎています";
  if (days === 0) return "今日";
  return `あと${days}日`;
}
