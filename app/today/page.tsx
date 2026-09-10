"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { fixedCalendarEvents, goals, outcomes, recurringRules, tasks as allTasks } from "@/lib/dummy-data";
import { addDaysToYmd, daysBetween, formatDurationHm, formatMd, minutesSince } from "@/lib/date";
import { useClock } from "@/lib/currentTime";
import { capabilityBadge } from "@/lib/capability";
import { minutesUntil, type TimelineItem } from "@/lib/timeline";
import { computeVariance } from "@/lib/execution";
import { tasksEffectiveOnDate, tasksScheduledOnDate, pendingCarryoverTasks } from "@/lib/dayPlan";
import { executionDayNumber, executionStreak, isBeforeBaseline } from "@/lib/executionBaseline";
import { liveTimeBlocks, runbookFor } from "@/lib/livePlan";
import RunbookStrip from "@/components/RunbookStrip";
import CalendarSyncStrip from "@/components/CalendarSyncStrip";
import CalendarOnlyCard from "@/components/CalendarOnlyCard";
import ActualMinutesDialog from "@/components/ActualMinutesDialog";
import { CONFIDENCE_LABEL, proposeEstimate } from "@/lib/pdca";
import { buildCalendarDay, type DayEntry } from "@/lib/calendarDay";
import { useCalendarDay } from "@/lib/useCalendarDay";
import { calendarFreshnessLabel } from "@/lib/calendarProvider";
import CompletionToast from "@/components/CompletionToast";
import RescheduleDialog from "@/components/RescheduleDialog";
import { useReschedule } from "@/lib/useReschedule";
import { themeFor } from "@/lib/areaTheme";
import { buildCompletionFeedback, type CompletionFeedback } from "@/lib/completionFeedback";
import { phaseCoverage } from "@/lib/sales";
import { salesPhases } from "@/lib/dummy-data";
import {
  buildCompletionRecord,
  effectiveDeadline,
  isTaskCommitted,
  isTaskDone,
  isTaskOpen,
  overdueTasks as computeOverdueTasks,
} from "@/lib/taskState";
import { useTodayExecution } from "@/lib/todayExecutionStore";
import type {
  CarryoverDisposition,
  RecurringRule,
  SessionRunbook,
  Task,
  TaskCompletionRecord,
  TimeBlock,
} from "@/lib/types";
import { DEPART_MS, useDeparting } from "@/lib/useDeparting";
import { usePrefersReducedMotion } from "@/lib/useReducedMotion";
import ProgressBar from "@/components/ProgressBar";
import OverdueInbox from "@/components/OverdueInbox";
import TaskCompleteDialog from "@/components/TaskCompleteDialog";
import TaskDetailSheet from "@/components/TaskDetailSheet";
import RecurringDetailSheet from "@/components/RecurringDetailSheet";
import OutcomeDetailSheet from "@/components/OutcomeDetailSheet";
import Confetti from "@/components/Confetti";


const WEEKDAY_LABEL = ["日", "月", "火", "水", "木", "金", "土"];

type Celebration =
  | { kind: "simple" }
  | {
      kind: "goal";
      goalTitle: string;
      desiredState: string;
      achievementCriteria: string;
      done: number;
      total: number;
      pct: number;
    }
  | { kind: "recurring"; total: number; label: string }
  | { kind: "today" };

// Note: "is this Task still open?" now lives in lib/taskState.ts
// (isTaskOpen), because it has to account for the runtime completion /

