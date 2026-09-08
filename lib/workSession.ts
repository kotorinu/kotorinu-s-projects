import type { TaskWorkSession, WorkSessionEndReason } from "./types";

// The work-session ledger, as pure functions (2026-09-09, §9/§10/§41-C).
//
// Timer integrity is the thing that silently corrupts actuals: switching from
// Task A to Task B used to leave A's session open, so A kept accruing minutes
// it never spent. Every rule about that lives here, where a test can check it
// without mounting React.
//
// Invariant: at most ONE session is open at any moment, across all Tasks.

/** Whole minutes between two ISO timestamps, never below 1 for a real span. */
export function minutesBetweenIso(startIso: string, endIso: string): number {
  return Math.max(1, Math.round((Date.parse(endIso) - Date.parse(startIso)) / 60_000));
}

export interface SessionLedger {
  sessions: TaskWorkSession[];
  /** taskId → total minutes banked from closed sessions. */
  actualMinutes: Map<string, number>;
  startedTaskId: string | null;
}

function bank(actual: Map<string, number>, taskId: string, minutes: number): Map<string, number> {
  const next = new Map(actual);
  next.set(taskId, (next.get(taskId) ?? 0) + minutes);
  return next;
}

/**
 * Start `taskId`. Any session still open — whatever Task it belongs to — is
 * closed first and its minutes banked onto ITS OWN Task, never the new one.
 */
export function startWorkOn(ledger: SessionLedger, taskId: string, nowIso: string): SessionLedger {
  let actual = ledger.actualMinutes;
  const sessions = ledger.sessions.map((w) => {
    if (w.endedAt !== null) return w;
    const minutes = minutesBetweenIso(w.startedAt, nowIso);
    actual = bank(actual, w.taskId, minutes);
    return { ...w, endedAt: nowIso, minutes, endReason: "SWITCH" as WorkSessionEndReason };
  });
  sessions.push({
    id: `ws-${taskId}-${Date.parse(nowIso)}`,
    taskId,
    startedAt: nowIso,
    endedAt: null,
    minutes: null,
    endReason: null,
  });
  return { sessions, actualMinutes: actual, startedTaskId: taskId };
}

/** Close `taskId`'s open session with an explicit reason and bank its minutes. */
export function endWorkOn(
  ledger: SessionLedger,
  taskId: string,
  reason: WorkSessionEndReason,
  nowIso: string
): SessionLedger {
  let actual = ledger.actualMinutes;
  const sessions = ledger.sessions.map((w) => {
    if (w.taskId !== taskId || w.endedAt !== null) return w;
    const minutes = minutesBetweenIso(w.startedAt, nowIso);
    actual = bank(actual, taskId, minutes);
    return { ...w, endedAt: nowIso, minutes, endReason: reason };
  });
  return {
    sessions,
    actualMinutes: actual,
    startedTaskId: ledger.startedTaskId === taskId ? null : ledger.startedTaskId,
  };
}

export function bankedMinutesFor(sessions: TaskWorkSession[], taskId: string): number {
  return sessions
    .filter((w) => w.taskId === taskId && w.minutes !== null)
    .reduce((sum, w) => sum + (w.minutes ?? 0), 0);
}

/** The one session still running, if any. */
export function openSession(sessions: TaskWorkSession[]): TaskWorkSession | null {
  return sessions.find((w) => w.endedAt === null) ?? null;
}
