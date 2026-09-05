"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { todayStr } from "./date";
import type { VarianceReason } from "./types";

// TODAY execution state, lifted out of app/today/page.tsx into a Provider
// mounted once in the root layout (2026-09-05 bug fix). The root layout's
// component tree never unmounts on client-side navigation between routes —
// only the routed page (`app/today/page.tsx` etc.) does — so state that
// lived in that page's own useState was wiped every time the user left
// TODAY and came back. Moving it up here means it survives SPA navigation
// automatically, with no change to *when* or *how* it's updated.
//
// A same-day snapshot is also mirrored to localStorage so it survives a full
// page reload too (Phase 1, no DB). `recurringDone`/`done` are meaningful
// only for "today" — a snapshot from a previous calendar day is discarded on
// load rather than incorrectly pre-checking tomorrow's daily practice.

interface TodayExecutionState {
  done: Set<string>;
  recurringDone: Set<string>;
  taskStartedAt: Map<string, string>;
  taskActualMinutes: Map<string, number>;
  varianceReasonByTaskId: Map<string, VarianceReason>;
  startedTaskId: string | null;
}

type SetUpdater<T> = T | ((prev: T) => T);

interface TodayExecutionApi extends TodayExecutionState {
  setDone: (updater: SetUpdater<Set<string>>) => void;
  setRecurringDone: (updater: SetUpdater<Set<string>>) => void;
  setTaskStartedAt: (updater: SetUpdater<Map<string, string>>) => void;
  setTaskActualMinutes: (updater: SetUpdater<Map<string, number>>) => void;
  setVarianceReasonByTaskId: (updater: SetUpdater<Map<string, VarianceReason>>) => void;
  setStartedTaskId: (id: string | null) => void;
}

const STORAGE_KEY = "ai-work-os:today-execution:v1";

function emptyState(): TodayExecutionState {
  return {
    done: new Set(),
    recurringDone: new Set(),
    taskStartedAt: new Map(),
    taskActualMinutes: new Map(),
    varianceReasonByTaskId: new Map(),
    startedTaskId: null,
  };
}

interface PersistedShape {
  date: string;
  done: string[];
  recurringDone: string[];
  taskStartedAt: [string, string][];
  taskActualMinutes: [string, number][];
  varianceReasonByTaskId: [string, VarianceReason][];
  startedTaskId: string | null;
}

function resolve<T>(updater: SetUpdater<T>, prev: T): T {
  return typeof updater === "function" ? (updater as (p: T) => T)(prev) : updater;
}

const TodayExecutionContext = createContext<TodayExecutionApi | null>(null);

export function TodayExecutionProvider({ children }: { children: ReactNode }) {
  // Starts empty on every render path (server, first client render, and a
  // fresh tab) — identical to the pre-fix behavior — then a client-only
  // effect below restores any same-day snapshot. This keeps the root layout
  // itself hydration-safe: nothing here depends on localStorage during the
  // render that has to match the server's output.
  const [state, setState] = useState<TodayExecutionState>(emptyState);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // setState is called inside this nested callback (via setTimeout(0)),
    // never as the effect body's own first-line statement — the project's
    // established fix for react-hooks/set-state-in-effect (see
    // lib/useReducedMotion.ts for the same pattern and why it's needed).
    const load = () => {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as PersistedShape;
          if (parsed.date === todayStr()) {
            setState({
              done: new Set(parsed.done ?? []),
              recurringDone: new Set(parsed.recurringDone ?? []),
              taskStartedAt: new Map(parsed.taskStartedAt ?? []),
              taskActualMinutes: new Map(parsed.taskActualMinutes ?? []),
              varianceReasonByTaskId: new Map(parsed.varianceReasonByTaskId ?? []),
              startedTaskId: parsed.startedTaskId ?? null,
            });
          }
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

  useEffect(() => {
    // Never write the pre-hydration empty snapshot back over a real one —
    // that would erase a valid same-day snapshot before it's even read.
    if (!hydrated) return;
    try {
      const payload: PersistedShape = {
        date: todayStr(),
        done: [...state.done],
        recurringDone: [...state.recurringDone],
        taskStartedAt: [...state.taskStartedAt.entries()],
        taskActualMinutes: [...state.taskActualMinutes.entries()],
        varianceReasonByTaskId: [...state.varianceReasonByTaskId.entries()],
        startedTaskId: state.startedTaskId,
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Private mode / storage full — in-memory Context state still covers
      // SPA navigation, which is this fix's primary requirement.
    }
  }, [state, hydrated]);

  const api = useMemo<TodayExecutionApi>(
    () => ({
      ...state,
      setDone: (updater) => setState((s) => ({ ...s, done: resolve(updater, s.done) })),
      setRecurringDone: (updater) => setState((s) => ({ ...s, recurringDone: resolve(updater, s.recurringDone) })),
      setTaskStartedAt: (updater) => setState((s) => ({ ...s, taskStartedAt: resolve(updater, s.taskStartedAt) })),
      setTaskActualMinutes: (updater) =>
        setState((s) => ({ ...s, taskActualMinutes: resolve(updater, s.taskActualMinutes) })),
      setVarianceReasonByTaskId: (updater) =>
        setState((s) => ({ ...s, varianceReasonByTaskId: resolve(updater, s.varianceReasonByTaskId) })),
      setStartedTaskId: (id) => setState((s) => ({ ...s, startedTaskId: id })),
    }),
    [state]
  );

  return <TodayExecutionContext.Provider value={api}>{children}</TodayExecutionContext.Provider>;
}

export function useTodayExecution(): TodayExecutionApi {
  const ctx = useContext(TodayExecutionContext);
  if (!ctx) throw new Error("useTodayExecution must be used within TodayExecutionProvider");
  return ctx;
}
