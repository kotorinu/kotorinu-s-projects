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
import type { AreaProfile, HomeArea, Outcome, Task, TimeBlock } from "./types";

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
