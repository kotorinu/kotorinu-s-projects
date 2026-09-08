"use client";

import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
  type ReactNode,
} from "react";
import { __setClockOverrideForTesting, todayStr } from "./date";
import type {
  CarryoverDisposition,
  CarryoverRecord,
  TaskCompletionRecord,
  TaskDispositionRecord,
  TaskLifecycleRecord,
  VarianceReason,
} from "./types";

// TODAY execution state, lifted out of app/today/page.tsx into a Provider
// mounted once in the root layout (2026-09-05 bug fix, revised 2026-09-06
// for Day Rollover). The root layout's component tree never unmounts on
// client-side navigation between routes — only the routed page does — so
// state that lived in a page's own useState was wiped on every navigation.
// A same-day snapshot is also mirrored to localStorage so it survives a
// full page reload (Phase 1, no DB).
//
// Day Rollover (2026-09-06): a calendar-day change is ARCHIVE → NEW DAY,
// never RESET. When `todayStr()` advances past `currentDate`, the just-
// finished day's record is frozen into `history[thatDate]` exactly as it
// stood, and a fresh (empty) day begins — it is never discarded. A Task
// still STARTED at the moment of rollover is never auto-completed, auto-
// reset, or auto-dropped: `startedTaskId`/`startedTaskDate` carry forward
// unchanged, so the UI can show "昨日から実行中" and let the user decide.

export interface DayRecord {
  date: string;
  completedTaskIds: string[];
  recurringDone: string[];
  taskStartedAt: [string, string][];
  taskCompletedAt: [string, string][];
  taskActualMinutes: [string, number][];
  varianceReasonByTaskId: [string, VarianceReason][];
}

interface CurrentDay {
  date: string;
  done: Set<string>;
  recurringDone: Set<string>;
  taskStartedAt: Map<string, string>;
  taskCompletedAt: Map<string, string>;
  taskActualMinutes: Map<string, number>;
  varianceReasonByTaskId: Map<string, VarianceReason>;
}

interface RolloverState {
  current: CurrentDay;
  history: Record<string, DayRecord>;
  startedTaskId: string | null;
  startedTaskDate: string | null; // the date startedTaskId's actualStartedAt belongs to — differs from current.date once a day has rolled over underneath it
  carryover: Record<string, CarryoverRecord>; // key: `${fromDate}:${taskId}`
  workDateOverrides: Record<string, string>; // taskId -> the date it's now effectively placed on
  // Google Calendar PLANNED_WORK sync (2026-09-06, §18-23): the user's own
  // per-TimeBlock decision that it's "worth putting on Calendar" — overlays
  // the fixture's static calendarSyncEnabled default (which starts false
  // for everything; nothing is pre-confirmed on the user's behalf).
  calendarSyncOverrides: Record<string, boolean>; // timeBlockId -> enabled
  // --- Execution Management (2026-09-06) ---
  // Durable, cross-day completion. `current.done` stays as "what was ticked
  // off on this particular day" (it drives today's progress and rolls into
  // history); `completions` is the Task-level truth that survives the day
  // boundary, so an overdue Task completed late actually leaves the overdue
  // list instead of reappearing forever.
  completions: Record<string, TaskCompletionRecord>; // taskId -> record
  dispositions: Record<string, TaskDispositionRecord>; // taskId -> BLOCKED/DROPPED
  deadlineOverrides: Record<string, string>; // taskId -> re-set deadline (original is kept on the Task)
  // --- Task organisation (2026-09-08, §4) ---
  // Archive / Merge / Delete decisions made from Task Detail. The fixture's
  // own `lifecycle` is the authored baseline; this is what the user has since
  // decided. A Task with real execution history is never hard-deleted — the
  // record stays here so the measurement survives, and only the UI hides it.
  lifecycleOverrides: Record<string, TaskLifecycleRecord>;
  // taskIds whose actualMinutes were typed in rather than timed.
  manualActualTaskIds: string[];
}

type SetUpdater<T> = T | ((prev: T) => T);

function resolve<T>(updater: SetUpdater<T>, prev: T): T {
  return typeof updater === "function" ? (updater as (p: T) => T)(prev) : updater;
}

