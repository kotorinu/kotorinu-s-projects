"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fixedCalendarEvents, goals, outcomes, recurringRules, timeBlocks, tasks as allTasks } from "@/lib/dummy-data";
import { addDaysToYmd, daysBetween, formatDurationHm, formatMd, minutesSince, nowHm } from "@/lib/date";
import { capabilityBadge, capabilityOwnerLabel } from "@/lib/capability";
import { buildTimeline, minutesUntil, TimelineItem } from "@/lib/timeline";
import { computeVariance } from "@/lib/execution";
import { tasksEffectiveOnDate, tasksScheduledOnDate, pendingCarryoverTasks } from "@/lib/dayPlan";
import { useTodayExecution } from "@/lib/todayExecutionStore";
import type { CarryoverDisposition, FixedEventType, RecurringRule, Task } from "@/lib/types";
import { usePrefersReducedMotion } from "@/lib/useReducedMotion";
import ProgressBar from "@/components/ProgressBar";
import TaskDetailSheet from "@/components/TaskDetailSheet";
import RecurringDetailSheet from "@/components/RecurringDetailSheet";
import OutcomeDetailSheet from "@/components/OutcomeDetailSheet";
import Confetti from "@/components/Confetti";

const fixedEventTypeIcon: Record<FixedEventType, string> = {
  MILESTONE: "🏕",
  TRAVEL: "✈",
  FIXED_APPOINTMENT: "📌",
};

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

function isOpen(t: Task) {
  return t.status !== "完了" && t.status !== "Archive";
}

