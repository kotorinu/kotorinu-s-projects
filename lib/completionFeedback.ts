import { formatDurationHm } from "./date";
import type { PhaseCoverage } from "./sales";
import type { Task, TaskCompletionRecord } from "./types";

// Completion feedback (2026-09-08 第5ラウンド, §49/§50).
//
// "完了しました" says nothing. What makes finishing feel like progress is
// being told what actually changed — the number that moved, the thing that is
// now unblocked. So every message is built from real figures; none of it is
// encouragement invented to sound nice, and it never over-praises.
//
// Celebration is reserved for genuine milestones (§50). A confetti burst on
// every checkbox stops meaning anything within a day.

export interface CompletionFeedback {
  headline: string;
  /** What moved, in numbers. Empty when nothing measurable changed. */
  changed: string[];
  /** What this unlocks next, when there is a real next thing. */
  unlocked: string | null;
  celebrate: "NONE" | "SUBTLE" | "MILESTONE";
}

export function buildCompletionFeedback(args: {
  task: Task;
  record: TaskCompletionRecord;
  salesCoverage: PhaseCoverage | null;
  remainingToday: number;
  nextTaskTitle: string | null;
  streakDays: number;
}): CompletionFeedback {
  const { task, record, salesCoverage, remainingToday, nextTaskTitle, streakDays } = args;
  const changed: string[] = [];

  // Estimate vs actual — stated as fact, in either direction.
  if (record.estimateMinutes !== null && record.actualMinutes !== null) {
    const diff = record.actualMinutes - record.estimateMinutes;
    if (diff <= -5) changed.push(`予定より${Math.abs(diff)}分早く完了`);
    else if (diff >= 5) changed.push(`予定より${diff}分多くかかった`);
    else changed.push(`実績${formatDurationHm(record.actualMinutes)}（ほぼ見積どおり）`);
  } else if (record.actualMinutes !== null) {
    changed.push(`実績${formatDurationHm(record.actualMinutes)}`);
  }

  if (record.delayDays !== null && record.delayDays > 0) {
    changed.push(`期限から${record.delayDays}日遅れで完了`);
  }

  if (task.linkedSalesMaster && salesCoverage) {
    changed.push(`営業の自分版 ${salesCoverage.ownVersionDone} / ${salesCoverage.ownVersionAchievable}`);
  }

  const headline = !record.metDefinitionOfDone
    ? "未達のまま終了として記録しました"
    : remainingToday === 0
      ? "今日の予定を全部終えました"
      : "完了。前に進みました。";

  const unlocked =
    remainingToday > 0 && nextTaskTitle ? `次は「${nextTaskTitle}」` : remainingToday > 0 ? `残り${remainingToday}件` : null;

  // Milestone only for a genuinely meaningful moment: the day cleared, or a
  // streak that just extended past the first day.
  const celebrate: CompletionFeedback["celebrate"] =
    !record.metDefinitionOfDone
      ? "NONE"
      : remainingToday === 0
        ? "MILESTONE"
        : streakDays >= 2
          ? "SUBTLE"
          : "SUBTLE";

  return { headline, changed, unlocked, celebrate };
}

/** §50: what a finished Sales phase changes, stated exactly. */
export function phaseCompletionMessage(phaseNumber: number, coverage: PhaseCoverage): string {
  return `Phase ${String(phaseNumber).padStart(2, "0")} の自分版が完成。${coverage.ownVersionDone} / ${coverage.ownVersionAchievable}`;
}
