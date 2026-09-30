import type { Goal } from "./types";

// 目標の期限の振り返り (2026-09-30)。
//
// 1か月目標（期限 2026-10-01）の達成基準を1行ずつ、達成／一部／未達で判定し、
// 事実（根拠）と未達の理由を残す。判定するのは本人で、アプリは基準を並べて
// 記録を保存するだけ。達成を代わりに書かない（根拠の無い「達成」は作らない）。
//
// 記録には判定したときの目標名・期限・基準の文面を写す。目標を後で編集しても、
// 何に対して判定したかが分かるようにするため。

export type CriterionResult = "MET" | "PARTIAL" | "NOT_MET";

export const CRITERION_LABEL: Record<CriterionResult, string> = { MET: "達成", PARTIAL: "一部", NOT_MET: "未達" };

/**
 * 届かなかった原因の分類。次の目標の「どこを変えるか」が原因ごとに違うので、
 * 自由記述の理由とは別に1つ選ぶ。
 */
export type MissCause = "NO_TIME" | "NO_METHOD" | "WAITING" | "TOO_BIG" | "PRIORITY" | "ENERGY";
export const MISS_CAUSE_LABEL: Record<MissCause, string> = {
  NO_TIME: "時間をCalendarに入れていなかった",
  NO_METHOD: "やり方・次の一手が決まっていなかった",
  WAITING: "相手・情報待ちで止まった",
  TOO_BIG: "1か月で届く大きさではなかった",
  PRIORITY: "途中で優先順位が変わった",
  ENERGY: "疲れ・体調で実行できなかった",
};
/** 原因ごとの、次の1か月の計画での変え方。 */
export const MISS_CAUSE_FIX: Record<MissCause, string> = {
  NO_TIME: "目標を作ったその場で、基準ごとの時間を毎週Calendarに先に入れる（週の計画60分で確認）",
  NO_METHOD: "基準ごとに「最初の一手」と完了条件を先に書き、最初の週に「やり方を決める」枠を入れる",
  WAITING: "待ちが発生した日に相手へ期限つきで確認し、待ちの間に進める別の一手を決めておく",
  TOO_BIG: "基準を「1か月で自分の行動だけで達成できる大きさ」に分ける（成果は3か月目標へ）",
  PRIORITY: "優先順位を変えた日に、目標の基準も同時に書き換える（変えた理由を残す）",
  ENERGY: "頭を使う作業を朝へ、夜は30分以内にし、休息6時間を下回る日を作らない",
};

export interface CriterionReview {
  text: string;
  result: CriterionResult | null;
  /** 何が起きたか。数字・日付・成果物など、確かめられる事実。 */
  fact: string;
  /** 一部・未達のときの理由。 */
  reason: string;
  /** 一部・未達のときの原因の分類（任意）。 */
  cause?: MissCause | null;
}

export interface GoalReview {
  goalId: string;
  goalTitle: string;
  targetDate: string | null;
  criteria: CriterionReview[];
  /** この期間で分かったこと。 */
  learned: string;
  /** 次の期間で変えること。 */
  next: string;
  savedAt: string;
}

/** 達成基準の文面を1行ずつに分ける。先頭の「・」「-」「1.」は外す。 */
export function splitCriteria(text: string): string[] {
  return text.split("\n").map(l => l.replace(/^\s*(?:[・\-*•]|\d+[.)．])\s*/, "").trim()).filter(Boolean);
}

/** 保存済みの記録があれば、今の基準の文面に合わせて並べ直す。文面が変わった行は未判定に戻す。 */
export function startGoalReview(goal: Goal, saved: GoalReview | undefined, now: string): GoalReview {
  const criteria = splitCriteria(goal.achievementCriteria).map(text => {
    const prev = saved?.criteria.find(c => c.text === text);
    return prev ? { ...prev } : { text, result: null, fact: "", reason: "" };
  });
  return { goalId: goal.id, goalTitle: goal.title, targetDate: goal.targetDate, criteria,
    learned: saved?.learned ?? "", next: saved?.next ?? "", savedAt: saved?.savedAt ?? now };
}

export interface GoalReviewSummary { met: number; partial: number; notMet: number; undecided: number; total: number; metWithoutFact: number }

export function summarizeGoalReview(review: GoalReview): GoalReviewSummary {
  const c = review.criteria;
  return {
    met: c.filter(x => x.result === "MET").length,
    partial: c.filter(x => x.result === "PARTIAL").length,
    notMet: c.filter(x => x.result === "NOT_MET").length,
    undecided: c.filter(x => x.result === null).length,
    total: c.length,
    // 「達成」なのに事実が書かれていないもの。根拠の無い達成を作らないため、画面で知らせる。
    metWithoutFact: c.filter(x => x.result === "MET" && !x.fact.trim()).length,
  };
}

/** 全基準を判定し終えたときの、目標の状態の案。決めるのは本人。 */
export function suggestedGoalStatus(s: GoalReviewSummary): Goal["status"] | null {
  if (s.total === 0 || s.undecided > 0) return null;
  return s.met === s.total && s.metWithoutFact === 0 ? "達成" : "未達成";
}

/**
 * 振り返りを促す目標: 1か月・3か月の目標で、期限が2日後以内〜14日前までにあり、
 * まだ振り返りを保存していないもの。
 */
export function goalsDueForReview(goals: Goal[], reviews: Record<string, GoalReview>, today: string): Goal[] {
  const shift = (days: number) => new Date(Date.parse(`${today}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
  const from = shift(-14), to = shift(2);
  return goals.filter(g => ["1M", "3M"].includes(g.horizon) && g.status === "進行中" && g.targetDate !== null
    && g.targetDate >= from && g.targetDate <= to && reviews[g.id]?.targetDate !== g.targetDate);
}

export function validGoalReview(value: unknown): value is GoalReview {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (typeof v.goalId !== "string" || typeof v.goalTitle !== "string" || typeof v.learned !== "string" || typeof v.next !== "string" || typeof v.savedAt !== "string") return false;
  if (!(v.targetDate === null || typeof v.targetDate === "string") || !Array.isArray(v.criteria) || v.criteria.length > 30) return false;
  return v.criteria.every(c => {
    const x = c as Record<string, unknown>;
    return !!x && typeof x.text === "string" && typeof x.fact === "string" && typeof x.reason === "string"
      && (x.result === null || ["MET", "PARTIAL", "NOT_MET"].includes(String(x.result)))
      && (x.cause === undefined || x.cause === null || Object.keys(MISS_CAUSE_LABEL).includes(String(x.cause)));
  });
}

/** 未達・一部の原因を多い順に。次の目標の設計に使う。 */
export function missCauses(review: GoalReview): { cause: MissCause; count: number }[] {
  const count = new Map<MissCause, number>();
  for (const c of review.criteria) if (c.result && c.result !== "MET" && c.cause) count.set(c.cause, (count.get(c.cause) ?? 0) + 1);
  return [...count.entries()].map(([cause, n]) => ({ cause, count: n })).sort((a, b) => b.count - a.count);
}

/** 次の目標の下書きに入れる「今回の学びから変えること」。 */
export function nextGoalNotes(review: GoalReview): string {
  const lines = missCauses(review).map(c => `・${MISS_CAUSE_FIX[c.cause]}（前回: ${MISS_CAUSE_LABEL[c.cause]} ${c.count}件）`);
  return [review.next.trim(), lines.length ? "【前回の原因から変えること】\n" + lines.join("\n") : ""].filter(Boolean).join("\n\n");
}
