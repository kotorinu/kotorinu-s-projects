"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { recurringTasks, tasks as allTasks } from "@/lib/dummy-data";
import { daysBetween, formatMd, todayStr } from "@/lib/date";
import type { Task } from "@/lib/types";
import ProgressBar from "@/components/ProgressBar";

const today = todayStr();
const weekday = ["日", "月", "火", "水", "木", "金", "土"][new Date().getDay()];

function isOpen(t: Task) {
  return t.status !== "完了" && t.status !== "Archive";
}

export default function TodayPage() {
  const [done, setDone] = useState<Set<string>>(new Set());
  const [recurringDone, setRecurringDone] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState(false);
  const [effectsOn, setEffectsOn] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function celebrate() {
    if (!effectsOn) return;
    setToast("完了！今日も1つ前進");
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 1000);
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
  const recurringDoneCount = recurringTasks.filter((r) => recurringDone.has(r.id)).length;

  function toggle(id: string) {
    const completing = !done.has(id);
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    if (completing) celebrate();
  }

  function toggleRecurring(id: string) {
    const completing = !recurringDone.has(id);
    setRecurringDone((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    if (completing) celebrate();
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

      {recurringTasks.length > 0 && (
        <section className="mx-5 mt-3 rounded-2xl bg-white px-4 py-3 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-stone-500">毎日の積み上げ</p>
            <p className="tabular-nums text-xs font-bold text-stone-400">
              {recurringDoneCount} / {recurringTasks.length}
            </p>
          </div>
          <ul className="mt-2 flex flex-col gap-1">
            {recurringTasks.map((r) => {
              const checked = recurringDone.has(r.id);
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => toggleRecurring(r.id)}
                    className="flex w-full items-center gap-2 rounded-lg py-1 text-left"
                  >
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 text-[8px] transition-colors ${
                        checked ? "border-accent bg-accent text-white" : "border-stone-200 text-transparent"
                      }`}
                    >
                      ✓
                    </span>
                    <span className={`text-[13px] font-medium ${checked ? "text-stone-300 line-through" : "text-stone-600"}`}>
                      {r.title}
                    </span>
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
              <TaskRow key={t.id} task={t} checked={done.has(t.id)} onToggle={() => toggle(t.id)} />
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

      <div
        className={`pointer-events-none fixed inset-x-0 bottom-24 z-30 flex justify-center px-6 transition-opacity duration-300 ${
          toast ? "opacity-100" : "opacity-0"
        }`}
      >
        {toast && (
          <div className="rounded-full bg-stone-900 px-4 py-2 text-xs font-bold text-white shadow-lg">{toast}</div>
        )}
      </div>
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
}: {
  task: Task;
  checked: boolean;
  onToggle: () => void;
}) {
  const overdue = daysBetween(today, task.deadline) < 0;
  const [burst, setBurst] = useState(false);
  const [prevChecked, setPrevChecked] = useState(checked);

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
      <div className="min-w-0 flex-1">
        <p className={`text-[15px] font-bold leading-snug ${checked ? "text-stone-400 line-through" : "text-stone-800"}`}>
          {task.title}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="rounded-full bg-stone-100 px-2 py-0.5 font-medium text-stone-500">{task.area}</span>
          <span className="text-stone-400">{task.estimateMinutes}分</span>
          {task.owner !== "Human" && (
            <span className="rounded-full bg-accent-soft px-2 py-0.5 font-bold text-accent-dark">
              {task.owner === "AI" ? "AI" : "Hybrid"}
            </span>
          )}
          <span className={`ml-auto font-bold ${overdue ? "text-danger" : "text-stone-400"}`}>
            期限 {formatMd(task.deadline)}
          </span>
        </div>
      </div>
    </li>
  );
}