export default function TodayPage() {
  // Task status / started / completed / actualMinutes / varianceReason all
  // live in TodayExecutionProvider (mounted once in the root layout), not in
  // this page's own useState — this page unmounts on every SPA navigation
  // away from /today, and local useState would be wiped each time (the
  // 2026-09-05 bug this fixes). See lib/todayExecutionStore.tsx.
  const {
    currentDate,
    done,
    setDone,
    recurringDone,
    setRecurringDone,
    taskStartedAt,
    setTaskStartedAt,
    setTaskCompletedAt,
    taskActualMinutes,
    setTaskActualMinutes,
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
  } = useTodayExecution();
  const today = currentDate;
  const weekday = WEEKDAY_LABEL[new Date(currentDate + "T00:00:00").getDay()];

  const [expanded, setExpanded] = useState(false);
  const [overdueOpen, setOverdueOpen] = useState(false);
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
  const [yesterdaySummaryOpen, setYesterdaySummaryOpen] = useState(false);
  const [reschedulingTaskId, setReschedulingTaskId] = useState<string | null>(null);
  const [rescheduleDateValue, setRescheduleDateValue] = useState("");

  function fireCelebration(c: Celebration, durationMs: number) {
    setCelebration(c);
    if (celebrationTimer.current) clearTimeout(celebrationTimer.current);
    celebrationTimer.current = setTimeout(() => setCelebration(null), durationMs);
  }

  function reallyStart(taskId: string) {
    setStartedTaskId(taskId);
    setTaskStartedAt((prev) => new Map(prev).set(taskId, new Date().toISOString()));
    setSwitchConfirmTaskId(null);
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

  function completeStartedTask(task: Task) {
    const startedIso = taskStartedAt.get(task.id);
    if (startedIso) {
      setTaskActualMinutes((prev) => new Map(prev).set(task.id, minutesSince(startedIso)));
    }
    setTaskCompletedAt((prev) => new Map(prev).set(task.id, new Date().toISOString()));
    if (startedTaskId === task.id) setStartedTaskId(null);
    toggle(task);
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
  const timeBlocksToday = useMemo(() => timeBlocks.filter((tb) => tb.date === today), [today]);
  const scheduledTaskIds = useMemo(() => new Set(timeBlocksToday.map((tb) => tb.taskId)), [timeBlocksToday]);

  const todayTasks = useMemo(
    () => tasksEffectiveOnDate(today, allTasks, timeBlocks, workDateOverrides),
    [today, workDateOverrides]
  );

  const overdueTasks = useMemo(
    () => allTasks.filter((t) => isOpen(t) && t.deadline !== null && daysBetween(today, t.deadline) < 0),
    [today]
  );

  const upcomingTasks = useMemo(() => {
    const todayIds = new Set(todayTasks.map((t) => t.id));
    return allTasks.filter((t) => {
      if (!isOpen(t) || todayIds.has(t.id) || t.deadline === null) return false;
      const diff = daysBetween(today, t.deadline);
      return diff >= 1 && diff <= 2;
    });
  }, [todayTasks, today]);

  // --- Day Rollover: Yesterday Summary / Carryover (2026-09-06) ---
  // Not useMemo'd: these are cheap array scans over a small fixed fixture,
  // and wrapping them tripped the React Compiler's memoization-preservation
  // check (it couldn't verify `yesterday`/`carryover` as stable dependency
  // identities) without any real performance benefit.
  const yesterday = addDaysToYmd(today, -1);
  const yesterdayRecord = history[yesterday] ?? null;
  const yesterdayScheduledTasks = tasksScheduledOnDate(yesterday, allTasks, timeBlocks);
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
  const carryoverPendingTasks = yesterdayRecord
    ? pendingCarryoverTasks(yesterday, allTasks, timeBlocks, new Set(yesterdayRecord.completedTaskIds), carryover).filter(
        (t) => t.id !== startedTaskId
      )
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
    () => todayTasks.filter((t) => done.has(t.id) && !scheduledTaskIds.has(t.id)),
    [todayTasks, done, scheduledTaskIds]
  );
  const [doneListOpen, setDoneListOpen] = useState(false);

  // A live clock, not a fabricated one — re-checked every minute so NOW/
  // NEXT/PAST stay correct across a long-open session without a full
  // scheduling engine. Starts at "00:00" (everything LATER) rather than
  // calling nowHm() during the initial render: this page is statically
  // prerendered, so computing wall-clock time there would bake in the
  // build-time clock and mismatch the client's real clock on hydration.
  // The real time is set client-only, in the effect below.
  const [nowHmValue, setNowHmValue] = useState("00:00");
  useEffect(() => {
    const tick = () => setNowHmValue(nowHm());
    const firstTick = setTimeout(tick, 0);
    const id = setInterval(tick, 60_000);
    return () => {
      clearTimeout(firstTick);
      clearInterval(id);
    };
  }, []);

  const fixedEventsToday = useMemo(
    () => fixedCalendarEvents.filter((e) => e.startDate <= today && e.endDate >= today),
    [today]
  );
  const fixedEventsAllDayToday = useMemo(() => fixedEventsToday.filter((e) => e.startTime === null), [fixedEventsToday]);
  const fixedEventsTimedToday = useMemo(() => fixedEventsToday.filter((e) => e.startTime !== null), [fixedEventsToday]);

  const timeline = useMemo(
    () => buildTimeline(timeBlocksToday, allTasks, recurringRules, fixedEventsTimedToday, nowHmValue, startedTaskId),
    [timeBlocksToday, fixedEventsTimedToday, nowHmValue, startedTaskId]
  );

  // A STARTED Task with no TimeBlock today (started from the 時間未定 list,
  // or from an overdue/upcoming Task) has nowhere to render inside the
  // time-sorted Timeline — pin it above instead, rather than silently
  // dropping the fact that it's the one actually being worked on right now.
  // A Task started on a *previous* day gets its own cross-midnight banner
  // (with 完了／中断／今日へ継続) instead — never both at once.
  const pinnedNowTask =
    startedTask && !startedAcrossMidnight && !scheduledTaskIds.has(startedTask.id) && !done.has(startedTask.id)
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
  const nowIndicatorIndex = useMemo(() => {
    const nowIdx = timeline.findIndex((it) => it.status === "NOW");
    if (nowIdx !== -1) return nowIdx;
    const nextIdx = timeline.findIndex((it) => it.status === "NEXT" || it.status === "LATER");
    return nextIdx !== -1 ? nextIdx : timeline.length;
  }, [timeline]);

  // HTMLElement (not HTMLLIElement) so the same ref can point at either the
  // <li> inside the time-sorted Timeline or the pinned <div> above it —
  // whichever is actually rendering the current NOW task.
  const nowCardRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    nowCardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  const unscheduledTodayTasks = useMemo(
    () => todayTasks.filter((t) => !scheduledTaskIds.has(t.id) && !done.has(t.id) && t.id !== startedTaskId),
    [todayTasks, scheduledTaskIds, done, startedTaskId]
  );

  const preparationCountByTaskId = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of allTasks) {
      if (!t.preparationForTaskId) continue;
      map.set(t.preparationForTaskId, (map.get(t.preparationForTaskId) ?? 0) + 1);
    }
    return map;
  }, []);

  const doneCount = todayTasks.filter((t) => done.has(t.id)).length;
  const totalCount = todayTasks.length;
  const pct = totalCount === 0 ? 0 : Math.round((doneCount / totalCount) * 100);
  const recurringDoneCount = recurringRules.filter((r) => recurringDone.has(r.id)).length;

  function toggle(task: Task) {
    const completing = !done.has(task.id);
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(task.id)) next.delete(task.id);
      else next.add(task.id);
      return next;
    });
    if (!completing) return;

    if (totalCount > 0 && doneCount + 1 === totalCount) {
      fireCelebration({ kind: "today" }, 1100);
      return;
    }

    const goal = task.goalId ? goals.find((g) => g.id === task.goalId) : null;
    if (goal) {
      const linked = allTasks.filter((t) => t.goalId === goal.id);
      const doneAmongLinked = linked.filter((t) => t.status === "完了" || t.id === task.id || done.has(t.id)).length;
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
                    {checked && r.streakDays > 0 && (
                      <span className="ml-auto shrink-0 text-[10px] font-bold text-accent-dark">{r.streakDays + 1}日連続</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="px-5 pt-4 lg:col-start-1">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold text-stone-800">今日のTimeline</h2>
        </div>

        {fixedEventsAllDayToday.length > 0 && (
          <p className="mb-2.5 text-[11px] font-bold text-stone-400">
            本日終日：{fixedEventsAllDayToday.map((e) => e.title).join("・")}
          </p>
        )}

        {startedAcrossMidnight && startedTask && (
          <div ref={nowCardRef as React.Ref<HTMLDivElement>} className="mb-2">
            <CrossMidnightBanner
              task={startedTask}
              elapsedMinutes={startedAcrossMidnightElapsedMinutes}
              startedDate={startedTaskDate}
              onComplete={() => completeStartedTask(startedTask)}
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
              onComplete={() => completeStartedTask(pinnedNowTask)}
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
                {timeline.map((item, i) => (
                  <FragmentWithIndicator key={itemKey(item)} showIndicator={i === nowIndicatorIndex} nowHmValue={nowHmValue}>
                    {item.kind === "task" ? (
                      <TimelineTaskCard
                        item={item}
                        checked={done.has(item.task.id)}
                        started={startedTaskId === item.task.id}
                        actualMinutes={taskActualMinutes.get(item.task.id) ?? null}
                        nowHmValue={nowHmValue}
                        onStart={() => requestStart(item.task.id)}
                        onComplete={() => completeStartedTask(item.task)}
                        onUndo={() => toggle(item.task)}
                        onOpen={() => setSelectedTask(item.task)}
                        preparationCount={preparationCountByTaskId.get(item.task.id) ?? 0}
                        nowRef={item.status === "NOW" ? nowCardRef : undefined}
                      />
                    ) : item.kind === "recurring" ? (
                      <TimelineRecurringCard
                        item={item}
                        checked={recurringDone.has(item.rule.id)}
                        onToggle={() => toggleRecurring(item.rule.id)}
                        onOpen={() => setSelectedRecurring(item.rule)}
                      />
                    ) : item.kind === "plain" ? (
                      <TimelinePlainCard item={item} />
                    ) : (
                      <TimelineFixedCard item={item} />
                    )}
                  </FragmentWithIndicator>
                ))}
                {nowIndicatorIndex === timeline.length && <NowIndicator nowHmValue={nowHmValue} />}
              </ul>
            )}

            {unscheduledTodayTasks.length > 0 && (
              <div>
                <p className="mb-1.5 text-[10px] font-black tracking-widest text-stone-400">
                  時間未定（{unscheduledTodayTasks.length}）
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
                        onUndo={() => toggle(t)}
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

      <section className="mx-5 mt-4 lg:col-start-2">
        <div className="flex items-center gap-2 rounded-2xl bg-white px-4 py-2 shadow-sm">
          <button
            type="button"
            onClick={() => setOverdueOpen((v) => !v)}
            className={`flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold ${
              overdueTasks.length > 0 ? "text-danger" : "text-stone-300"
            }`}
          >
            ⚠ 期限超過 {overdueTasks.length}
          </button>
          <span className="h-3 w-px bg-stone-200" />
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold text-stone-500"
          >
            ◷ 2日以内 {upcomingTasks.length}
          </button>
        </div>

        {overdueOpen && overdueTasks.length > 0 && (
          <ul className="mt-1.5 flex flex-col gap-1.5">
            {overdueTasks.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2 rounded-xl bg-danger-soft/60 px-3 py-2 text-xs">
                <span className="truncate font-medium text-stone-700">{t.title}</span>
                <span className="shrink-0 font-bold text-danger">期限 {formatMd(t.deadline)}</span>
              </li>
            ))}
          </ul>
        )}

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
                  <span className="shrink-0 font-bold text-stone-500">期限 {formatMd(t.deadline)}</span>
                </li>
              ))
            )}
          </ul>
        )}
      </section>
      </div>

      <CelebrationToast celebration={celebration} reducedMotion={reducedMotion} />

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
            <div className="fixed inset-0 z-50 flex items-end justify-center">
              <button
                type="button"
                aria-label="閉じる"
                onClick={() => setSwitchConfirmTaskId(null)}
                className="absolute inset-0 bg-stone-900/45"
              />
              <div className="relative w-full max-w-[430px] rounded-t-3xl bg-white p-5 shadow-2xl">
                <p className="text-[14px] font-black text-stone-800">現在実行中のTaskがあります</p>
                <p className="mt-1.5 text-[12px] leading-relaxed text-stone-500">
                  「{currentTask?.title ?? "実行中のTask"}」を中断して、「{nextTask.title}」を開始しますか？
                </p>
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setSwitchConfirmTaskId(null)}
                    className="flex-1 rounded-full bg-stone-100 py-2.5 text-[13px] font-bold text-stone-600"
                  >
                    キャンセル
                  </button>
                  <button
                    type="button"
                    onClick={confirmSwitch}
                    className="flex-1 rounded-full bg-accent py-2.5 text-[13px] font-bold text-white"
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