function emptyDay(date: string): CurrentDay {
  return {
    date,
    done: new Set(),
    recurringDone: new Set(),
    taskStartedAt: new Map(),
    taskCompletedAt: new Map(),
    taskActualMinutes: new Map(),
    varianceReasonByTaskId: new Map(),
  };
}

// The date used for the very first render pass only (2026-09-08 fix).
//
// Every page is statically prerendered, so anything computed during render is
// frozen into the HTML at BUILD time. `todayStr()` was being called from the
// store's useState initializer, which meant the shipped HTML carried the build
// machine's date — Vercel builds in UTC, so a build at 07:06 JST baked in the
// previous day — and the browser then rendered the real local date. That is a
// hydration mismatch (React #418), and worse, it recurs every day after a
// deploy, because static HTML never advances.
//
// So the first pass uses a fixed placeholder that is identical on the server
// and in the browser, and the real date is written in a layout effect below,
// before the browser paints. Never call todayStr() during render.
const HYDRATION_PLACEHOLDER_DATE = "1970-01-01";

function emptyRolloverState(): RolloverState {
  return {
    current: emptyDay(HYDRATION_PLACEHOLDER_DATE),
    history: {},
    startedTaskId: null,
    startedTaskDate: null,
    carryover: {},
    workDateOverrides: {},
    calendarSyncOverrides: {},
    completions: {},
    dispositions: {},
    deadlineOverrides: {},
    lifecycleOverrides: {},
    manualActualTaskIds: [],
  };
}

function archiveDay(day: CurrentDay): DayRecord {
  return {
    date: day.date,
    completedTaskIds: [...day.done],
    recurringDone: [...day.recurringDone],
    taskStartedAt: [...day.taskStartedAt.entries()],
    taskCompletedAt: [...day.taskCompletedAt.entries()],
    taskActualMinutes: [...day.taskActualMinutes.entries()],
    varianceReasonByTaskId: [...day.varianceReasonByTaskId.entries()],
  };
}

// ARCHIVE → NEW DAY. A STARTED Task's actualStartedAt entry is carried into
// the new day's map (its own timestamp untouched) so elapsed-time reads
// keep working across the boundary — this is what lets "started at 23:50"
// still show a correct, continuously-growing elapsed time the next day.
//
// Guarded to only ever fire when newDate is strictly after the current
// day: real wall-clock time never moves backward, so this should be
// unreachable in normal use — but the devtools clock-override test seam
// combined with a real page reload (which drops the override and re-syncs
// to the true wall clock) can otherwise ask for a "rollover" to a date at
// or before the current one. Without this guard that would silently
// archive-and-overwrite an existing `history[newDate]` entry with an empty
// day, destroying real data. Never remove this even though it only
// protects against a test artifact today — a wrong device clock could hit
// the same path for real.
function rollover(state: RolloverState, newDate: string): RolloverState {
  if (newDate <= state.current.date) return state;
  const archived = archiveDay(state.current);
  const carriedEntry =
    state.startedTaskId !== null ? state.current.taskStartedAt.get(state.startedTaskId) : undefined;
  const nextCurrent = emptyDay(newDate);
  if (state.startedTaskId !== null && carriedEntry !== undefined) {
    nextCurrent.taskStartedAt.set(state.startedTaskId, carriedEntry);
  }
  return {
    ...state,
    current: nextCurrent,
    history: { ...state.history, [state.current.date]: archived },
    // startedTaskId/startedTaskDate intentionally unchanged — see module doc.
  };
}

interface TodayExecutionApi {
  currentDate: string;
  done: Set<string>;
  recurringDone: Set<string>;
  taskStartedAt: Map<string, string>;
  taskCompletedAt: Map<string, string>;
  taskActualMinutes: Map<string, number>;
  varianceReasonByTaskId: Map<string, VarianceReason>;
  startedTaskId: string | null;
  startedTaskDate: string | null;
  carryover: Record<string, CarryoverRecord>;
  workDateOverrides: Record<string, string>;
  calendarSyncOverrides: Record<string, boolean>;
  completions: Record<string, TaskCompletionRecord>;
  dispositions: Record<string, TaskDispositionRecord>;
  deadlineOverrides: Record<string, string>;
  lifecycleOverrides: Record<string, TaskLifecycleRecord>;
  history: Record<string, DayRecord>;

