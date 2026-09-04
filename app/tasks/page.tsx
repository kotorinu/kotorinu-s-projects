"use client";

import { useMemo, useState } from "react";
import { monthEndStates, tasks as allTasks } from "@/lib/dummy-data";
import { daysBetween, formatMd, isSameMonth, monthKeyOf, monthLabel, todayStr } from "@/lib/date";
import { computeProgress } from "@/lib/progress";
import ProgressBar from "@/components/ProgressBar";
import type { Area, Priority, Task, TaskStatus } from "@/lib/types";

const today = todayStr();

type FilterKey = "全部" | "未着手" | "進行中" | "AI担当" | Area;

const FILTERS: FilterKey[] = ["全部", "未着手", "進行中", "AI担当", "営業代行", "RIALA", "GENESIS", "その他"];

type SortKey = "期限順" | "重要度" | "緊急度";

const SORTS: SortKey[] = ["期限順", "重要度", "緊急度"];

const priorityRank: Record<Priority, number> = { 高: 3, 中: 2, 低: 1 };

const areaStyle: Record<Area, string> = {
  営業代行: "bg-sky-50 text-sky-700",
  RIALA: "bg-violet-50 text-violet-700",
  GENESIS: "bg-teal-50 text-teal-700",
  その他: "bg-stone-100 text-stone-500",
};

const statusDot: Record<TaskStatus, string> = {
  未着手: "bg-stone-300",
  進行中: "bg-accent",
  待ち: "bg-stone-300",
  完了: "bg-stone-800",
  Archive: "bg-stone-200",
};