export default function TodayPage() {
  // Task status / started / completed / actualMinutes / varianceReason all
  // live in TodayExecutionProvider (mounted once in the root layout), not in
  // this page's own useState — this page unmounts on every SPA navigation
  // away from /today, and local useState would be wiped each time (the
  // 2026-09-05 bug this fixes). See lib/todayExecutionStore.tsx.
  const {
    currentDate,
    done,
    recurringDone,
    setRecurringDone,
    taskStartedAt,
    setTaskCompletedAt,
    taskActualMinutes,
    varianceReasonByTaskId,
    setVarianceReasonByTaskId,
    startedTaskId,
    setStartedTaskId,
    startedTaskDate,
    continueStartedTaskToday,
    carryover,
    workDateOverrides,
    recordCarryover,
    history,
    completions,
    dispositions,
    deadlineOverrides,
    completeTask,
    uncompleteTask,
    setTaskDisposition,
    lifecycleOverrides,
    timeBlockOverrides,
    supersededBlockIds,
    phaseOwnVersions,
    startWork,
    endWork,
    bankedMinutes,
    setManualActualMinutes,
  } = useTodayExecution();
  const overlays = { completions, dispositions, deadlineOverrides, workDateOverrides, lifecycleOverrides };
  // "Done" = a durable completion record (or an authored-complete fixture
  // Task), OR ticked off on today's list. The durable half is what makes a
  // completed Task stay completed across the day boundary and drop out of
  // the overdue list.
  function isDone(task: Task) {
    return isTaskDone(task, overlays) || done.has(task.id);
  }
  const today = currentDate;
  const weekday = WEEKDAY_LABEL[new Date(currentDate + "T00:00:00").getDay()];

  // Execution Baseline (§1/§28): 2026-09-08 は DAY 1。それ以前の実行状態は
  // Execution OS完成前の試行期間なので、Streakにも今日の数値にも持ち込まない。
  const dayNumber = executionDayNumber(today);
  const streak = executionStreak(today, (d) =>
    d === today
      ? done.size > 0 || recurringDone.size > 0
      : (history[d]?.completedTaskIds.length ?? 0) > 0 || (history[d]?.recurringDone.length ?? 0) > 0
  );

  const [expanded, setExpanded] = useState(false);
  const [celebration, setCelebration] = useState<Celebration | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [selectedRecurring, setSelectedRecurring] = useState<RecurringRule | null>(null);
  const [outcomeSheetId, setOutcomeSheetId] = useState<string | null>(null);
  const celebrationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reducedMotion = usePrefersReducedMotion();

  // switchConfirmTaskId is purely a same-visit UI prompt (a still-open
  // confirmation sheet shouldn't reappear after navigating back) — it stays
  // page-local, unlike the execution state above.
  const [switchConfirmTaskId, setSwitchConfirmTaskId] = useState<string | null>(null);
  const [completingTask, setCompletingTask] = useState<Task | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  // §49: what changed, shown for a few seconds after finishing something.
  const [completionFeedback, setCompletionFeedback] = useState<CompletionFeedback | null>(null);
  // P0: the one reschedule flow, shared with Task Detail and the overdue inbox.
  const [reschedulingTask, setReschedulingTask] = useState<Task | null>(null);
  const { reschedule, currentBlockFor } = useReschedule();
  const [yesterdaySummaryOpen, setYesterdaySummaryOpen] = useState(false);
  const [reschedulingTaskId, setReschedulingTaskId] = useState<string | null>(null);
  // §28: 実績の修正はTask Detailの奥ではなく、完了カードから1タップで開く。
  const [actualEditTask, setActualEditTask] = useState<Task | null>(null);
  // §52: 完了直後に実績を聞く相手。編集(actualEditTask)とは文言が違うだけ。
  const [askActualTask, setAskActualTask] = useState<Task | null>(null);
  const [rescheduleDateValue, setRescheduleDateValue] = useState("");

  function fireCelebration(c: Celebration, durationMs: number) {
    setCelebration(c);
    if (celebrationTimer.current) clearTimeout(celebrationTimer.current);
    celebrationTimer.current = setTimeout(() => setCelebration(null), durationMs);
  }

  function reallyStart(taskId: string) {
    // startWork closes any session still open on another Task (endReason
    // SWITCH) and banks its minutes before opening this one — that is the fix
    // for time leaking between Tasks (P0-4).
    const previous = startedTaskId ? allTasks.find((t) => t.id === startedTaskId) ?? null : null;
    const previousMinutes = previous ? bankedMinutes(previous.id) : 0;
    startWork(taskId);
    setSwitchConfirmTaskId(null);
    if (previous) {
      const started = taskStartedAt.get(previous.id);
      const thisSession = started ? minutesSince(started) : 0;
      setCompletionFeedback({
        headline: `「${previous.title}」を中断しました`,
        changed: [
          `実績 ${previousMinutes + thisSession}分を保存`,
          `「${allTasks.find((t) => t.id === taskId)?.title ?? "次のTask"}」を開始`,
        ],
        unlocked: null,
        celebrate: "NONE",
        nextEstimate: null,
      });
    }
  }

  function requestStart(taskId: string) {
    if (startedTaskId && startedTaskId !== taskId) {
      setSwitchConfirmTaskId(taskId);
      return;
    }
    reallyStart(taskId);
  }

  function confirmSwitch() {
    if (switchConfirmTaskId) reallyStart(switchConfirmTaskId);
  }

  // Completion always goes through the DoD confirmation now (§11): the user
  // sees the 達成基準 at the moment of completing, and "未達のまま終了" is
  // routed to a re-plan/Blocked/やめる decision instead of being recorded
  // as a finished Task.
  function requestComplete(task: Task) {
    setCompletingTask(task);
  }


  function undoComplete(task: Task) {
    uncompleteTask(task.id);
  }

  function disposeTask(task: Task, disposition: "BLOCKED" | "DROPPED") {
    setTaskDisposition(
      { taskId: task.id, disposition, decidedOnDate: today, decidedAt: new Date().toISOString(), note: null },
      task.id
    );
    setCompletingTask(null);
  }

  function decideCarryover(taskId: string, disposition: CarryoverDisposition, toDate: string | null) {
    recordCarryover(yesterday, taskId, disposition, toDate);
    setReschedulingTaskId(null);
    setRescheduleDateValue("");
  }

  // Task ≠ Time (PRD.md §27): a Task scheduled today via a real TimeBlock
  // counts as today's work even if its own workDate/deadline points
  // elsewhere — the TimeBlock is the stronger, more current signal. Also
  // includes any Task re-placed onto today via a Carryover decision (§10).
  const planBlocks = useMemo(
    () => liveTimeBlocks({ timeBlockOverrides, supersededBlockIds }),
    [timeBlockOverrides, supersededBlockIds]
  );
  const activeTimeBlocksToday = useMemo(() => planBlocks.filter((tb) => tb.date === today), [planBlocks, today]);
  const scheduledTaskIds = useMemo(() => new Set(activeTimeBlocksToday.map((tb) => tb.taskId)), [activeTimeBlocksToday]);

  // 2026-09-08 (§2): only committed work is today's work. A BACKLOG Task whose
  // deadline happens to land today has no decided execution time and must not
  // be counted in today's progress or listed as something to do now.
  const todayTasks = useMemo(
    () =>
      tasksEffectiveOnDate(
        today,
        allTasks.filter((t) => isTaskCommitted(t, { lifecycleOverrides })),
        planBlocks,
        workDateOverrides
      ),
    [today, workDateOverrides, lifecycleOverrides, planBlocks]
  );

  /**
   * 完了したあとに必ず通る処理 (§37/§51/§52)。
   *
   * Timelineから完了しても期限超過Inboxから完了しても同じ体験になるように、
   * ここへ集約する。分かれていたせいで、期限を過ぎたTaskだけ実績を聞かれず、
   * PDCAの入力が永久に埋まらなかった。
   */
  function afterComplete(
    task: Task,
    record: TaskCompletionRecord,
    remaining: number,
    nextTitle: string | null
  ) {
    const proposal = proposeEstimate(task, allTasks, { ...completions, [task.id]: record });
    setCompletionFeedback(
      buildCompletionFeedback({
        task,
        record,
        salesCoverage: task.linkedSalesMaster ? phaseCoverage(salesPhases, phaseOwnVersions) : null,
        remainingToday: remaining,
        nextTaskTitle: nextTitle,
        streakDays: streak.days,
        nextEstimate: proposal
          ? { minutes: proposal.suggestedMinutes, confidence: CONFIDENCE_LABEL[proposal.confidence] }
          : null,
      })
    );
    fireCompletionCelebration(task);
    // Timerを使っていないと実績が空のままになる。完了直後にだけ聞く。
    // 答えないのも正しい選択なのでSkipできる。
    if (record.actualMinutes === null) setAskActualTask(task);
  }

  function confirmComplete(task: Task, metDefinitionOfDone: boolean) {
    if (startedTaskId === task.id) endWork(task.id, "COMPLETE");
    const record = buildCompletionRecord(task, {
      today,
      startedIso: taskStartedAt.get(task.id),
      metDefinitionOfDone,
      deadlineOverrides,
    });
    setTaskCompletedAt((prev) => new Map(prev).set(task.id, new Date().toISOString()));
    completeTask(record);
    setCompletingTask(null);

    // §49: say what actually changed — figures, not praise. Everything here
    // comes from the record and the real remaining plan; nothing invented.
    const remaining = todayTasks.filter((t) => t.id !== task.id && !isDone(t)).length;
    const next = todayTasks.find((t) => t.id !== task.id && !isDone(t)) ?? null;
    afterComplete(task, record, remaining, next?.title ?? null);
  }

  // OVERDUE is derived (期限 < 今日 かつ 未完了 かつ 未DROP), never a stored
  // status — so completing a late Task removes it here immediately.
  const overdue = useMemo(
    () => computeOverdueTasks(allTasks, today, overlays),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [today, completions, dispositions, deadlineOverrides, workDateOverrides]
  );

  const upcomingTasks = useMemo(() => {
    const todayIds = new Set(todayTasks.map((t) => t.id));
    return allTasks.filter((t) => {
      if (!isTaskOpen(t, overlays) || todayIds.has(t.id)) return false;
      const deadline = effectiveDeadline(t, overlays);
      if (deadline === null) return false;
      const diff = daysBetween(today, deadline);
      return diff >= 1 && diff <= 2;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayTasks, today, completions, dispositions, deadlineOverrides]);

  // --- Day Rollover: Yesterday Summary / Carryover (2026-09-06) ---
  // Not useMemo'd: these are cheap array scans over a small fixed fixture,
  // and wrapping them tripped the React Compiler's memoization-preservation
  // check (it couldn't verify `yesterday`/`carryover` as stable dependency
  // identities) without any real performance benefit.
  const yesterday = addDaysToYmd(today, -1);
  const yesterdayRecord = history[yesterday] ?? null;
  const yesterdayScheduledTasks = tasksScheduledOnDate(yesterday, allTasks, planBlocks);
  const yesterdayCompletedCount = yesterdayRecord?.completedTaskIds.length ?? 0;
  const yesterdayTotalCount = yesterdayScheduledTasks.length;
  const yesterdayActualMinutesTotal = yesterdayRecord
    ? yesterdayRecord.taskActualMinutes.reduce((sum, [, m]) => sum + m, 0)
    : 0;
  // A Task from yesterday's plan that wasn't completed and has no Carryover
  // decision yet (§7-9) — never auto-moved, never silently dropped. The
  // currently-STARTED Task is excluded here even if it's technically
  // "incomplete since yesterday" — it already gets its own cross-midnight
  // banner (完了／中断／今日へ継続), so showing it a second time in this
  // list with a different action set (今日やる／別日に移す／やめる) would
  // just be a confusing double prompt for the same Task.
  //
  // §1: a day from before the Execution Baseline never carries over. Those
  // days ran without a real plan, so their "incomplete" list is not a set of
  // decisions the user still owes — dragging it into today would recreate
  // exactly the pile this round is clearing.
  const carryoverPendingTasks =
    yesterdayRecord && !isBeforeBaseline(yesterday)
      ? pendingCarryoverTasks(
          yesterday,
          allTasks,
          planBlocks,
          new Set(yesterdayRecord.completedTaskIds),
          carryover
        ).filter((t) => t.id !== startedTaskId && isTaskOpen(t, overlays))
      : [];

  // A Task STARTED on a previous day and still not resolved — Plan/Actual
  // are never conflated and it's never auto-completed/reset/dropped (§4);
  // the user explicitly chooses 完了／中断／今日へ継続.
  const startedTask = startedTaskId ? allTasks.find((t) => t.id === startedTaskId) ?? null : null;
  const startedAcrossMidnight = startedTask !== null && startedTaskDate !== null && startedTaskDate !== today;

  // Scheduled (has a TimeBlock today) done Tasks stay visible inline in the
  // Timeline, dimmed — they must not also appear in this footer, or a
  // completed scheduled Task would show twice.
  const doneTodayTasks = useMemo(
    () => todayTasks.filter((t) => isDone(t) && !scheduledTaskIds.has(t.id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [todayTasks, done, completions, scheduledTaskIds]
  );
  const [doneListOpen, setDoneListOpen] = useState(false);

  // §16: the clock comes from ClockProvider so TODAY and TASK MAP always
  // agree on "now". It starts at a placeholder and the real time arrives in
  // an effect — this page is statically prerendered, so reading the wall
  // clock during render would bake the build machine's time into the HTML.
  const { nowHmValue } = useClock();

  const fixedEventsToday = useMemo(
    () => fixedCalendarEvents.filter((e) => e.startDate <= today && e.endDate >= today),
    [today]
  );
  const fixedEventsAllDayToday = useMemo(() => fixedEventsToday.filter((e) => e.startTime === null), [fixedEventsToday]);

  // §5/§6: 実行順が予定と変わったとき、Calendarをどう直せばいいか。
  // 開始時刻は保存済みのISOから読む（render中に時計を呼ばない）。
  const startedAtHm = useMemo(() => {
    if (!startedTaskId) return null;
    const iso = taskStartedAt.get(startedTaskId);
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }, [startedTaskId, taskStartedAt]);

  // §1: 今日の時間割の第一SourceはGoogle Calendar。OSはその上に重ねる。
  // 最初の描画はSnapshotから同期的に作られるので、開いた瞬間に予定が出る。
  const calendar = useCalendarDay(today, today);
  const day = useMemo(
    () =>
      buildCalendarDay({
        date: today,
        events: calendar.events,
        planBlocks,
        tasks: allTasks,
        nowHm: nowHmValue,
        startedTaskId,
      }),
    [today, calendar.events, planBlocks, nowHmValue, startedTaskId]
  );
  const timeline = day.timed;

  // A STARTED Task with no TimeBlock today (started from the 時間未定 list,
  // or from an overdue/upcoming Task) has nowhere to render inside the
  // time-sorted Timeline — pin it above instead, rather than silently
  // dropping the fact that it's the one actually being worked on right now.
  // A Task started on a *previous* day gets its own cross-midnight banner
  // (with 完了／中断／今日へ継続) instead — never both at once.
  const pinnedNowTask =
    startedTask && !startedAcrossMidnight && !scheduledTaskIds.has(startedTask.id) && !isDone(startedTask)
      ? startedTask
      : null;
  const pinnedNowStartedIso = pinnedNowTask ? taskStartedAt.get(pinnedNowTask.id) : undefined;
  const pinnedNowElapsedMinutes = pinnedNowStartedIso ? minutesSince(pinnedNowStartedIso) : null;
  const startedAcrossMidnightElapsedIso = startedAcrossMidnight && startedTaskId ? taskStartedAt.get(startedTaskId) : undefined;
  const startedAcrossMidnightElapsedMinutes = startedAcrossMidnightElapsedIso
    ? minutesSince(startedAcrossMidnightElapsedIso)
    : null;

  // Where to draw the "──── NOW hh:mm ────" divider: right before the NOW
  // slot if one exists, else right before the next upcoming slot, else at
  // the end (today's schedule is entirely in the past).
  // §8: a card that was just moved to another day stays on screen for one
  // short beat, marked as leaving, instead of blinking out. Nothing here
  // delays the state change itself — TODAY is already correct.
  const { rendered: timelineRows, departing: departingKeys } = useDeparting(timeline, entryKey);

  // Indexed against the rows actually rendered, so a departing card above the
  // divider does not shove it out of place for the length of the animation.
  const nowIndicatorIndex = useMemo(() => {
    const nowIdx = timelineRows.findIndex((it) => it.status === "NOW");
    if (nowIdx !== -1) return nowIdx;
    const nextIdx = timelineRows.findIndex((it) => it.status === "NEXT" || it.status === "LATER");
    return nextIdx !== -1 ? nextIdx : timelineRows.length;
  }, [timelineRows]);

  // HTMLElement (not HTMLLIElement) so the same ref can point at either the
  // <li> inside the time-sorted Timeline or the pinned <div> above it —
  // whichever is actually rendering the current NOW task.
  const nowCardRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    nowCardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  // §2 (2026-09-08): "今日やるTaskなのに時間未定" is no longer a state this
  // app displays. A Task without a decided time is BACKLOG and belongs on
  // TASK MAP, not here. This list therefore only ever holds a genuine plan
  // error — an ACTIVE Task whose TimeBlock went missing — and says so
  // instead of quietly presenting it as today's work.
  const unscheduledTodayTasks = useMemo(
    () =>
      todayTasks.filter(
        (t) =>
          !scheduledTaskIds.has(t.id) &&
          !isDone(t) &&
          t.id !== startedTaskId &&
          isTaskCommitted(t, { lifecycleOverrides })
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [todayTasks, scheduledTaskIds, done, completions, startedTaskId, lifecycleOverrides]
  );

  // §13/§14: only blocks of 60min+ that actually have an authored runbook.

  const preparationCountByTaskId = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of allTasks) {
      if (!t.preparationForTaskId) continue;
      map.set(t.preparationForTaskId, (map.get(t.preparationForTaskId) ?? 0) + 1);
    }
    return map;
  }, []);

  const doneCount = todayTasks.filter((t) => isDone(t)).length;
  const totalCount = todayTasks.length;
  const pct = totalCount === 0 ? 0 : Math.round((doneCount / totalCount) * 100);
  const recurringDoneCount = recurringRules.filter((r) => recurringDone.has(r.id)).length;

  // 今日の実行サマリー (§14): every number below is a plain count over real
  // data — no opaque score. A Task completed after its deadline counts as
  // completed here (the delay is recorded separately on its completion
  // record), so the figure can't be dragged down by work that's actually
  // finished.
  const todayEstimateMinutes = todayTasks.reduce((sum, t) => sum + (t.estimateMinutes ?? 0), 0);
  const todayActualMinutes = todayTasks.reduce((sum, t) => sum + (taskActualMinutes.get(t.id) ?? 0), 0);
  const todayLateCompletions = todayTasks.filter((t) => (completions[t.id]?.delayDays ?? 0) > 0).length;

  function fireCompletionCelebration(task: Task) {
    if (totalCount > 0 && doneCount + 1 === totalCount) {
      fireCelebration({ kind: "today" }, 1100);
      return;
    }
    const goal = task.goalId ? goals.find((g) => g.id === task.goalId) : null;
    if (goal) {
      const linked = allTasks.filter((t) => t.goalId === goal.id);
      const doneAmongLinked = linked.filter((t) => t.id === task.id || isDone(t)).length;
      const total = linked.length;
      const goalPct = total === 0 ? 0 : Math.round((doneAmongLinked / total) * 100);
      fireCelebration(
        {
          kind: "goal",
          goalTitle: goal.title,
          desiredState: goal.desiredState,
          achievementCriteria: goal.achievementCriteria,
          done: doneAmongLinked,
          total,
          pct: goalPct,
        },
        2600
      );
    } else {
      fireCelebration({ kind: "simple" }, 1000);
    }
  }

  function toggleRecurring(id: string) {
    const completing = !recurringDone.has(id);
    let willAllBeDone = false;
    setRecurringDone((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      willAllBeDone = recurringRules.every((r) => next.has(r.id));
      return next;
    });
    if (!completing) return;
    if (willAllBeDone) {
      const areas = new Set(recurringRules.map((r) => r.area));
      const label = areas.size === 1 ? `今日の${[...areas][0]}習慣を完了しました` : "今日の積み上げを完了しました";
      fireCelebration({ kind: "recurring", total: recurringRules.length, label }, 2200);
    } else {
      fireCelebration({ kind: "simple" }, 1000);
    }
  }

  return (
    <div className="flex flex-col">
      <header className="sticky top-0 z-10 bg-gradient-to-b from-background via-background to-transparent px-5 pb-2 pt-6">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs font-bold tracking-widest text-accent-dark">AI WORK OS</p>
            <h1 className="mt-0.5 flex items-center gap-2 text-[26px] font-black tracking-tight">
              <span className="text-2xl">☀</span> TODAY
            </h1>
            {/* Execution Baseline (§1/§28): 9/8 is DAY 1. Everything before it
                was the period while this OS was being built, and its numbers
                are not counted as execution. */}
            {dayNumber !== null && (
              <p className="mt-1 text-[11px] font-black tracking-widest text-stone-400">
                DAY {dayNumber}
                {streak.days > 0 && <span className="ml-2 text-accent-dark">・{streak.days}日連続</span>}
                {streak.days > 0 && !streak.todayCounted && (
                  <span className="ml-1 font-bold text-stone-300">（今日はまだ）</span>
                )}
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="tabular-nums text-2xl font-black">{formatMd(today)}</p>
            <p className="text-xs font-medium text-stone-400">{weekday}曜日</p>
          </div>
        </div>
      </header>

      {/* Desktop TODAY (2026-09-06): NOW/NEXT/Timeline stay left/main;
          Daily Stack, Carryover, Yesterday Summary, and the Deadline Alert
          move to a right rail — but only via lg:col-start on each section
          below, never by reordering the DOM, so mobile's exact current
          stacking order (今日の前進→毎日の積み上げ→Timeline→Carryover→
          Yesterday→期限超過) is completely untouched. */}
      <div className="lg:grid lg:grid-cols-[1fr_360px] lg:items-start lg:gap-x-6">
      <section className="mx-5 mt-1 rounded-3xl bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,0,0,0.12)] lg:col-start-1">
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-bold text-stone-800">今日の前進</p>
          <p className="tabular-nums text-xs font-bold text-stone-400">
            <span className="text-base text-accent-dark">{doneCount}</span> / {totalCount} 完了
          </p>
        </div>
        <div className="mt-2.5 flex items-center gap-3">
          <ProgressBar pct={pct} />
          <span className="tabular-nums w-10 shrink-0 text-right text-lg font-black text-accent-dark">{pct}%</span>
        </div>
        {totalCount - doneCount > 0 && (
          <p className="mt-1.5 text-[11px] font-medium text-stone-400">残り{totalCount - doneCount}件</p>
        )}

        {/* Explainable summary (§14): the percentage above is just
            完了数÷予定数 over today's real Tasks. Opening this shows every
            number it's made of, so it's never an opaque score — and a Task
            completed after its deadline counts as completed (the delay is
            recorded separately, not as a penalty that can't be cleared). */}
        <button
          type="button"
          onClick={() => setSummaryOpen((v) => !v)}
          className="mt-2 text-[10px] font-bold text-stone-400"
        >
          内訳 {summaryOpen ? "▾" : "▸"}
        </button>
        {summaryOpen && (
          <dl className="mt-1.5 flex flex-col gap-1 rounded-xl bg-stone-50 px-3 py-2.5 text-[11px]">
            <SummaryRow label="今日の予定Task" value={`${totalCount}件`} />
            <SummaryRow label="完了" value={`${doneCount}件`} />
            <SummaryRow label="未完了" value={`${totalCount - doneCount}件`} />
            <SummaryRow
              label="予定時間"
              value={todayEstimateMinutes > 0 ? formatDurationHm(todayEstimateMinutes) : "未設定"}
            />
            <SummaryRow
              label="実績時間"
              value={todayActualMinutes > 0 ? formatDurationHm(todayActualMinutes) : "未計測"}
            />
            <SummaryRow label="期限超過（未処理）" value={`${overdue.length}件`} />
            {todayLateCompletions > 0 && (
              <SummaryRow label="期限後に完了" value={`${todayLateCompletions}件`} />
            )}
            <p className="mt-1 text-[10px] leading-relaxed text-stone-400">
              {pct}% ＝ 完了{doneCount} ÷ 予定{totalCount}。期限後に完了したTaskも完了として数え、遅延は実績として別に記録します。
            </p>
          </dl>
        )}
      </section>

      {recurringRules.length > 0 && (
        <section className="mx-5 mt-3 rounded-2xl bg-white px-4 py-3 shadow-sm lg:col-start-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-stone-500">毎日の積み上げ</p>
            <p className="tabular-nums text-xs font-bold text-stone-400">
              {recurringDoneCount} / {recurringRules.length}
            </p>
          </div>
          <ul className="mt-2 flex flex-col gap-1">
            {recurringRules.map((r) => {
              const checked = recurringDone.has(r.id);
              return (
                <li key={r.id} className="flex items-center gap-2 py-1">
                  <button
                    type="button"
                    onClick={() => toggleRecurring(r.id)}
                    aria-label="完了にする"
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 text-[8px] transition-colors ${
                      checked ? "border-accent bg-accent text-white" : "border-stone-200 text-transparent"
                    }`}
                  >
                    ✓
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedRecurring(r)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <span className={`truncate text-[13px] font-medium ${checked ? "text-stone-300 line-through" : "text-stone-600"}`}>
                      {r.title}
                    </span>
                    {(() => {
                      // §28: counted from real history since the Execution
                      // Baseline, never from the fixture's streakDays.
                      const rs = executionStreak(today, (d) =>
                        d === today
                          ? recurringDone.has(r.id)
                          : (history[d]?.recurringDone ?? []).includes(r.id)
                      );
                      return rs.days > 0 ? (
                        <span className="ml-auto shrink-0 text-[10px] font-bold text-accent-dark">
                          {rs.days}日連続
                        </span>
                      ) : null;
                    })()}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <CalendarSyncStrip
        todayBlocks={activeTimeBlocksToday}
        startedTaskId={startedTaskId}
        startedAtHm={startedAtHm}
        startedMinutes={startedTaskId ? bankedMinutes(startedTaskId) : 0}
      />

      <section className="px-5 pt-4 lg:col-start-1">
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-bold text-stone-800">今日のTimeline</h2>
          <div className="text-right text-[10px] font-bold text-stone-500">
            <p role="status" aria-live="polite">{calendar.loading ? "Calendar取得中…" : calendarFreshnessLabel(calendar)}</p>
            {calendar.authRequired ? <Link href="/area/riala" className="underline">Calendarを読むためにログイン</Link> : (
              <button type="button" onClick={calendar.refresh} disabled={calendar.loading} title={calendar.fallbackReason ?? "Google Calendarを読み直す"}
                className="mt-0.5 underline disabled:opacity-50">Calendar更新 ⟳</button>
            )}
          </div>
        </div>

        {/* §9: 終日イベント（読了期限など）は時間の枠を持たないので、
            Timelineへ差し込まず見出しの下に置く。 */}
        {(day.deadlines.length > 0 || fixedEventsAllDayToday.length > 0) && (
          <div className="mb-2.5">
            <p className="text-[10px] font-black tracking-widest text-stone-400">TODAY DEADLINES</p>
            <ul className="mt-1 flex flex-col gap-0.5">
              {day.deadlines.map((d) => (
                <li key={d.key} className="text-[11px] font-bold leading-snug text-stone-500">
                  ・{d.title}
                </li>
              ))}
              {fixedEventsAllDayToday.map((e) => (
                <li key={e.id} className="text-[11px] font-bold leading-snug text-stone-500">
                  ・{e.title}
                </li>
              ))}
            </ul>
          </div>
        )}

        {startedAcrossMidnight && startedTask && (
          <div ref={nowCardRef as React.Ref<HTMLDivElement>} className="mb-2">
            <CrossMidnightBanner
              task={startedTask}
              elapsedMinutes={startedAcrossMidnightElapsedMinutes}
              startedDate={startedTaskDate}
              onComplete={() => requestComplete(startedTask)}
              onInterrupt={() => setStartedTaskId(null)}
              onContinueToday={continueStartedTaskToday}
              onOpen={() => setSelectedTask(startedTask)}
            />
          </div>
        )}

        {pinnedNowTask && (
          <div ref={nowCardRef as React.Ref<HTMLDivElement>} className="mb-2">
            <PinnedNowCard
              task={pinnedNowTask}
              elapsedMinutes={pinnedNowElapsedMinutes}
              onComplete={() => requestComplete(pinnedNowTask)}
              onOpen={() => setSelectedTask(pinnedNowTask)}
              preparationCount={preparationCountByTaskId.get(pinnedNowTask.id) ?? 0}
            />
          </div>
        )}

        {timeline.length === 0 &&
        unscheduledTodayTasks.length === 0 &&
        doneTodayTasks.length === 0 &&
        !pinnedNowTask &&
        !startedAcrossMidnight ? (
          <EmptyState icon="🌤" text="今日の予定はまだありません" />
        ) : (
          <div className="flex flex-col gap-5">
            {timeline.length > 0 && (
              <ul className="flex flex-col gap-2">
                {timelineRows.map((entry, i) => (
                  <FragmentWithIndicator
                    key={entry.key}
                    showIndicator={i === nowIndicatorIndex}
                    nowHmValue={nowHmValue}
                    leaving={departingKeys.has(entry.key)}
                  >
                    {/* §8: Calendarの時刻に、OSのTask（DoD/Why）を重ねる。
                        Taskが無い予定は偽Task化せず、そのまま予定として出す。 */}
                    {entry.task !== null ? (
                      <TimelineTaskCard
                        item={{
                          kind: "task",
                          startTime: entry.startTime ?? "00:00",
                          endTime: entry.endTime ?? "00:00",
                          timeBlock: entry.timeBlock ?? placeholderBlock(entry),
                          task: entry.task,
                          status: entry.status,
                        }}
                        checked={isDone(entry.task)}
                        started={startedTaskId === entry.task.id}
                        actualMinutes={taskActualMinutes.get(entry.task.id) ?? null}
                        nowHmValue={nowHmValue}
                        runbook={entry.timeBlock ? runbookFor(entry.timeBlock) : null}
                        pendingCalendar={entry.role === "OS_PENDING_CALENDAR"}
                        osTimeWas={entry.osTimeWas}
                        onStart={() => requestStart(entry.task!.id)}
                        onComplete={() => requestComplete(entry.task!)}
                        onUndo={() => undoComplete(entry.task!)}
                        onOpen={() => setSelectedTask(entry.task!)}
                        onEditActual={() => setActualEditTask(entry.task!)}
                        preparationCount={preparationCountByTaskId.get(entry.task.id) ?? 0}
                        nowRef={entry.status === "NOW" ? nowCardRef : undefined}
                      />
                    ) : (
                      <CalendarOnlyCard entry={entry} />
                    )}
                  </FragmentWithIndicator>
                ))}
                {nowIndicatorIndex === timelineRows.length && <NowIndicator nowHmValue={nowHmValue} />}
              </ul>
            )}

            {unscheduledTodayTasks.length > 0 && (
              <div>
                <p className="mb-1.5 rounded-xl bg-danger-soft px-3 py-2 text-[11px] font-bold leading-relaxed text-danger">
                  ⚠ 実行時間が決まっていないのに実行計画へ入っているTaskが{unscheduledTodayTasks.length}件あります。
                  時間を決めるか、Backlogへ戻してください。
                </p>
                <ul className="flex flex-col gap-2">
                  {unscheduledTodayTasks.map((t) => (
                    <TaskRow
                      key={t.id}
                      task={t}
                      today={today}
                      checked={false}
                      started={false}
                      onStart={() => requestStart(t.id)}
                      onOpen={() => setSelectedTask(t)}
                      preparationCount={preparationCountByTaskId.get(t.id) ?? 0}
                    />
                  ))}
                </ul>
              </div>
            )}

            {doneTodayTasks.length > 0 && (
              <div>
                <button
                  type="button"
                  onClick={() => setDoneListOpen((v) => !v)}
                  className="text-[11px] font-bold text-stone-400"
                >
                  完了（{doneTodayTasks.length}） {doneListOpen ? "▾" : "▸"}
                </button>
                {doneListOpen && (
                  <ul className="mt-2 flex flex-col gap-2">
                    {doneTodayTasks.map((t) => (
                      <TaskRow
                        key={t.id}
                        task={t}
                        today={today}
                        checked={true}
                        started={false}
                        onStart={() => {}}
                        onUndo={() => undoComplete(t)}
                        onOpen={() => setSelectedTask(t)}
                        preparationCount={preparationCountByTaskId.get(t.id) ?? 0}
                      />
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      {carryoverPendingTasks.length > 0 && (
        <section className="mx-5 mt-3 lg:col-start-2">
          <div className="rounded-2xl bg-white px-4 py-3 shadow-sm">
            <p className="text-xs font-bold text-stone-500">
              昨日の未完了 <span className="text-stone-800">{carryoverPendingTasks.length}件</span>・行き先未決定
            </p>
            <ul className="mt-2 flex flex-col gap-2">
              {carryoverPendingTasks.map((t) => (
                <li key={t.id} className="rounded-xl bg-stone-50 px-3 py-2.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-[13px] font-bold text-stone-700">{t.title}</p>
                    <span className="shrink-0 text-[10px] font-bold text-stone-400">期限 {formatMd(t.deadline)}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => decideCarryover(t.id, "MOVED_TODAY", today)}
                      className="rounded-full bg-accent px-3 py-1 text-[11px] font-bold text-white"
                    >
                      今日やる
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setReschedulingTaskId(reschedulingTaskId === t.id ? null : t.id);
                        setRescheduleDateValue("");
                      }}
                      className="rounded-full bg-stone-100 px-3 py-1 text-[11px] font-bold text-stone-600"
                    >
                      別日に移す
                    </button>
                    <button
                      type="button"
                      onClick={() => decideCarryover(t.id, "DROPPED", null)}
                      className="rounded-full bg-stone-100 px-3 py-1 text-[11px] font-bold text-stone-400"
                    >
                      今回はやめる
                    </button>
                  </div>
                  {reschedulingTaskId === t.id && (
                    <div className="mt-2 flex items-center gap-1.5">
                      <input
                        type="date"
                        value={rescheduleDateValue}
                        min={today}
                        onChange={(e) => setRescheduleDateValue(e.target.value)}
                        className="rounded-lg border border-stone-200 px-2 py-1 text-[12px] text-stone-700"
                      />
                      <button
                        type="button"
                        disabled={!rescheduleDateValue}
                        onClick={() => decideCarryover(t.id, "RESCHEDULED", rescheduleDateValue)}
                        className={`rounded-full px-3 py-1 text-[11px] font-bold ${
                          rescheduleDateValue ? "bg-accent text-white" : "bg-stone-100 text-stone-300"
                        }`}
                      >
                        移動
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {yesterdayRecord && (
        <section className="mx-5 mt-3 lg:col-start-2">
          <button
            type="button"
            onClick={() => setYesterdaySummaryOpen((v) => !v)}
            className="flex w-full items-center gap-2 rounded-2xl bg-white px-4 py-2.5 text-left shadow-sm"
          >
            <span className="text-xs font-bold text-stone-500">
              昨日の頑張り　{yesterdayCompletedCount}/{yesterdayTotalCount} Task完了
            </span>
            <span className={`ml-auto text-[9px] text-stone-300 transition-transform ${yesterdaySummaryOpen ? "rotate-180" : ""}`}>
              ▾
            </span>
          </button>
          {yesterdaySummaryOpen && (
            <div className="mt-1.5 rounded-2xl bg-stone-50 px-4 py-3 text-[12px] text-stone-600">
              {yesterdayTotalCount > 0 && yesterdayCompletedCount === yesterdayTotalCount ? (
                <p className="font-bold text-accent-dark">昨日はすべてやり切りました ✓</p>
              ) : (
                <p>
                  Task完了 <span className="font-bold text-stone-800">{yesterdayCompletedCount}</span> /{" "}
                  {yesterdayTotalCount}
                </p>
              )}
              <p className="mt-1">
                毎日の積み上げ{" "}
                <span className="font-bold text-stone-800">{yesterdayRecord.recurringDone.length}</span> /{" "}
                {recurringRules.length}
              </p>
              {yesterdayActualMinutesTotal > 0 && (
                <p className="mt-1">
                  実行時間 <span className="font-bold text-stone-800">{formatDurationHm(yesterdayActualMinutesTotal)}</span>
                </p>
              )}
            </div>
          )}
        </section>
      )}

      {/* 期限超過Inbox (§12/§13): every overdue Task carries the full
          decision set (完了／今日やる／日付指定／Blocked／やめる) so it can
          always be resolved — this replaces the old read-only list that
          made overdue Tasks impossible to complete. */}
      {overdue.length > 0 && (
        <section className="mx-5 mt-4 lg:col-start-2">
          <OverdueInbox
              tasks={overdue}
              today={today}
              onCompleted={(task, record) => {
                const remaining = todayTasks.filter((t) => t.id !== task.id && !isDone(t)).length;
                const next = todayTasks.find((t) => t.id !== task.id && !isDone(t)) ?? null;
                afterComplete(task, record, remaining, next?.title ?? null);
              }}
            />
        </section>
      )}

      <section className="mx-5 mt-3 lg:col-start-2">
        <div className="flex items-center gap-2 rounded-2xl bg-white px-4 py-2 shadow-sm">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold text-stone-500"
          >
            ◷ 2日以内 {upcomingTasks.length}
          </button>
        </div>

        {expanded && (
          <ul className="mt-1.5 flex flex-col gap-1.5">
            {upcomingTasks.length === 0 ? (
              <li className="rounded-xl bg-stone-50 px-3 py-3 text-center text-xs text-stone-400">
                2日以内の期限タスクはありません
              </li>
            ) : (
              upcomingTasks.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2 rounded-xl bg-stone-50 px-3 py-2 text-xs">
                  <span className="truncate font-medium text-stone-600">{t.title}</span>
                  <span className="shrink-0 font-bold text-stone-500">
                    期限 {formatMd(effectiveDeadline(t, overlays))}
                  </span>
                </li>
              ))
            )}
          </ul>
        )}
      </section>
      </div>

      {completingTask && (
        <TaskCompleteDialog
          task={completingTask}
          deadlineAtCompletion={effectiveDeadline(completingTask, overlays)}
          today={today}
          onCompleteMetDoD={() => confirmComplete(completingTask, true)}
          onCompleteNoDoD={() => confirmComplete(completingTask, false)}
          onRequestReschedule={() => {
            setReschedulingTask(completingTask);
            setCompletingTask(null);
          }}
          onBlock={() => disposeTask(completingTask, "BLOCKED")}
          onDrop={() => disposeTask(completingTask, "DROPPED")}
          onCancel={() => setCompletingTask(null)}
        />
      )}

      <CelebrationToast celebration={celebration} reducedMotion={reducedMotion} />

      {reschedulingTask && (
        <RescheduleDialog
          task={reschedulingTask}
          currentBlock={currentBlockFor(reschedulingTask)}
          today={today}
          effectiveDeadline={effectiveDeadline(reschedulingTask, overlays)}
          onCancel={() => setReschedulingTask(null)}
          onConfirm={(args) => {
            const result = reschedule(reschedulingTask, { ...args, reason: "未達のため別日へ移動" });
            // P0-2: say where it went, in words, not just close the sheet.
            setCompletionFeedback({
              headline: `${formatMd(result.date)} ${result.startTime}〜${result.endTime} へ移動しました`,
              changed: [
                `${reschedulingTask.title}`,
                result.movedFrom ? `元の予定（${formatMd(result.movedFrom)}）は置き換え済み` : "新しい予定を作成",
                "Google Calendarへは未反映",
              ],
              unlocked: result.raisedReplan ? "再計画が必要として記録しました" : null,
              celebrate: "NONE",
              nextEstimate: null,
            });
            setReschedulingTask(null);
          }}
        />
      )}

      {completionFeedback && (
        <CompletionToast feedback={completionFeedback} onDismiss={() => setCompletionFeedback(null)} />
      )}

      {actualEditTask && (
        <ActualMinutesDialog
          task={actualEditTask}
          timerMinutes={bankedMinutes(actualEditTask.id) || null}
          currentActual={taskActualMinutes.get(actualEditTask.id) ?? null}
          onSave={(minutes) => {
            setManualActualMinutes(actualEditTask.id, minutes);
            setActualEditTask(null);
          }}
          onClear={() => {
            setManualActualMinutes(actualEditTask.id, null);
            setActualEditTask(null);
          }}
          onClose={() => setActualEditTask(null)}
        />
      )}

      {askActualTask && (
        <ActualMinutesDialog
          task={askActualTask}
          timerMinutes={null}
          currentActual={null}
          askMode
          onSave={(minutes) => {
            setManualActualMinutes(askActualTask.id, minutes);
            setAskActualTask(null);
          }}
          onClear={() => setAskActualTask(null)}
          onClose={() => setAskActualTask(null)}
        />
      )}

      {selectedTask && (
        <TaskDetailSheet
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          actualMinutes={taskActualMinutes.get(selectedTask.id) ?? null}
          started={startedTaskId === selectedTask.id}
          varianceReason={varianceReasonByTaskId.get(selectedTask.id) ?? null}
          onSetVarianceReason={(reason) =>
            setVarianceReasonByTaskId((prev) => new Map(prev).set(selectedTask.id, reason))
          }
          onNavigateToTask={(taskId) => {
            const t = allTasks.find((task) => task.id === taskId);
            if (t) setSelectedTask(t);
          }}
        />
      )}

      {switchConfirmTaskId &&
        (() => {
          const nextTask = allTasks.find((t) => t.id === switchConfirmTaskId);
          const currentTask = startedTaskId ? allTasks.find((t) => t.id === startedTaskId) : null;
          if (!nextTask) return null;
          return (
            <div className="fixed inset-0 z-50 flex items-end justify-center lg:items-center">
              <button
                type="button"
                aria-label="閉じる"
                onClick={() => setSwitchConfirmTaskId(null)}
                className="absolute inset-0 bg-stone-900/45"
              />
              <div className="relative w-full max-w-[430px] rounded-t-3xl bg-white p-5 shadow-2xl lg:rounded-3xl">
                <p className="text-[14px] font-black text-stone-800">実行中のTaskを中断しますか？</p>

                <div className="mt-3 flex flex-col gap-1.5">
                  {currentTask && (
                    <div
                      className="rounded-xl border px-3 py-2.5"
                      style={{
                        backgroundColor: themeFor(currentTask.area, currentTask.activityType).surface.soft,
                        borderTopColor: themeFor(currentTask.area, currentTask.activityType).surface.border,
                        borderRightColor: themeFor(currentTask.area, currentTask.activityType).surface.border,
                        borderBottomColor: themeFor(currentTask.area, currentTask.activityType).surface.border,
                        borderLeftWidth: 3,
                        borderLeftColor: themeFor(currentTask.area, currentTask.activityType).surface.primary,
                      }}
                    >
                      <p className="text-[10px] font-bold text-stone-500">いま実行中</p>
                      <p className="mt-0.5 text-[13px] font-bold text-stone-800">{currentTask.title}</p>
                      {(() => {
                        const started = taskStartedAt.get(currentTask.id);
                        const mins = bankedMinutes(currentTask.id) + (started ? minutesSince(started) : 0);
                        return mins > 0 ? (
                          <p className="mt-0.5 text-[11px] font-bold text-stone-500">実績 {mins}分</p>
                        ) : null;
                      })()}
                    </div>
                  )}
                  <div
                    className="rounded-xl border px-3 py-2.5"
                    style={{
                      backgroundColor: themeFor(nextTask.area, nextTask.activityType).surface.soft,
                      borderTopColor: themeFor(nextTask.area, nextTask.activityType).surface.border,
                      borderRightColor: themeFor(nextTask.area, nextTask.activityType).surface.border,
                      borderBottomColor: themeFor(nextTask.area, nextTask.activityType).surface.border,
                      borderLeftWidth: 3,
                      borderLeftColor: themeFor(nextTask.area, nextTask.activityType).surface.primary,
                    }}
                  >
                    <p className="text-[10px] font-bold text-stone-500">次に始める</p>
                    <p className="mt-0.5 text-[13px] font-bold text-stone-800">{nextTask.title}</p>
                  </div>
                </div>

                <p className="mt-2.5 text-[11px] leading-relaxed text-stone-500">
                  中断した時点までの実績時間は保存されます。切り替えた後の時間は新しいTaskに記録されます。
                </p>

                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setSwitchConfirmTaskId(null)}
                    className="flex-1 rounded-full bg-stone-100 py-2.5 text-[13px] font-bold text-stone-600"
                  >
                    今のTaskを続ける
                  </button>
                  <button
                    type="button"
                    onClick={confirmSwitch}
                    className="flex-1 rounded-full py-2.5 text-[13px] font-bold text-white"
                    style={{ backgroundColor: themeFor(nextTask.area, nextTask.activityType).surface.primary }}
                  >
                    切り替える
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

      {selectedRecurring && (
        <RecurringDetailSheet
          rule={selectedRecurring}
          streak={selectedRecurring.streakDays + (recurringDone.has(selectedRecurring.id) ? 1 : 0)}
          onClose={() => setSelectedRecurring(null)}
          onViewOutcome={() => {
            if (selectedRecurring.outcomeId) setOutcomeSheetId(selectedRecurring.outcomeId);
            setSelectedRecurring(null);
          }}
        />
      )}

      {outcomeSheetId &&
        (() => {
          const outcome = outcomes.find((o) => o.id === outcomeSheetId);
          return outcome ? <OutcomeDetailSheet outcome={outcome} onClose={() => setOutcomeSheetId(null)} /> : null;
        })()}
    </div>
  );
}

function CelebrationToast({
  celebration,
  reducedMotion,
}: {
  celebration: Celebration | null;
  reducedMotion: boolean;
}) {
  return (
    <div
      className={`pointer-events-none fixed inset-x-0 bottom-24 z-30 flex justify-center px-6 transition-opacity duration-300 ${
        celebration ? "opacity-100" : "opacity-0"
      }`}
    >
      {celebration?.kind === "simple" && (
        <div className="rounded-full bg-stone-900 px-4 py-2 text-xs font-bold text-white shadow-lg">
          完了！今日も1つ前進
        </div>
      )}

      {celebration?.kind === "goal" && (
        <div className="relative w-full max-w-xs overflow-visible rounded-2xl bg-stone-900 px-4 py-3.5 text-white shadow-xl">
          {celebration.pct >= 100 ? (
            <>
              {!reducedMotion && <Confetti count={14} />}
              <p className="text-center text-lg">🎉</p>
              <p className="mt-1 text-center text-[13px] font-black">{celebration.goalTitle} 達成</p>
              <p className="mt-1 text-center text-[11px] leading-relaxed text-stone-300">
                「{celebration.achievementCriteria}」の達成基準を満たしました。
              </p>
            </>
          ) : (
            <>
              <p className="text-center text-[13px] font-bold">
                「{celebration.goalTitle}」が {celebration.done} / {celebration.total} まで進みました
              </p>
              <div className="mt-2">
                <ProgressBar pct={celebration.pct} size="sm" />
              </div>
              <p className="mt-2 text-center text-[11px] text-stone-300">
                あと{celebration.total - celebration.done}つで「{celebration.desiredState}」
              </p>
            </>
          )}
        </div>
      )}

      {celebration?.kind === "recurring" && (
        <div className="relative w-full max-w-xs overflow-visible rounded-2xl bg-stone-900 px-4 py-3.5 text-center text-white shadow-xl">
          {!reducedMotion && <Confetti count={12} />}
          <p className="text-lg">🎉</p>
          <p className="mt-1 text-[13px] font-black">{celebration.label}</p>
          <p className="mt-1 text-[11px] text-stone-300">
            毎日の積み上げ {celebration.total} / {celebration.total}
          </p>
        </div>
      )}

      {celebration?.kind === "today" && (
        <div className="relative w-full max-w-xs overflow-visible rounded-2xl bg-accent px-5 py-4 text-center text-white shadow-xl">
          {!reducedMotion && <Confetti count={18} />}
          <p className="text-2xl">🎉</p>
          <p className="mt-1 text-[15px] font-black">今日のタスク 100%</p>
          <p className="mt-1 text-[11px] text-white/80">今日もやりきりました。</p>
        </div>
      )}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-stone-500">{label}</dt>
      <dd className="tabular-nums font-bold text-stone-700">{value}</dd>
    </div>
  );
}

function EmptyState({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-3xl border border-dashed border-stone-200 py-10 text-center">
      <span className="text-3xl">{icon}</span>
      <p className="text-sm text-stone-400">{text}</p>
    </div>
  );
}

const timelineStatusLabel: Record<string, string> = { NOW: "NOW", NEXT: "NEXT", PAST: "", LATER: "" };

/**
 * CalendarにあるがOS側のTimeBlockが無いTask用の、表示専用の枠。
 * 保存しない・実行状態を持たない——TimelineTaskCardが時刻を読むためだけの器。
 */
function placeholderBlock(entry: DayEntry): TimeBlock {
  return {
    id: `cal-${entry.key}`,
    taskId: entry.task?.id ?? null,
    recurringRuleId: null,
    label: entry.title,
    date: "",
    startTime: entry.startTime ?? "00:00",
    endTime: entry.endTime ?? "00:00",
    status: "PLANNED",
    calendarSyncEnabled: true,
    calendarEventId: entry.key,
    source: "USER",
    lifecycle: "ACTIVE",
    supersededReason: null,
    supersededOn: null,
    executionEnvironment: "ANY",
  };
}

/** DayEntryは自分でkeyを持っている（Calendarのevent id、またはOSのblock id）。 */
function entryKey(entry: DayEntry): string {
  return entry.key;
}

function FragmentWithIndicator({
  showIndicator,
  nowHmValue,
  leaving = false,
  children,
}: {
  showIndicator: boolean;
  nowHmValue: string;
  /** True while this row is animating out after being moved to another day. */
  leaving?: boolean;
  children: React.ReactNode;
}) {
  return (
    <>
      {showIndicator && <NowIndicator nowHmValue={nowHmValue} />}
      {leaving ? (
        <div
          aria-hidden
          className="pointer-events-none -translate-x-3 opacity-0 transition-all ease-out motion-reduce:transition-none"
          style={{ transitionDuration: `${DEPART_MS}ms` }}
        >
          {children}
        </div>
      ) : (
        children
      )}
    </>
  );
}

// nowHmValue is passed in (from the page's hydration-safe state) rather
// than calling nowHm() here — this component renders during the server's
// static prerender too, and calling a wall-clock function directly in JSX
// would bake in the build-time clock, mismatching the client's real clock
// on hydration (the same class of bug fixed for nowHmValue's own useState).
function NowIndicator({ nowHmValue }: { nowHmValue: string }) {
  return (
    <li aria-hidden className="flex items-center gap-2 px-0.5 py-0.5 text-[10px] font-black text-accent-dark">
      <span className="h-px flex-1 bg-accent" />
      NOW {nowHmValue}
      <span className="h-px flex-1 bg-accent" />
    </li>
  );
}

// Task状態を一目で分かる形にする（PRD.md §29「3. Task状態を直感的にする」）：
// ○（未着手・タップで今から開始）→ ▶（実行中・タップで完了）→ ✓（完了・タップ
// で取り消し）。取り消し線や大量のBadgeは使わず、この1ボタンの状態遷移だけで
// 表現する。
type ExecState = "NOT_STARTED" | "STARTED" | "DONE";

function execStateOf(checked: boolean, started: boolean): ExecState {
  if (checked) return "DONE";
  if (started) return "STARTED";
  return "NOT_STARTED";
}

function TaskStateButton({
  state,
  onStart,
  onComplete,
  onUndo,
}: {
  state: ExecState;
  onStart: () => void;
  onComplete: () => void;
  onUndo: () => void;
}) {
  if (state === "DONE") {
    return (
      <button
        type="button"
        onClick={onUndo}
        aria-label="完了を取り消す"
        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-accent bg-accent text-xs text-white transition-all duration-150 active:scale-90"
      >
        ✓
      </button>
    );
  }
  if (state === "STARTED") {
    return (
      <button
        type="button"
        onClick={onComplete}
        aria-label="完了にする"
        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-accent bg-accent-soft text-[9px] text-accent-dark transition-all duration-150 active:scale-90"
      >
        ▶
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onStart}
      aria-label="今から開始"
      className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-stone-200 text-transparent transition-all duration-150 active:scale-90"
    >
      ✓
    </button>
  );
}

function TimelineTaskCard({
  item,
  checked,
  started,
  actualMinutes,
  nowHmValue,
  runbook,
  pendingCalendar = false,
  osTimeWas = null,
  onStart,
  onComplete,
  onUndo,
  onOpen,
  onEditActual,
  preparationCount,
  nowRef,
}: {
  item: Extract<TimelineItem, { kind: "task" }>;
  checked: boolean;
  started: boolean;
  actualMinutes: number | null;
  nowHmValue: string;
  runbook: SessionRunbook | null;
  /** Calendarにまだ枠が無い（OS側だけで動かした直後）。 */
  pendingCalendar?: boolean;
  /** Calendarの時刻を採用した結果、OSが持っていた古い時刻。 */
  osTimeWas?: { startTime: string; endTime: string } | null;
  onStart: () => void;
  onComplete: () => void;
  onUndo: () => void;
  onOpen: () => void;
  /** §29: 完了カードから直接、実績時間を直す。 */
  onEditActual: () => void;
  preparationCount: number;
  nowRef?: React.RefObject<HTMLElement | null>;
}) {
  const { task, startTime, endTime, status } = item;
  const isNow = status === "NOW";
  const isPast = status === "PAST";
  // "focused" = the card showing the execution-detail row and remaining-time
  // badge — either it's the time-based NOW slot, or the user actually
  // pressed 今から開始 on it (which can happen on any NEXT/LATER/PAST card).
  const isFocused = isNow || started;
  const execState = execStateOf(checked, started);
  const variance =
    checked && actualMinutes !== null ? computeVariance(task.estimateMinutes, actualMinutes) : null;
  // nowHmValue comes from the page's hydration-safe state, not a direct
  // nowHm() call here — see NowIndicator's comment for why that matters.
  const remaining = isFocused ? minutesUntil(endTime, nowHmValue) : null;
  // §35: the surface colour is the Activity's when it has one (reading is
  // yellow), otherwise the Area's — matching TASK MAP, Area Home and the
  // Google Calendar colour ids.
  const { surface, area: areaTheme } = themeFor(task.area, task.activityType);

  return (
    <li
      ref={nowRef as React.Ref<HTMLLIElement>}
      className="rounded-2xl border bg-white px-3.5 py-3 transition-shadow duration-200"
      style={{
        borderTopColor: isFocused ? surface.primary : "#EAE8E6",
        borderRightColor: isFocused ? surface.primary : "#EAE8E6",
        borderBottomColor: isFocused ? surface.primary : "#EAE8E6",
        borderLeftWidth: 3,
        borderLeftColor: surface.primary,
        boxShadow: isFocused ? "0 4px 16px -8px rgba(0,0,0,0.18)" : "0 1px 2px rgba(0,0,0,0.04)",
        opacity: isPast && !isFocused ? 0.55 : checked ? 0.5 : 1,
      }}
    >
      <div className="flex items-start gap-3">
        <TaskStateButton state={execState} onStart={onStart} onComplete={onComplete} onUndo={onUndo} />
        <div className="min-w-0 flex-1">
          <button type="button" onClick={onOpen} className="w-full text-left">
          <div className="flex items-baseline gap-1.5 text-[11px] font-bold text-stone-400">
            <span className="tabular-nums">
              {startTime}〜{endTime}
            </span>
            {started ? (
              <span style={{ color: surface.text }}>実行中</span>
            ) : (
              timelineStatusLabel[status] && (
                <span style={isNow ? { color: surface.text } : undefined} className={isNow ? "" : "text-stone-400"}>
                  {timelineStatusLabel[status]}
                </span>
              )
            )}
            {isPast && !checked && !started && <span className="text-stone-400">・未確認</span>}
          </div>
          <p className={`mt-0.5 text-[15px] font-bold leading-snug ${checked ? "text-stone-400 line-through" : "text-stone-800"}`}>
            {task.title}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
            {task.activityType && surface.label !== areaTheme.label && (
              <span
                className="rounded-full px-2 py-0.5 font-bold"
                style={{ backgroundColor: surface.soft, color: surface.text }}
              >
                {surface.label}
              </span>
            )}
            <span
              className="rounded-full px-2 py-0.5 font-bold"
              style={{ backgroundColor: areaTheme.soft, color: areaTheme.text }}
            >
              {areaTheme.label}
            </span>
            {/* A genuinely time-based NOW slot can never have negative
                remaining (by construction, now < endTime). Negative only
                shows up when a Task is Early-Started well past its own
                planned window — "残り-357分" there is just noise, not a
                useful overrun warning, so it's suppressed. */}
            {isFocused && !checked && remaining !== null && remaining >= 0 && (
              <span className="ml-auto font-bold" style={{ color: surface.text }}>
                残り{remaining}分
              </span>
            )}
            {checked && actualMinutes !== null && (
              <span className="ml-auto font-bold text-stone-400">
                実績{actualMinutes}分
                {variance?.varianceMinutes !== null &&
                  variance !== null &&
                  ` (${variance.varianceMinutes >= 0 ? "+" : ""}${variance.varianceMinutes}分)`}
              </span>
            )}
          </div>

          </button>

          {/* RunbookStrip has its own button, so it must not sit inside the
              card button — nested buttons are invalid HTML and React says so
              as a hydration error. */}
          {isFocused && !checked && runbook && <RunbookStrip runbook={runbook} nowHmValue={nowHmValue} />}

          {isFocused && !checked && task.definitionOfDone.length > 0 && (
            <p className="mt-1.5 line-clamp-1 text-[11px] text-stone-500">完了条件　{task.definitionOfDone[0]}</p>
          )}
          {isFocused && !checked && preparationCount > 0 && (
            <p className="mt-1 text-[10px] font-bold text-stone-400">準備Task {preparationCount}件</p>
          )}

          {/* §17: 時刻はCalendarを採用した。OSが違う値を持っていたことは残す。 */}
          {osTimeWas && (
            <p className="mt-1 text-[10px] text-stone-400">
              Calendarの時刻を採用（OSは {osTimeWas.startTime}〜{osTimeWas.endTime}）
            </p>
          )}
          {pendingCalendar && (
            <p className="mt-1 text-[10px] font-bold text-amber-700">Calendar未反映</p>
          )}

          {/* §28/§29: 実績の修正はTask Detailの奥ではなく、完了カードの上で。 */}
          {checked && (
            <button
              type="button"
              onClick={onEditActual}
              className="mt-1.5 rounded-full bg-stone-100 px-2.5 py-1 text-[10px] font-bold text-stone-600"
            >
              {actualMinutes !== null ? `実績 ${actualMinutes}分を修正 ✎` : "実績を入力 ✎"}
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

// A Task that's actually STARTED but has no TimeBlock today (started from
// the 時間未定 list, or from an overdue/upcoming Task) — pinned above the
// Timeline so "what I'm actually doing right now" is never hidden just
// because it has no scheduled slot to sort into.
function PinnedNowCard({
  task,
  elapsedMinutes,
  onComplete,
  onOpen,
  preparationCount,
}: {
  task: Task;
  elapsedMinutes: number | null;
  onComplete: () => void;
  onOpen: () => void;
  preparationCount: number;
}) {
  const badge = capabilityBadge(task.aiCapability);
  return (
    <div className="rounded-2xl bg-white px-3.5 py-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_6px_16px_-10px_rgba(0,0,0,0.15)] ring-2 ring-accent-soft">
      <div className="flex items-start gap-3">
        <TaskStateButton state="STARTED" onStart={() => {}} onComplete={onComplete} onUndo={() => {}} />
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
          <div className="flex items-baseline gap-1.5 text-[11px] font-bold text-accent-dark">
            <span>実行中</span>
            <span className="text-stone-400">・時間未定から開始</span>
          </div>
          <p className="mt-0.5 text-[15px] font-bold leading-snug text-stone-800">{task.title}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="rounded-full bg-stone-100 px-2 py-0.5 font-medium text-stone-500">{task.area}</span>
            {badge.tone && (
              <span
                className={`rounded-full px-2 py-0.5 font-bold ${
                  badge.tone === "warning" ? "bg-danger-soft text-danger" : "bg-accent-soft text-accent-dark"
                }`}
              >
                {badge.label}
              </span>
            )}
            {elapsedMinutes !== null && <span className="ml-auto font-bold text-stone-400">経過{elapsedMinutes}分</span>}
          </div>
          {(task.definitionOfDone.length > 0 || preparationCount > 0) && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] text-stone-400">
              {task.definitionOfDone.length > 0 && (
                <span className="truncate">完了条件：{task.definitionOfDone[0]}</span>
              )}
              {preparationCount > 0 && (
                <span className="shrink-0 rounded-full bg-stone-100 px-1.5 py-0.5 font-bold text-stone-500">
                  準備{preparationCount}件
                </span>
              )}
            </div>
          )}
        </button>
      </div>
    </div>
  );
}

// A Task STARTED on a previous calendar day and still not resolved when
// this day began (PRD.md Day Rollover §4). Never auto-completed, auto-
// reset, or auto-dropped — actualStartedAt is preserved and the user
// explicitly picks 完了／中断／今日へ継続.
function CrossMidnightBanner({
  task,
  elapsedMinutes,
  startedDate,
  onComplete,
  onInterrupt,
  onContinueToday,
  onOpen,
}: {
  task: Task;
  elapsedMinutes: number | null;
  startedDate: string | null;
  onComplete: () => void;
  onInterrupt: () => void;
  onContinueToday: () => void;
  onOpen: () => void;
}) {
  return (
    <div className="rounded-2xl bg-white px-3.5 py-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_6px_16px_-10px_rgba(0,0,0,0.15)] ring-2 ring-accent-soft">
      <button type="button" onClick={onOpen} className="w-full text-left">
        <div className="flex items-baseline gap-1.5 text-[11px] font-bold text-accent-dark">
          <span>昨日から実行中</span>
          {startedDate && <span className="text-stone-400">・{formatMd(startedDate)}開始</span>}
        </div>
        <p className="mt-0.5 text-[15px] font-bold leading-snug text-stone-800">{task.title}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="rounded-full bg-stone-100 px-2 py-0.5 font-medium text-stone-500">{task.area}</span>
          {elapsedMinutes !== null && <span className="ml-auto font-bold text-stone-400">経過{formatDurationHm(elapsedMinutes)}</span>}
        </div>
      </button>
      <div className="mt-2.5 flex gap-1.5 border-t border-stone-100 pt-2.5">
        <button
          type="button"
          onClick={onInterrupt}
          className="flex-1 rounded-full bg-stone-100 py-2 text-[12px] font-bold text-stone-500 active:scale-[0.98]"
        >
          中断
        </button>
        <button
          type="button"
          onClick={onContinueToday}
          className="flex-1 rounded-full bg-stone-800 py-2 text-[12px] font-bold text-white active:scale-[0.98]"
        >
          今日へ継続
        </button>
        <button
          type="button"
          onClick={onComplete}
          className="flex-1 rounded-full bg-accent py-2 text-[12px] font-bold text-white active:scale-[0.98]"
        >
          完了
        </button>
      </div>
    </div>
  );
}




function TaskRow({
  task,
  today,
  checked,
  started,
  onStart,
  onComplete,
  onUndo,
  onOpen,
  preparationCount = 0,
  emphasis = false,
}: {
  task: Task;
  today: string;
  checked: boolean;
  started: boolean;
  onStart: () => void;
  onComplete?: () => void;
  onUndo?: () => void;
  onOpen: () => void;
  preparationCount?: number;
  emphasis?: boolean;
}) {
  const overdue = task.deadline !== null && daysBetween(today, task.deadline) < 0;
  const [burst, setBurst] = useState(false);
  const [prevChecked, setPrevChecked] = useState(checked);
  const badge = capabilityBadge(task.aiCapability);
  const execState = execStateOf(checked, started);

  if (checked !== prevChecked) {
    setPrevChecked(checked);
    if (checked) setBurst(true);
  }

  useEffect(() => {
    if (!burst) return;
    const t = setTimeout(() => setBurst(false), 500);
    return () => clearTimeout(t);
  }, [burst]);

  return (
    <li
      className={`flex items-start gap-3 rounded-2xl bg-white px-3.5 py-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_6px_16px_-10px_rgba(0,0,0,0.15)] transition-opacity duration-200 ${
        emphasis ? "ring-2 ring-accent-soft" : ""
      }`}
      style={{ opacity: checked ? 0.55 : 1 }}
    >
      <span className="relative">
        <TaskStateButton
          state={execState}
          onStart={onStart}
          onComplete={onComplete ?? (() => {})}
          onUndo={onUndo ?? (() => {})}
        />
        {burst && (
          <span className="pointer-events-none absolute inset-0">
            {[0, 60, 120, 180, 240, 300].map((deg) => (
              <span
                key={deg}
                className="absolute left-1/2 top-1/2 h-1 w-1 rounded-full bg-accent"
                style={{
                  transform: `rotate(${deg}deg) translate(14px) rotate(-${deg}deg)`,
                  animation: "burst-fade 480ms ease-out forwards",
                }}
              />
            ))}
          </span>
        )}
      </span>
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <p className={`text-[15px] font-bold leading-snug ${checked ? "text-stone-400 line-through" : "text-stone-800"}`}>
          {task.title}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="rounded-full bg-stone-100 px-2 py-0.5 font-medium text-stone-500">{task.area}</span>
          {task.estimateMinutes !== null && <span className="text-stone-400">{task.estimateMinutes}分</span>}
          {badge.tone && (
            <span
              className={`rounded-full px-2 py-0.5 font-bold ${
                badge.tone === "warning" ? "bg-danger-soft text-danger" : "bg-accent-soft text-accent-dark"
              }`}
            >
              {badge.label}
            </span>
          )}
          <span className={`ml-auto font-bold ${overdue ? "text-danger" : "text-stone-400"}`}>
            期限 {formatMd(task.deadline)}
          </span>
        </div>

        {!checked && (task.definitionOfDone.length > 0 || preparationCount > 0 || task.contextTags.length > 0) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] text-stone-400">
            {task.definitionOfDone.length > 0 && (
              <span className="truncate">完了条件：{task.definitionOfDone[0]}</span>
            )}
            {preparationCount > 0 && (
              <span className="shrink-0 rounded-full bg-stone-100 px-1.5 py-0.5 font-bold text-stone-500">
                準備{preparationCount}件
              </span>
            )}
            {task.contextTags.map((tag) => (
              <span key={tag} className="shrink-0 rounded-full bg-stone-100 px-1.5 py-0.5 font-bold text-stone-500">
                {tag}
              </span>
            ))}
          </div>
        )}
      </button>
    </li>
  );
}