  setDone: (updater: SetUpdater<Set<string>>) => void;
  setRecurringDone: (updater: SetUpdater<Set<string>>) => void;
  setTaskStartedAt: (updater: SetUpdater<Map<string, string>>) => void;
  setTaskCompletedAt: (updater: SetUpdater<Map<string, string>>) => void;
  setTaskActualMinutes: (updater: SetUpdater<Map<string, number>>) => void;
  setVarianceReasonByTaskId: (updater: SetUpdater<Map<string, VarianceReason>>) => void;
  // Setting a real id stamps startedTaskDate to today; clearing it (null) —
  // used both for a normal completion and for an explicit 中断 — also
  // clears startedTaskDate.
  setStartedTaskId: (id: string | null) => void;
  // "今日へ継続" for a Task that's been STARTED since a previous day: keeps
  // it STARTED, just re-stamps which day it's attributed to, so the
  // "昨日から実行中" banner clears without touching actualStartedAt itself.
  continueStartedTaskToday: () => void;
  recordCarryover: (fromDate: string, taskId: string, disposition: CarryoverDisposition, toDate: string | null) => void;
  setCalendarSyncEnabled: (timeBlockId: string, enabled: boolean) => void;
  // --- Execution Management (2026-09-06) ---
  // Completing a Task always writes a durable record (including how late it
  // was and whether the DoD was actually met), marks it done for the day,
  // and clears any BLOCKED/DROPPED disposition it had.
  completeTask: (record: TaskCompletionRecord) => void;
  // Undo: removes the completion record and today's done tick together, so
  // the two can never disagree.
  uncompleteTask: (taskId: string) => void;
  setTaskDisposition: (record: TaskDispositionRecord | null, taskId: string) => void;
  setDeadlineOverride: (taskId: string, deadline: string) => void;
  // --- Task organisation (2026-09-08, §4) ---
  // Archive / Merge / mark-as-mis-entry. `replacedByTaskId` says where the
  // work went for MERGED/SUPERSEDED, so a Task is never a dead end. Pass null
  // to undo a decision and put the Task back where the fixture had it.
  setTaskLifecycle: (record: TaskLifecycleRecord | null, taskId: string) => void;
  // --- 実績時間の手入力 (2026-09-08) ---
  // The timer requires remembering to press 開始 and 完了. When that doesn't
  // happen the estimate-vs-actual history silently stops accumulating, which
  // is the data the whole improvement loop runs on. A typed figure is a real
  // measurement, but not a timer reading, so it is tagged as manual and shown
  // that way. Pass null to remove it.
  setManualActualMinutes: (taskId: string, minutes: number | null) => void;
  manualActualTaskIds: Set<string>;
}

const STORAGE_KEY = "ai-work-os:today-execution:v2";

interface PersistedShape {
  currentDate: string;
  done: string[];
  recurringDone: string[];
  taskStartedAt: [string, string][];
  taskCompletedAt: [string, string][];
  taskActualMinutes: [string, number][];
  varianceReasonByTaskId: [string, VarianceReason][];
  history: Record<string, DayRecord>;
  startedTaskId: string | null;
  startedTaskDate: string | null;
  carryover: Record<string, CarryoverRecord>;
  workDateOverrides: Record<string, string>;
  calendarSyncOverrides: Record<string, boolean>;
  completions: Record<string, TaskCompletionRecord>;
  dispositions: Record<string, TaskDispositionRecord>;
  deadlineOverrides: Record<string, string>;
  lifecycleOverrides: Record<string, TaskLifecycleRecord>;
  manualActualTaskIds: string[];
}

