import { activeTimeBlocks, sessionRunbooks } from "./dummy-data";
import type { SessionRunbook, TimeBlock, TimeBlockOverride } from "./types";

// The live schedule = fixture blocks minus the ones superseded by a reschedule,
// plus the blocks created by rescheduling (2026-09-08, §10).
//
// Nothing in the fixture is edited. Moving work writes a new block and marks
// the old one superseded, so "this was going to happen on Monday at 19:00"
// stays recoverable — which is the whole point of keeping a plan history.

export interface LivePlanOverlays {
  timeBlockOverrides: Record<string, TimeBlockOverride>;
  supersededBlockIds: Set<string>;
}

function overrideToBlock(o: TimeBlockOverride): TimeBlock {
  return {
    id: o.id,
    taskId: o.taskId,
    recurringRuleId: null,
    label: o.label,
    date: o.date,
    startTime: o.startTime,
    endTime: o.endTime,
    status: "PLANNED",
    // A block the user just moved is by definition not reflected in Calendar.
    calendarSyncEnabled: true,
    calendarEventId: null,
    source: "AI_WORK_OS",
    lifecycle: "ACTIVE",
    supersededReason: null,
    supersededOn: null,
    executionEnvironment: "PC_AVAILABLE",
  };
}

export function liveTimeBlocks(overlays: LivePlanOverlays): TimeBlock[] {
  const kept = activeTimeBlocks.filter((b) => !overlays.supersededBlockIds.has(b.id));
  const added = Object.values(overlays.timeBlockOverrides).map(overrideToBlock);
  return [...kept, ...added].sort((a, b) =>
    a.date + a.startTime < b.date + b.startTime ? -1 : 1
  );
}

/** Blocks that were replaced by a reschedule — kept, never deleted. */
export function supersededByReschedule(overlays: LivePlanOverlays): TimeBlock[] {
  return activeTimeBlocks
    .filter((b) => overlays.supersededBlockIds.has(b.id))
    .map((b) => ({ ...b, lifecycle: "SUPERSEDED" as const }));
}

// --- Session Runbook (§13/§14) ---
export const RUNBOOK_MIN_MINUTES = 60;

export function blockMinutes(b: Pick<TimeBlock, "startTime" | "endTime">): number {
  const [sh, sm] = b.startTime.split(":").map(Number);
  const [eh, em] = b.endTime.split(":").map(Number);
  return eh * 60 + em - (sh * 60 + sm);
}

export function runbookFor(block: TimeBlock): SessionRunbook | null {
  if (blockMinutes(block) < RUNBOOK_MIN_MINUTES) return null;
  return sessionRunbooks.find((r) => r.timeBlockId === block.id) ?? null;
}

/**
 * Which step is running at `nowHm`, and which comes next. A long block should
 * never render as "just do this for 2.5 hours" — there is always one visible
 * next step (§14).
 */
export function currentRunbookStep(
  runbook: SessionRunbook,
  nowHm: string
): { currentIndex: number; nextIndex: number | null } {
  const idx = runbook.steps.findIndex((s) => nowHm >= s.startTime && nowHm < s.endTime);
  if (idx >= 0) {
    return { currentIndex: idx, nextIndex: idx + 1 < runbook.steps.length ? idx + 1 : null };
  }
  // Before the block starts: the first step is next. After it ends: none.
  const upcoming = runbook.steps.findIndex((s) => nowHm < s.startTime);
  return { currentIndex: -1, nextIndex: upcoming >= 0 ? upcoming : null };
}
