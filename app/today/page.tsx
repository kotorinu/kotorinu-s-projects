"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fixedCalendarEvents, goals, outcomes, recurringRules, timeBlocks, tasks as allTasks } from "@/lib/dummy-data";
import { daysBetween, formatMd, minutesSince, nowHm, todayStr } from "@/lib/date";
import { capabilityBadge, capabilityOwnerLabel } from "@/lib/capability";
import { buildTimeline, minutesUntil, TimelineItem } from "@/lib/timeline";
import type { FixedEventType, RecurringRule, Task } from "@/lib/types";
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

const today = todayStr();
const weekday = ["日", "月", "火", "水", "木", "金", "土"][new Date().getDay()];

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
  const [done, setDone] = useState<Set<string>>(new Set());
  const [recurringDone, setRecurringDone] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState(false);
  const [overdueOpen, setOverdueOpen] = useState(false);
  const [celebration, setCelebration] = useState<Celebration | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [selectedRecurring, setSelectedRecurring] = useState<RecurringRule | null>(null);
  const [outcomeSheetId, setOutcomeSheetId] = useState<string | null>(null);
  const celebrationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reducedMotion = usePrefersReducedMotion();

  // Measures Estimate vs Actual for real (PRD.md §28): session-only (no DB
  // yet), never fabricated — actualMinutes is only ever set from a real
  // 開始→完了 span the user actually walked through just now.
  const [taskStartedAt, setTaskStartedAt] = useState<Map<string, string>>(new Map());
  const [taskActualMinutes, setTaskActualMinutes] = useState<Map<string, number>>(new Map());

  function fireCelebration(c: Celebration, durationMs: number) {
    setCelebration(c);
    if (celebrationTimer.current) clearTimeout(celebrationTimer.current);
    celebrationTimer.current = setTimeout(() => setCelebration(null), durationMs);
  }

  function startTask(taskId: string) {
    setTaskStartedAt((prev) => new Map(prev).set(taskId, new Date().toISOString()));
  }

  function completeNowTask(task: Task) {
    const startedIso = taskStartedAt.get(task.id);
    if (startedIso) {
      setTaskActualMinutes((prev) => new Map(prev).set(task.id, minutesSince(startedIso)));
    }
    toggle(task);
  }

  // Task ≠ Time (PRD.md §27): a Task scheduled today via a real TimeBlock
  // counts as today's work even if its own workDate/deadline points
  // elsewhere — the TimeBlock is the stronger, more current signal.
  const timeBlocksToday = useMemo(() => timeBlocks.filter((tb) => tb.date === today), []);
  const scheduledTaskIds = useMemo(() => new Set(timeBlocksToday.map((tb) => tb.taskId)), [timeBlocksToday]);

  const todayTasks = useMemo(
    () =>
      allTasks.filter(
        (t) => isOpen(t) && (t.workDate === today || t.deadline === today || scheduledTaskIds.has(t.id))
      ),
    [scheduledTaskIds]
  );

  const overdueTasks = useMemo(
    () => allTasks.filter((t) => isOpen(t) && t.deadline !== null && daysBetween(today, t.deadline) < 0),
    []
  );

  const upcomingTasks = useMemo(() => {
    const todayIds = new Set(todayTasks.map((t) => t.id));
    return allTasks.filter((t) => {
      if (!isOpen(t) || todayIds.has(t.id) || t.deadline === null) return false;
      const diff = daysBetween(today, t.deadline);
      return diff >= 1 && diff <= 2;
    });
  }, [todayTasks]);

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
  // scheduling engine.
  const [nowHmValue, setNowHmValue] = useState(() => nowHm());
  useEffect(() => {
    const id = setInterval(() => setNowHmValue(nowHm()), 60_000);
    return () => clearInterval(id);
  }, []);

  const fixedEventsToday = useMemo(
    () => fixedCalendarEvents.filter((e) => e.startDate <= today && e.endDate >= today),
    []
  );
  const fixedEventsAllDayToday = useMemo(() => fixedEventsToday.filter((e) => e.startTime === null), [fixedEventsToday]);
  const fixedEventsTimedToday = useMemo(() => fixedEventsToday.filter((e) => e.startTime !== null), [fixedEventsToday]);

  const timeline = useMemo(
    () => buildTimeline(timeBlocksToday, allTasks, recurringRules, fixedEventsTimedToday, nowHmValue),
    [timeBlocksToday, fixedEventsTimedToday, nowHmValue]
  );

  // Where to draw the "──── NOW hh:mm ────" divider: right before the NOW
  // slot if one exists, else right before the next upcoming slot, else at
  // the end (today's schedule is entirely in the past).
  const nowIndicatorIndex = useMemo(() => {
    const nowIdx = timeline.findIndex((it) => it.status === "NOW");
    if (nowIdx !== -1) return nowIdx;
    const nextIdx = timeline.findIndex((it) => it.status === "NEXT" || it.status === "LATER");
    return nextIdx !== -1 ? nextIdx : timeline.length;
  }, [timeline]);

  const nowCardRef = useRef<HTMLLIElement | null>(null);
  useEffect(() => {
    nowCardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  const unscheduledTodayTasks = useMemo(
    () => todayTasks.filter((t) => !scheduledTaskIds.has(t.id) && !done.has(t.id)),
    [todayTasks, scheduledTaskIds, done]
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

      <section className="mx-5 mt-1 rounded-3xl bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,0,0,0.12)]">
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
        <section className="mx-5 mt-3 rounded-2xl bg-white px-4 py-3 shadow-sm">
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

      <section className="px-5 pt-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold text-stone-800">今日のTimeline</h2>
        </div>

        {fixedEventsAllDayToday.length > 0 && (
          <p className="mb-2.5 text-[11px] font-bold text-stone-400">
            本日終日：{fixedEventsAllDayToday.map((e) => e.title).join("・")}
          </p>
        )}

        {timeline.length === 0 && unscheduledTodayTasks.length === 0 && doneTodayTasks.length === 0 ? (
          <EmptyState icon="🌤" text="今日の予定はまだありません" />
        ) : (
          <div className="flex flex-col gap-5">
            {timeline.length > 0 && (
              <ul className="flex flex-col gap-2">
                {timeline.map((item, i) => (
                  <FragmentWithIndicator key={itemKey(item)} showIndicator={i === nowIndicatorIndex}>
                    {item.kind === "task" ? (
                      <TimelineTaskCard
                        item={item}
                        checked={done.has(item.task.id)}
                        started={taskStartedAt.has(item.task.id)}
                        actualMinutes={taskActualMinutes.get(item.task.id) ?? null}
                        onStart={() => startTask(item.task.id)}
                        onComplete={() => completeNowTask(item.task)}
                        onToggle={() => toggle(item.task)}
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
                {nowIndicatorIndex === timeline.length && <NowIndicator />}
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
                      checked={false}
                      onToggle={() => toggle(t)}
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
                        checked={true}
                        onToggle={() => toggle(t)}
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

      <section className="mx-5 mt-4">
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

      <CelebrationToast celebration={celebration} reducedMotion={reducedMotion} />

      {selectedTask && <TaskDetailSheet task={selectedTask} onClose={() => setSelectedTask(null)} />}

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

function FragmentWithIndicator({ showIndicator, children }: { showIndicator: boolean; children: React.ReactNode }) {
  return (
    <>
      {showIndicator && <NowIndicator />}
      {children}
    </>
  );
}

function NowIndicator() {
  return (
    <li aria-hidden className="flex items-center gap-2 px-0.5 py-0.5 text-[10px] font-black text-accent-dark">
      <span className="h-px flex-1 bg-accent" />
      NOW {nowHm()}
      <span className="h-px flex-1 bg-accent" />
    </li>
  );
}

function TimelineTaskCard({
  item,
  checked,
  started,
  actualMinutes,
  onStart,
  onComplete,
  onToggle,
  onOpen,
  preparationCount,
  nowRef,
}: {
  item: Extract<TimelineItem, { kind: "task" }>;
  checked: boolean;
  started: boolean;
  actualMinutes: number | null;
  onStart: () => void;
  onComplete: () => void;
  onToggle: () => void;
  onOpen: () => void;
  preparationCount: number;
  nowRef?: React.RefObject<HTMLLIElement | null>;
}) {
  const { task, startTime, endTime, status } = item;
  const isNow = status === "NOW";
  const isPast = status === "PAST";
  const badge = capabilityBadge(task.aiCapability);
  const remaining = isNow ? minutesUntil(endTime, nowHm()) : null;

  return (
    <li
      ref={nowRef}
      className={`rounded-2xl bg-white px-3.5 py-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_6px_16px_-10px_rgba(0,0,0,0.15)] ${
        isNow ? "ring-2 ring-accent-soft" : ""
      }`}
      style={{ opacity: isPast || checked ? 0.55 : 1 }}
    >
      <div className="flex items-start gap-3">
        {!isNow && (
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
        )}
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
          <div className="flex items-baseline gap-1.5 text-[11px] font-bold text-stone-400">
            <span className="tabular-nums">
              {startTime}〜{endTime}
            </span>
            {timelineStatusLabel[status] && (
              <span className={isNow ? "text-accent-dark" : "text-stone-400"}>{timelineStatusLabel[status]}</span>
            )}
            {isPast && !checked && <span className="text-stone-400">・未確認</span>}
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
            {isNow && remaining !== null && (
              <span className={`ml-auto font-bold ${remaining < 0 ? "text-danger" : "text-accent-dark"}`}>
                残り{remaining}分
              </span>
            )}
            {checked && actualMinutes !== null && (
              <span className="ml-auto font-bold text-stone-400">実績{actualMinutes}分</span>
            )}
          </div>

          {isNow && !checked && (
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

      {isNow && !checked && (
        <div className="mt-2.5 flex gap-2 border-t border-stone-100 pt-2.5">
          {!started ? (
            <button
              type="button"
              onClick={onStart}
              className="flex-1 rounded-full bg-stone-800 py-2 text-[12px] font-bold text-white active:scale-[0.98]"
            >
              開始
            </button>
          ) : (
            <span className="flex flex-1 items-center justify-center rounded-full bg-stone-100 py-2 text-[12px] font-bold text-stone-500">
              実行中
            </span>
          )}
          <button
            type="button"
            onClick={onComplete}
            className="flex-1 rounded-full bg-accent py-2 text-[12px] font-bold text-white active:scale-[0.98]"
          >
            完了
          </button>
        </div>
      )}
    </li>
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
  checked,
  onToggle,
  onOpen,
  preparationCount = 0,
  emphasis = false,
}: {
  task: Task;
  checked: boolean;
  onToggle: () => void;
  onOpen: () => void;
  preparationCount?: number;
  emphasis?: boolean;
}) {
  const overdue = task.deadline !== null && daysBetween(today, task.deadline) < 0;
  const [burst, setBurst] = useState(false);
  const [prevChecked, setPrevChecked] = useState(checked);
  const badge = capabilityBadge(task.aiCapability);

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
      <button
        type="button"
        onClick={onToggle}
        aria-label="完了にする"
        className={`relative mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-xs transition-all duration-150 ${
          checked
            ? "border-accent bg-accent text-white"
            : "border-stone-200 text-transparent active:scale-90"
        }`}
      >
        ✓
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
      </button>
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