function toPersisted(state: RolloverState): PersistedShape {
  return {
    currentDate: state.current.date,
    done: [...state.current.done],
    recurringDone: [...state.current.recurringDone],
    taskStartedAt: [...state.current.taskStartedAt.entries()],
    taskCompletedAt: [...state.current.taskCompletedAt.entries()],
    taskActualMinutes: [...state.current.taskActualMinutes.entries()],
    varianceReasonByTaskId: [...state.current.varianceReasonByTaskId.entries()],
    history: state.history,
    startedTaskId: state.startedTaskId,
    startedTaskDate: state.startedTaskDate,
    carryover: state.carryover,
    workDateOverrides: state.workDateOverrides,
    calendarSyncOverrides: state.calendarSyncOverrides,
    completions: state.completions,
    dispositions: state.dispositions,
    deadlineOverrides: state.deadlineOverrides,
    lifecycleOverrides: state.lifecycleOverrides,
    manualActualTaskIds: state.manualActualTaskIds,
  };
}

function fromPersisted(parsed: PersistedShape): RolloverState {
  return {
    current: {
      date: parsed.currentDate,
      done: new Set(parsed.done ?? []),
      recurringDone: new Set(parsed.recurringDone ?? []),
      taskStartedAt: new Map(parsed.taskStartedAt ?? []),
      taskCompletedAt: new Map(parsed.taskCompletedAt ?? []),
      taskActualMinutes: new Map(parsed.taskActualMinutes ?? []),
      varianceReasonByTaskId: new Map(parsed.varianceReasonByTaskId ?? []),
    },
    history: parsed.history ?? {},
    startedTaskId: parsed.startedTaskId ?? null,
    startedTaskDate: parsed.startedTaskDate ?? null,
    carryover: parsed.carryover ?? {},
    workDateOverrides: parsed.workDateOverrides ?? {},
    calendarSyncOverrides: parsed.calendarSyncOverrides ?? {},
    completions: parsed.completions ?? {},
    dispositions: parsed.dispositions ?? {},
    deadlineOverrides: parsed.deadlineOverrides ?? {},
    lifecycleOverrides: parsed.lifecycleOverrides ?? {},
    manualActualTaskIds: parsed.manualActualTaskIds ?? [],
  };
}

const TodayExecutionContext = createContext<TodayExecutionApi | null>(null);

