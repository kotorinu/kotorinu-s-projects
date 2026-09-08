import { activeTimeBlocks, areaProfiles, outcomes, tasks as allTasks } from "./dummy-data";
import { pickAreaOutcome } from "./outcomeSelection";
import {
  effectiveDeadline,
  effectiveLifecycle,
  effectiveWorkDate,
  isTaskBlocked,
  isTaskDone,
  isTaskOpen,
  isTaskOverdue,
  type TaskStateOverlays,
} from "./taskState";
import type { AreaProfile, GapItem, HomeArea, Outcome, Task, TimeBlock } from "./types";

// Everything an Area Home needs, derived once (2026-09-08, §7).
//
// The point of an Area Home is that the user does not have to reconstruct
// "何を目指していて / 今どこで / 次に何を / 何時に" from a task list every
// morning. So this returns the Outcome, the standing goal, the next few
// Tasks *with the time they're scheduled for*, and what's blocking — rather
// than a count of open tasks, which says nothing about where the work is.

export interface AreaNextTask {
  task: Task;
  block: TimeBlock | null; // ACTIVE Tasks always have one (§2)
  deadline: string | null;
}

export interface AreaHomeData {
  profile: AreaProfile;
  outcome: Outcome | null;
  standingGoalOutcome: Outcome | null; // the長期 one, when a nearer Outcome took the headline
  next: AreaNextTask[];
  activeCount: number;
  backlogCount: number;
  doneCount: number;
  overdueCount: number;
  blockedCount: number;
  unscheduledActive: Task[]; // must stay empty (§25)
}

export function areaProfileBySlug(slug: string): AreaProfile | null {
  return areaProfiles.find((p) => p.slug === slug) ?? null;
}

export function buildAreaHome(
  area: HomeArea,
  today: string,
  overlays: TaskStateOverlays
): AreaHomeData {
  const profile = areaProfiles.find((p) => p.area === area)!;
  const outcome = pickAreaOutcome(area, outcomes);
  const standing = outcomes.find(
    (o) => o.area === area && o.horizon === "STANDING" && o.id !== outcome?.id
  );

  const areaTasks = allTasks.filter((t) => t.area === area);
  const open = areaTasks.filter((t) => isTaskOpen(t, overlays));
  const active = open.filter((t) => effectiveLifecycle(t, overlays) === "ACTIVE");
  const backlog = open.filter((t) => effectiveLifecycle(t, overlays) === "BACKLOG");

  const blockFor = (task: Task) =>
    activeTimeBlocks
      .filter((tb) => tb.taskId === task.id)
      .sort((a, b) => (a.date + a.startTime < b.date + b.startTime ? -1 : 1))
      .find((tb) => tb.date >= today) ?? null;

  // "Next" is ordered by when it is actually scheduled, not by priority
  // labels — the question being answered is 次に何をするか, and the answer is
  // whatever comes first on the clock.
  const next: AreaNextTask[] = active
    .map((task) => ({ task, block: blockFor(task), deadline: effectiveDeadline(task, overlays) }))
    .sort((a, b) => {
      const ka = a.block ? a.block.date + a.block.startTime : (a.deadline ?? "9999") + "99:99";
      const kb = b.block ? b.block.date + b.block.startTime : (b.deadline ?? "9999") + "99:99";
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    })
    .slice(0, 3);

  return {
    profile,
    outcome,
    standingGoalOutcome: standing ?? null,
    next,
    activeCount: active.length,
    backlogCount: backlog.length,
    doneCount: areaTasks.filter((t) => isTaskDone(t, overlays)).length,
    overdueCount: open.filter((t) => isTaskOverdue(t, today, overlays)).length,
    blockedCount: open.filter((t) => isTaskBlocked(t, overlays)).length,
    // §25: an ACTIVE Task with no TimeBlock is a bug in the plan, not a
    // display case. Surfaced rather than tolerated.
    unscheduledActive: active.filter(
      (t) => blockFor(t) === null || effectiveWorkDate(t, overlays) === null
    ),
  };
}

// --- Control Tower helpers (2026-09-08 第4ラウンド) ---

/**
 * The single number an Area is judged by (§3). Never a task-completion
 * percentage: that measures activity, not the Outcome. When the real figure
 * can't be computed yet (RIALA's headcount), it says so instead of inventing
 * one.
 */
export function areaHeadline(
  area: HomeArea,
  salesOwn: { done: number; total: number } | null,
  milestoneProgress?: { done: number; total: number }
): { label: string; value: string; sub: string } {
  if (area === "営業代行") {
    return {
      label: "自分版が書けているフェーズ",
      value: salesOwn ? `${salesOwn.done} / ${salesOwn.total}` : "-",
      sub: "基礎はワークシートから17/17。商品情報待ち6フェーズは分母から除外",
    };
  }
  if (area === "RIALA") {
    return {
      label: "完了した工程",
      value: milestoneProgress ? `${milestoneProgress.done} / ${milestoneProgress.total}` : "-",
      sub: "対象者の総数が未確認のため、人数ではなく工程で見る",
    };
  }
  return {
    label: "毎日の積み上げ",
    value: "DAY 1〜",
    sub: "Execution Baseline 2026-09-08 から計測",
  };
}

/**
 * The next scheduled block for this area (P0-7).
 *
 * "date >= today" was not enough: at 22:40 it still offered a 12:00-13:00 slot
 * from earlier the same day as "the next thing". A block only counts as next
 * if it has not already ended.
 */
export function nextBlockForArea(
  area: HomeArea,
  today: string,
  blocks: TimeBlock[],
  tasks: Task[],
  nowHm?: string
): { block: TimeBlock; taskTitle: string } | null {
  const candidates = blocks
    .filter((b) => {
      if (b.taskId === null || b.lifecycle !== "ACTIVE") return false;
      if (b.date > today) return true;
      if (b.date < today) return false;
      return nowHm === undefined || b.endTime > nowHm;
    })
    .sort((a, b) => (a.date + a.startTime < b.date + b.startTime ? -1 : 1));
  for (const block of candidates) {
    const task = tasks.find((t) => t.id === block.taskId);
    if (task && task.area === area) return { block, taskTitle: task.title };
  }
  return null;
}

/** Everything currently threatening this Area's Outcome, in one list (§3). */
export function areaRisks(data: AreaHomeData, gaps: GapItem[]): string[] {
  const out: string[] = [];
  if (data.overdueCount > 0) out.push(`期限超過 ${data.overdueCount}件`);
  if (data.unscheduledActive.length > 0)
    out.push(`実行時間が未設定のACTIVE Task ${data.unscheduledActive.length}件`);
  for (const g of gaps) {
    if (g.area === data.profile.area && g.status === "WAITING" && g.waitingOn) out.push(g.waitingOn);
  }
  for (const b of data.profile.blockers) out.push(b);
  return out;
}
