"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { __setClockOverrideForTesting, todayStr } from "./date";
import type { CarryoverDisposition, CarryoverRecord, VarianceReason } from "./types";

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

function emptyRolloverState(): RolloverState {
  return {
    current: emptyDay(todayStr()),
    history: {},
    startedTaskId: null,
    startedTaskDate: null,
    carryover: {},
    workDateOverrides: {},
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
  };
}

const TodayExecutionContext = createContext<TodayExecutionApi | null>(null);

export function TodayExecutionProvider({ children }: { children: ReactNode }) {
  // Starts empty for `todayStr()` on every render path (server, first
  // client render, a fresh tab) — hydration-safe, matching the pre-fix
  // behavior — then a client-only effect below restores any snapshot and
  // rolls it forward through as many day boundaries as have actually
  // elapsed since it was saved.
  const [state, setState] = useState<RolloverState>(emptyRolloverState);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const load = () => {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw) {
          let restored = fromPersisted(JSON.parse(raw) as PersistedShape);
          const today = todayStr();
          if (restored.current.date !== today) {
            restored = rollover(restored, today);
          }
          setState(restored);
        }
      } catch {
        // Corrupt JSON or storage blocked (private mode etc.) — fall back
        // to empty state; SPA-navigation persistence via Context still works.
      }
      setHydrated(true);
    };
    const id = setTimeout(load, 0);
    return () => clearTimeout(id);
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
  };

  return <TodayExecutionContext.Provider value={api}>{children}</TodayExecutionContext.Provider>;
}

export function useTodayExecution(): TodayExecutionApi {
  const ctx = useContext(TodayExecutionContext);
  if (!ctx) throw new Error("useTodayExecution must be used within TodayExecutionProvider");
  return ctx;
}