// useLayoutEffect warns when React renders on the server. This provider is a
// client component, but static prerendering still runs it there, so fall back
// to useEffect in that pass — where there is no paint to beat anyway.
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export function TodayExecutionProvider({ children }: { children: ReactNode }) {
  // Starts on HYDRATION_PLACEHOLDER_DATE with everything empty, identically on
  // the server and on the first client render, then the layout effect below
  // puts in the real date, restores any saved snapshot, and rolls it forward
  // through as many day boundaries as have actually elapsed since it was saved.
  const [state, setState] = useState<RolloverState>(emptyRolloverState);
  const [hydrated, setHydrated] = useState(false);

  // useLayoutEffect, not useEffect: this runs before the browser paints, so
  // the placeholder date is never visible. With useEffect the user would see
  // one frame of 1970-01-01 with an empty plan on every load.
  useIsomorphicLayoutEffect(() => {
    // Resolved synchronously, before paint — deferring this (setTimeout /
    // useEffect) shows the placeholder date for a frame.
    setState((prev) => {
      const today = todayStr();
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const restored = fromPersisted(JSON.parse(raw) as PersistedShape);
          return restored.current.date === today ? restored : rollover(restored, today);
        }
      } catch {
        // Corrupt JSON or storage blocked (private mode etc.) — fall through
        // to a fresh day; SPA-navigation persistence via Context still works.
      }
      return { ...prev, current: { ...prev.current, date: today } };
    });
    setHydrated(true);
  }, []);

  // A long-open tab needs its own periodic rollover check — hydration alone
  // only catches the boundary at load time. 30s is frequent enough that the
  // "昨日から実行中" banner and Yesterday Summary appear promptly after real
  // midnight without polling aggressively.
  useEffect(() => {
    if (!hydrated) return;
    const id = setInterval(() => {
      const today = todayStr();
      setState((s) => (s.current.date === today ? s : rollover(s, today)));
    }, 30_000);
    return () => clearInterval(id);
  }, [hydrated]);

  // Dev/test-only console hook (2026-09-06, Day Rollover round): lets a
  // 23:59→00:00 crossing be simulated from browser devtools without waiting
  // for real midnight — window.__aiWorkOsTestSetDate("2026-09-06") both sets
  // the clock override (lib/date.ts) and immediately runs the same rollover
  // check the 30s interval above would eventually run. Pass null to clear
  // the override and return to the real wall clock. Never referenced by any
  // UI — purely a devtools seam, harmless if never invoked.
  useEffect(() => {
    const w = window as unknown as { __aiWorkOsTestSetDate?: (date: string | null) => void };
    w.__aiWorkOsTestSetDate = (date) => {
      __setClockOverrideForTesting(date);
      const t = todayStr();
      setState((s) => (s.current.date === t ? s : rollover(s, t)));
    };
    return () => {
      delete w.__aiWorkOsTestSetDate;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(toPersisted(state)));
    } catch {
      // Private mode / storage full — in-memory Context state still covers
      // SPA navigation, which is this store's primary requirement.
    }
  }, [state, hydrated]);

  // Not wrapped in useMemo: `state` gets a new object identity on every
  // setState call anyway (each setter below spreads it), so memoizing here
  // would never actually skip recomputation — it only produced lint noise
  // (React Compiler couldn't verify the field-level dependencies matched a
  // coarse `[state]` array). Context consumers re-render on every state
  // change regardless, so a plain object is simpler and equally cheap.
  const api: TodayExecutionApi = {
    currentDate: state.current.date,
    done: state.current.done,
    recurringDone: state.current.recurringDone,
    taskStartedAt: state.current.taskStartedAt,
    taskCompletedAt: state.current.taskCompletedAt,
    taskActualMinutes: state.current.taskActualMinutes,
    varianceReasonByTaskId: state.current.varianceReasonByTaskId,
    startedTaskId: state.startedTaskId,
    startedTaskDate: state.startedTaskDate,
    carryover: state.carryover,
    workDateOverrides: state.workDateOverrides,
    calendarSyncOverrides: state.calendarSyncOverrides,
    completions: state.completions,
    dispositions: state.dispositions,
    deadlineOverrides: state.deadlineOverrides,
    lifecycleOverrides: state.lifecycleOverrides,
    manualActualTaskIds: new Set(state.manualActualTaskIds),
    history: state.history,

    setDone: (updater) =>
      setState((s) => ({ ...s, current: { ...s.current, done: resolve(updater, s.current.done) } })),
    setRecurringDone: (updater) =>
      setState((s) => ({ ...s, current: { ...s.current, recurringDone: resolve(updater, s.current.recurringDone) } })),
    setTaskStartedAt: (updater) =>
      setState((s) => ({ ...s, current: { ...s.current, taskStartedAt: resolve(updater, s.current.taskStartedAt) } })),
    setTaskCompletedAt: (updater) =>
      setState((s) => ({
        ...s,
        current: { ...s.current, taskCompletedAt: resolve(updater, s.current.taskCompletedAt) },
      })),
    setTaskActualMinutes: (updater) =>
      setState((s) => ({
        ...s,
        current: { ...s.current, taskActualMinutes: resolve(updater, s.current.taskActualMinutes) },
      })),
    setVarianceReasonByTaskId: (updater) =>
      setState((s) => ({
        ...s,
        current: { ...s.current, varianceReasonByTaskId: resolve(updater, s.current.varianceReasonByTaskId) },
      })),
    setStartedTaskId: (id) =>
      setState((s) => ({ ...s, startedTaskId: id, startedTaskDate: id ? s.current.date : null })),
    continueStartedTaskToday: () => setState((s) => ({ ...s, startedTaskDate: s.current.date })),
    recordCarryover: (fromDate, taskId, disposition, toDate) =>
      setState((s) => {
        const key = `${fromDate}:${taskId}`;
        const record: CarryoverRecord = { taskId, fromDate, disposition, toDate, decidedAt: new Date().toISOString() };
        const nextOverrides = { ...s.workDateOverrides };
        if (disposition !== "DROPPED" && toDate) nextOverrides[taskId] = toDate;
        return {
          ...s,
          carryover: { ...s.carryover, [key]: record },
          workDateOverrides: nextOverrides,
        };
      }),
    setCalendarSyncEnabled: (timeBlockId, enabled) =>
      setState((s) => ({
        ...s,
        calendarSyncOverrides: { ...s.calendarSyncOverrides, [timeBlockId]: enabled },
      })),
    completeTask: (record) =>
      setState((s) => {
        const nextDone = new Set(s.current.done);
        nextDone.add(record.taskId);
        const nextCompletedAt = new Map(s.current.taskCompletedAt).set(record.taskId, record.completedAt);
        const nextActual = new Map(s.current.taskActualMinutes);
        if (record.actualMinutes !== null) nextActual.set(record.taskId, record.actualMinutes);
        // A completed Task is no longer BLOCKED/DROPPED — the decision it
        // supersedes is dropped from `dispositions` (the completion record
        // itself is the newer, stronger fact).
        const nextDispositions = { ...s.dispositions };
        delete nextDispositions[record.taskId];
        return {
          ...s,
          current: {
            ...s.current,
            done: nextDone,
            taskCompletedAt: nextCompletedAt,
            taskActualMinutes: nextActual,
          },
          completions: { ...s.completions, [record.taskId]: record },
          dispositions: nextDispositions,
          // A Task that was the running one stops being "in progress".
          startedTaskId: s.startedTaskId === record.taskId ? null : s.startedTaskId,
          startedTaskDate: s.startedTaskId === record.taskId ? null : s.startedTaskDate,
        };
      }),
    uncompleteTask: (taskId) =>
      setState((s) => {
        const nextDone = new Set(s.current.done);
        nextDone.delete(taskId);
        const nextCompletions = { ...s.completions };
        delete nextCompletions[taskId];
        return {
          ...s,
          current: { ...s.current, done: nextDone },
          completions: nextCompletions,
        };
      }),
    setTaskDisposition: (record, taskId) =>
      setState((s) => {
        const nextDispositions = { ...s.dispositions };
        if (record === null) delete nextDispositions[taskId];
        else nextDispositions[taskId] = record;
        return { ...s, dispositions: nextDispositions };
      }),
    setDeadlineOverride: (taskId, deadline) =>
      setState((s) => ({ ...s, deadlineOverrides: { ...s.deadlineOverrides, [taskId]: deadline } })),
    setManualActualMinutes: (taskId, minutes) =>
      setState((s) => {
        const next = new Map(s.current.taskActualMinutes);
        const ids = new Set(s.manualActualTaskIds);
        if (minutes === null) {
          next.delete(taskId);
          ids.delete(taskId);
        } else {
          next.set(taskId, minutes);
          ids.add(taskId);
        }
        // Keep a completion record's actual in step with the typed value, so
        // 実績 and 差分 never disagree between the card and the record.
        const existing = s.completions[taskId];
        const completions = existing
          ? {
              ...s.completions,
              [taskId]: {
                ...existing,
                actualMinutes: minutes,
                varianceMinutes:
                  minutes !== null && existing.estimateMinutes !== null
                    ? minutes - existing.estimateMinutes
                    : null,
              },
            }
          : s.completions;
        return {
          ...s,
          current: { ...s.current, taskActualMinutes: next },
          manualActualTaskIds: [...ids],
          completions,
        };
      }),
    setTaskLifecycle: (record, taskId) =>
      setState((s) => {
        const next = { ...s.lifecycleOverrides };
        if (record === null) delete next[taskId];
        else next[taskId] = record;
        // Leaving the live plan also stops the Task running: a Task that has
        // been archived can't still be the STARTED one.
        const stillStarted =
          record === null || record.lifecycle === "ACTIVE" || record.lifecycle === "BACKLOG";
        return {
          ...s,
          lifecycleOverrides: next,
          startedTaskId: !stillStarted && s.startedTaskId === taskId ? null : s.startedTaskId,
          startedTaskDate: !stillStarted && s.startedTaskId === taskId ? null : s.startedTaskDate,
        };
      }),
  };

  return <TodayExecutionContext.Provider value={api}>{children}</TodayExecutionContext.Provider>;
}

export function useTodayExecution(): TodayExecutionApi {
  const ctx = useContext(TodayExecutionContext);
  if (!ctx) throw new Error("useTodayExecution must be used within TodayExecutionProvider");
  return ctx;
}
