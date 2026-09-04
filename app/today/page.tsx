"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { goals, outcomes, recurringRules, tasks as allTasks } from "@/lib/dummy-data";
import { daysBetween, formatMd, todayStr } from "@/lib/date";
import { capabilityBadge } from "@/lib/capability";
import type { RecurringRule, Task } from "@/lib/types";
import ProgressBar from "@/components/ProgressBar";
import TaskDetailSheet from "@/components/TaskDetailSheet";
import RecurringDetailSheet from "@/components/RecurringDetailSheet";
import OutcomeDetailSheet from "@/components/OutcomeDetailSheet";
import Confetti from "@/components/Confetti";

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
  const [effectsOn, setEffectsOn] = useState(true);
  const [celebration, setCelebration] = useState<Celebration | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [selectedRecurring, setSelectedRecurring] = useState<RecurringRule | null>(null);
  const [outcomeSheetId, setOutcomeSheetId] = useState<string | null>(null);
  const celebrationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function fireCelebration(c: Celebration, durationMs: number) {
    if (!effectsOn) return;
    setCelebration(c);
    if (celebrationTimer.current) clearTimeout(celebrationTimer.current);
    celebrationTimer.current = setTimeout(() => setCelebration(null), durationMs);
  }

  const todayTasks = useMemo(
    () => allTasks.filter((t) => isOpen(t) && (t.workDate === today || t.deadline === today)),
    []
  );

  const overdueTasks = useMemo(
    () => allTasks.filter((t) => isOpen(t) && daysBetween(today, t.deadline) < 0),
    []
  );

  const upcomingTasks = useMemo(() => {
    const todayIds = new Set(todayTasks.map((t) => t.id));
    return allTasks.filter((t) => {
      if (!isOpen(t) || todayIds.has(t.id)) return false;
      const diff = daysBetween(today, t.deadline);
      return diff >= 1 && diff <= 2;
    });
  }, [todayTasks]);

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
          <div className="flex items-start gap-2">
            <button
              type="button"
              onClick={() => setEffectsOn((v) => !v)}
              aria-label="完了エフェクトの切り替え"
              className={`mt-1 flex h-6 w-6 items-center justify-center rounded-full text-xs transition-colors ${
                effectsOn ? "bg-accent-soft text-accent-dark" : "bg-stone-100 text-stone-300"
              }`}
            >
              ✦
            </button>
            <div className="text-right">
              <p className="tabular-nums text-2xl font-black">{formatMd(today)}</p>
              <p className="text-xs font-medium text-stone-400">{weekday}曜日</p>
            </div>
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
          <h2 className="text-sm font-bold text-stone-800">今日やる</h2>
        </div>

        {todayTasks.length === 0 ? (
          <EmptyState icon="🌤" text="今日やるタスクはありません" />
        ) : (
          <ul className="flex flex-col gap-2.5">
            {todayTasks.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                checked={done.has(t.id)}
                onToggle={() => toggle(t)}
                onOpen={() => setSelectedTask(t)}
              />
            ))}
          </ul>
        )}
      </section>

      <section className="mx-5 mt-6 rounded-3xl bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,0,0,0.12)]">
        <div className="flex items-center gap-2">
          <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm ${
              overdueTasks.length > 0 ? "bg-danger-soft" : "bg-stone-100"
            }`}
          >
            ⚠
          </span>
          <span className="text-sm font-semibold text-stone-600">期限超過</span>
          <span
            className={`tabular-nums ml-auto text-xl font-black ${
              overdueTasks.length > 0 ? "text-danger" : "text-stone-300"
            }`}
          >
            {overdueTasks.length}
          </span>
        </div>

        {overdueTasks.length > 0 && (
          <ul className="mt-3 flex flex-col gap-1.5 border-t border-stone-100 pt-3">
            {overdueTasks.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2 rounded-xl bg-danger-soft/60 px-3 py-2 text-xs">
                <span className="truncate font-medium text-stone-700">{t.title}</span>
                <span className="shrink-0 font-bold text-danger">期限 {formatMd(t.deadline)}</span>
              </li>
            ))}
          </ul>
        )}

        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 flex w-full items-center gap-2 border-t border-stone-100 pt-3 text-sm"
        >
          <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-stone-100 text-xs text-stone-500 transition-transform duration-200 ${
              expanded ? "rotate-90" : ""
            }`}
          >
            ▸
          </span>
          <span className="font-semibold text-stone-600">2日以内</span>
          <span className="tabular-nums ml-auto text-xl font-black text-stone-700">
            {upcomingTasks.length}
            <span className="ml-0.5 text-xs font-medium text-stone-400">件</span>
          </span>
        </button>

        {expanded && (
          <ul className="mt-3 flex flex-col gap-1.5">
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

      <CelebrationToast celebration={celebration} />

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

function CelebrationToast({ celebration }: { celebration: Celebration | null }) {
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
              <Confetti count={14} />
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
          <Confetti count={12} />
          <p className="text-lg">🎉</p>
          <p className="mt-1 text-[13px] font-black">{celebration.label}</p>
          <p className="mt-1 text-[11px] text-stone-300">
            毎日の積み上げ {celebration.total} / {celebration.total}
          </p>
        </div>
      )}

      {celebration?.kind === "today" && (
        <div className="relative w-full max-w-xs overflow-visible rounded-2xl bg-accent px-5 py-4 text-center text-white shadow-xl">
          <Confetti count={18} />
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

function TaskRow({
  task,
  checked,
  onToggle,
  onOpen,
}: {
  task: Task;
  checked: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const overdue = daysBetween(today, task.deadline) < 0;
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
      className="flex items-start gap-3 rounded-2xl bg-white px-3.5 py-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_6px_16px_-10px_rgba(0,0,0,0.15)] transition-opacity duration-200"
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
          <span className="text-stone-400">{task.estimateMinutes}分</span>
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
      </button>
    </li>
  );
}