function EmptyState({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-3xl border border-dashed border-stone-200 py-10 text-center">
      <span className="text-3xl">{icon}</span>
      <p className="text-sm text-stone-400">{text}</p>
    </div>
  );
}

const timelineStatusLabel: Record<string, string> = { NOW: "NOW", NEXT: "NEXT", PAST: "", LATER: "" };

function itemKey(item: TimelineItem): string {
  return item.kind === "fixed" ? item.event.id : item.timeBlock.id;
}

function FragmentWithIndicator({
  showIndicator,
  nowHmValue,
  children,
}: {
  showIndicator: boolean;
  nowHmValue: string;
  children: React.ReactNode;
}) {
  return (
    <>
      {showIndicator && <NowIndicator nowHmValue={nowHmValue} />}
      {children}
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
  onStart,
  onComplete,
  onUndo,
  onOpen,
  preparationCount,
  nowRef,
}: {
  item: Extract<TimelineItem, { kind: "task" }>;
  checked: boolean;
  started: boolean;
  actualMinutes: number | null;
  nowHmValue: string;
  onStart: () => void;
  onComplete: () => void;
  onUndo: () => void;
  onOpen: () => void;
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
  const badge = capabilityBadge(task.aiCapability);
  const execState = execStateOf(checked, started);
  const variance =
    checked && actualMinutes !== null ? computeVariance(task.estimateMinutes, actualMinutes) : null;
  // nowHmValue comes from the page's hydration-safe state, not a direct
  // nowHm() call here — see NowIndicator's comment for why that matters.
  const remaining = isFocused ? minutesUntil(endTime, nowHmValue) : null;

  return (
    <li
      ref={nowRef as React.Ref<HTMLLIElement>}
      className={`rounded-2xl bg-white px-3.5 py-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_6px_16px_-10px_rgba(0,0,0,0.15)] ${
        isFocused ? "ring-2 ring-accent-soft" : ""
      }`}
      style={{ opacity: isPast && !isFocused ? 0.55 : checked ? 0.55 : 1 }}
    >
      <div className="flex items-start gap-3">
        <TaskStateButton state={execState} onStart={onStart} onComplete={onComplete} onUndo={onUndo} />
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
          <div className="flex items-baseline gap-1.5 text-[11px] font-bold text-stone-400">
            <span className="tabular-nums">
              {startTime}〜{endTime}
            </span>
            {started ? (
              <span className="text-accent-dark">実行中</span>
            ) : (
              timelineStatusLabel[status] && (
                <span className={isNow ? "text-accent-dark" : "text-stone-400"}>{timelineStatusLabel[status]}</span>
              )
            )}
            {isPast && !checked && !started && <span className="text-stone-400">・未確認</span>}
          </div>
          <p className={`mt-0.5 text-[15px] font-bold leading-snug ${checked ? "text-stone-400 line-through" : "text-stone-800"}`}>
            {task.title}
          </p>
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
            {/* A genuinely time-based NOW slot can never have negative
                remaining (by construction, now < endTime). Negative only
                shows up when a Task is Early-Started well past its own
                planned window — "残り-357分" there is just noise, not a
                useful overrun warning, so it's suppressed. */}
            {isFocused && !checked && remaining !== null && remaining >= 0 && (
              <span className="ml-auto font-bold text-accent-dark">残り{remaining}分</span>
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

          {isFocused && !checked && (
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
              <span className="shrink-0 font-bold text-stone-500">{capabilityOwnerLabel(task.aiCapability)}</span>
            </div>
          )}
        </button>
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

function TimelineRecurringCard({
  item,
  checked,
  onToggle,
  onOpen,
}: {
  item: Extract<TimelineItem, { kind: "recurring" }>;
  checked: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const { rule, startTime, endTime, status } = item;
  const isPast = status === "PAST";
  return (
    <li
      className="flex items-start gap-3 rounded-2xl bg-white px-3.5 py-3"
      style={{ opacity: isPast || checked ? 0.55 : 1 }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-label="完了にする"
        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-xs transition-all duration-150 ${
          checked ? "border-accent bg-accent text-white" : "border-stone-200 text-transparent active:scale-90"
        }`}
      >
        ✓
      </button>
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <div className="flex items-baseline gap-1.5 text-[11px] font-bold text-stone-400">
          <span className="tabular-nums">
            {startTime}〜{endTime}
          </span>
          {isPast && !checked && <span>・未確認</span>}
        </div>
        <p className={`mt-0.5 text-[14px] font-bold ${checked ? "text-stone-400 line-through" : "text-stone-800"}`}>
          {rule.title}
        </p>
      </button>
    </li>
  );
}

function TimelinePlainCard({ item }: { item: Extract<TimelineItem, { kind: "plain" }> }) {
  const { timeBlock, startTime, endTime, status } = item;
  const isPast = status === "PAST";
  return (
    <li className="rounded-2xl bg-stone-100/70 px-3.5 py-2.5" style={{ opacity: isPast ? 0.55 : 1 }}>
      <div className="flex items-baseline gap-1.5 text-[11px] font-bold text-stone-400">
        <span className="tabular-nums">
          {startTime}〜{endTime}
        </span>
      </div>
      <p className="mt-0.5 text-[13px] font-bold text-stone-600">{timeBlock.label}</p>
    </li>
  );
}

function TimelineFixedCard({ item }: { item: Extract<TimelineItem, { kind: "fixed" }> }) {
  const { event, startTime, endTime, status } = item;
  const isPast = status === "PAST";
  return (
    <li
      className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 px-3.5 py-3"
      style={{ opacity: isPast ? 0.55 : 1 }}
    >
      <div className="flex items-baseline gap-1.5 text-[11px] font-bold text-stone-400">
        <span className="tabular-nums">
          {startTime}〜{endTime}
        </span>
        <span>予定</span>
      </div>
      <p className="mt-0.5 text-[14px] font-bold text-stone-700">
        {fixedEventTypeIcon[event.type]} {event.title}
      </p>
    </li>
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