export default function TaskMapPage() {
  const [monthOffset, setMonthOffset] = useState(0);
  const [filter, setFilter] = useState<FilterKey>("未着手");
  const [sort, setSort] = useState<SortKey>("期限順");

  const monthKey = monthKeyOf(monthOffset);

  const monthTasks = useMemo(
    () => allTasks.filter((t) => isSameMonth(t.deadline, monthKey)),
    [monthKey]
  );

  const progress = useMemo(() => computeProgress(monthTasks), [monthTasks]);

  const stats = useMemo(() => {
    const inProgress = monthTasks.filter((t) => t.status === "進行中").length;
    const notStarted = monthTasks.filter((t) => t.status === "未着手").length;
    const aiOwned = monthTasks.filter((t) => t.owner !== "Human").length;
    const overdue = monthTasks.filter(
      (t) => t.status !== "完了" && t.status !== "Archive" && daysBetween(today, t.deadline) < 0
    ).length;
    const within7 = monthTasks.filter((t) => {
      const diff = daysBetween(today, t.deadline);
      return t.status !== "完了" && t.status !== "Archive" && diff >= 0 && diff <= 7;
    }).length;
    return { inProgress, notStarted, aiOwned, overdue, within7 };
  }, [monthTasks]);

  const visibleTasks = useMemo(() => {
    let list = monthTasks;
    if (filter === "未着手") list = list.filter((t) => t.status === "未着手");
    else if (filter === "進行中") list = list.filter((t) => t.status === "進行中");
    else if (filter === "AI担当") list = list.filter((t) => t.owner !== "Human");
    else if (filter !== "全部") list = list.filter((t) => t.area === filter);

    const sorted = [...list];
    if (sort === "期限順") sorted.sort((a, b) => (a.deadline < b.deadline ? -1 : a.deadline > b.deadline ? 1 : 0));
    else if (sort === "重要度") sorted.sort((a, b) => priorityRank[b.importance] - priorityRank[a.importance]);
    else sorted.sort((a, b) => priorityRank[b.urgency] - priorityRank[a.urgency]);
    return sorted;
  }, [monthTasks, filter, sort]);

  const endStates = monthEndStates.filter((s) => s.monthKey === monthKey);

  return (
    <div className="flex flex-col">
      <header className="sticky top-0 z-10 bg-gradient-to-b from-background via-background to-transparent px-5 pb-2 pt-6">
        <p className="text-xs font-bold tracking-widest text-accent-dark">AI WORK OS</p>
        <div className="mt-0.5 flex items-center justify-between">
          <h1 className="text-[26px] font-black tracking-tight">TASK MAP</h1>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setMonthOffset((v) => v - 1)}
              aria-label="前の月"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-stone-400 shadow-sm active:scale-90"
            >
              ◀
            </button>
            <span className="w-[4.5rem] text-center text-sm font-bold tabular-nums">{monthLabel(monthKey)}</span>
            <button
              type="button"
              onClick={() => setMonthOffset((v) => v + 1)}
              aria-label="次の月"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-stone-400 shadow-sm active:scale-90"
            >
              ▶
            </button>
          </div>
        </div>
      </header>

      <section className="mx-5 mt-1 rounded-3xl bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,0,0,0.12)]">
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-bold text-stone-800">今月の前進</p>
          <p className="tabular-nums text-xs font-bold text-stone-400">
            完了 <span className="text-base text-accent-dark">{progress.done}</span> / {progress.total}
          </p>
        </div>
        <div className="mt-2.5 flex items-center gap-3">
          <ProgressBar pct={progress.pct} />
          <span className="tabular-nums w-10 shrink-0 text-right text-lg font-black text-accent-dark">
            {progress.pct}%
          </span>
        </div>

        <div className="mt-3 grid grid-cols-4 gap-2 border-t border-stone-100 pt-3 text-center">
          <Stat label="進行中" value={stats.inProgress} />
          <Stat label="未着手" value={stats.notStarted} />
          <Stat label="AI担当" value={stats.aiOwned} accent />
          <Stat label="7日以内" value={stats.within7} />
        </div>
        {stats.overdue > 0 && (
          <div className="mt-2 flex items-center gap-1.5 rounded-xl bg-danger-soft px-3 py-1.5 text-xs font-bold text-danger">
            <span>⚠</span> 期限超過 {stats.overdue}件
          </div>
        )}
      </section>

      <section className="mt-4 px-5">
        <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors ${
                filter === f
                  ? "bg-accent text-white shadow-[0_4px_12px_-4px_rgba(234,91,12,0.6)]"
                  : "bg-white text-stone-500 shadow-sm"
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        <div className="mt-2 flex items-center gap-2">
          <span className="text-[11px] font-medium text-stone-400">並び替え</span>
          <div className="flex gap-1 rounded-full bg-stone-100 p-1">
            {SORTS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSort(s)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition-colors ${
                  sort === s ? "bg-white text-stone-800 shadow-sm" : "text-stone-400"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-2.5 flex flex-col gap-1.5 px-5">
        {visibleTasks.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-3xl border border-dashed border-stone-200 py-10 text-center">
            <span className="text-3xl">📭</span>
            <p className="text-sm text-stone-400">該当するタスクはありません</p>
          </div>
        ) : (
          visibleTasks.map((t) => <TaskListRow key={t.id} task={t} />)
        )}
      </section>

      <section className="mt-6 px-5 pb-4">
        <h2 className="mb-2.5 text-sm font-bold text-stone-800">{monthLabel(monthKey)}末、こうなっていたい</h2>
        <div className="flex flex-col gap-2">
          {endStates.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-stone-200 px-4 py-4 text-center text-xs text-stone-400">
              この月の月末目標はまだ設定されていません
            </p>
          ) : (
            endStates.map((s) => (
              <div key={s.area} className="rounded-2xl bg-white px-4 py-3 shadow-sm">
                <p className="text-[11px] font-bold text-accent-dark">{s.area}</p>
                <p className="mt-0.5 text-sm font-medium text-stone-700">{s.state}</p>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div>
      <p className={`tabular-nums text-lg font-black ${accent ? "text-accent-dark" : "text-stone-800"}`}>{value}</p>
      <p className="text-[10px] font-medium text-stone-400">{label}</p>
    </div>
  );
}

function TaskListRow({ task }: { task: Task }) {
  const overdue =
    task.status !== "完了" && task.status !== "Archive" && daysBetween(today, task.deadline) < 0;
  const done = task.status === "完了";
  return (
    <div
      className="flex items-center gap-2.5 rounded-xl bg-white px-3 py-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_10px_-8px_rgba(0,0,0,0.15)]"
      style={{ opacity: done ? 0.55 : 1 }}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusDot[task.status]}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className={`truncate text-[13px] font-bold text-stone-800 ${done ? "line-through" : ""}`}>
            {task.title}
          </p>
          <span className={`shrink-0 text-[11px] font-bold ${overdue ? "text-danger" : "text-stone-400"}`}>
            {formatMd(task.deadline)}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-1.5">
          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${areaStyle[task.area]}`}>
            {task.area}
          </span>
          {task.importance === "高" && (
            <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-black text-white">MAX</span>
          )}
          <span className="text-[10px] font-medium text-stone-400">
            {task.owner === "Human" ? "Human" : task.owner === "AI" ? "AI" : "Hybrid"}
          </span>
        </div>
      </div>
    </div>
  );
}
