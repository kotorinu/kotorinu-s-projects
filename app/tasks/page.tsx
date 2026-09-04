"use client";

import { useMemo, useState } from "react";
import { monthEndStates, outcomes, tasks as allTasks } from "@/lib/dummy-data";
import {
  dayOfMonth,
  daysBetween,
  daysInMonth,
  formatMd,
  isSameMonth,
  monthKeyOf,
  monthLabel,
  todayStr,
} from "@/lib/date";
import { computeProgress } from "@/lib/progress";
import { capabilityBadge, capabilityGroup, capabilityOwnerLabel, deliveryStatusLabel, CAPABILITY_GROUPS, CapabilityGroup } from "@/lib/capability";
import ProgressBar from "@/components/ProgressBar";
import TaskDetailSheet from "@/components/TaskDetailSheet";
import OutcomeDetailSheet from "@/components/OutcomeDetailSheet";
import type { Area, Outcome, Priority, Task, TaskStatus } from "@/lib/types";

const today = todayStr();

type QuickFilter = "全部" | "未着手" | "進行中" | "AI";

const QUICK_FILTERS: QuickFilter[] = ["全部", "未着手", "進行中", "AI"];

const AREAS: Area[] = ["営業代行", "RIALA", "GENESIS", "その他"];
const PRIORITIES: Priority[] = ["高", "中", "低"];

type SortKey = "期限順" | "重要度" | "緊急度";

const SORTS: SortKey[] = ["期限順", "重要度", "緊急度"];

const priorityRank: Record<Priority, number> = { 高: 3, 中: 2, 低: 1 };

const areaStyle: Record<Area, string> = {
  営業代行: "bg-sky-50 text-sky-700",
  RIALA: "bg-violet-50 text-violet-700",
  GENESIS: "bg-teal-50 text-teal-700",
  その他: "bg-stone-100 text-stone-500",
};

const areaDotColor: Record<Area, string> = {
  営業代行: "#0284c7",
  RIALA: "#7c3aed",
  GENESIS: "#0d9488",
  その他: "#a8a29e",
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
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("未着手");
  const [refineOpen, setRefineOpen] = useState(false);
  const [areaFilter, setAreaFilter] = useState<Area | "全部">("全部");
  const [capFilter, setCapFilter] = useState<CapabilityGroup | "全部">("全部");
  const [importanceFilter, setImportanceFilter] = useState<Priority | "全部">("全部");
  const [urgencyFilter, setUrgencyFilter] = useState<Priority | "全部">("全部");
  const [sort, setSort] = useState<SortKey>("期限順");
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [selectedOutcome, setSelectedOutcome] = useState<Outcome | null>(null);

  const monthKey = monthKeyOf(monthOffset);

  const monthTasks = useMemo(
    () =>
      allTasks.filter(
        (t): t is Task & { deadline: string } => t.deadline !== null && isSameMonth(t.deadline, monthKey)
      ),
    [monthKey]
  );

  const undatedTasks = useMemo(() => allTasks.filter((t) => t.deadline === null), []);

  const progress = useMemo(() => computeProgress(monthTasks), [monthTasks]);

  const stats = useMemo(() => {
    const inProgress = monthTasks.filter((t) => t.status === "進行中").length;
    const notStarted = monthTasks.filter((t) => t.status === "未着手").length;
    const aiOwned = monthTasks.filter((t) => t.aiCapability !== "HUMAN").length;
    const overdue = monthTasks.filter(
      (t) => t.status !== "完了" && t.status !== "Archive" && daysBetween(today, t.deadline) < 0
    ).length;
    const within7 = monthTasks.filter((t) => {
      const diff = daysBetween(today, t.deadline);
      return t.status !== "完了" && t.status !== "Archive" && diff >= 0 && diff <= 7;
    }).length;
    return { inProgress, notStarted, aiOwned, overdue, within7 };
  }, [monthTasks]);

  const weekBuckets = useMemo(() => {
    const total = daysInMonth(monthKey);
    const boundaries = [1, 8, 15, 22, total + 1];
    const buckets: Area[][] = [[], [], [], []];
    for (const t of monthTasks) {
      const day = dayOfMonth(t.deadline);
      let idx = boundaries.findIndex((b, i) => day >= b && day < boundaries[i + 1]);
      if (idx === -1) idx = 3;
      buckets[idx].push(t.area);
    }
    return buckets;
  }, [monthTasks, monthKey]);

  const todayBucketIndex = useMemo(() => {
    if (monthOffset !== 0) return null;
    const total = daysInMonth(monthKey);
    const boundaries = [1, 8, 15, 22, total + 1];
    const day = dayOfMonth(today);
    const idx = boundaries.findIndex((b, i) => day >= b && day < boundaries[i + 1]);
    return idx === -1 ? 3 : idx;
  }, [monthOffset, monthKey]);

  const activeRefineCount = [areaFilter, capFilter, importanceFilter, urgencyFilter].filter(
    (v) => v !== "全部"
  ).length;

  function applyFilters<T extends Task>(list: T[]): T[] {
    let out = list;
    if (quickFilter === "未着手") out = out.filter((t) => t.status === "未着手");
    else if (quickFilter === "進行中") out = out.filter((t) => t.status === "進行中");
    else if (quickFilter === "AI") out = out.filter((t) => t.aiCapability !== "HUMAN");

    if (areaFilter !== "全部") out = out.filter((t) => t.area === areaFilter);
    if (capFilter !== "全部") out = out.filter((t) => capabilityGroup(t.aiCapability) === capFilter);
    if (importanceFilter !== "全部") out = out.filter((t) => t.importance === importanceFilter);
    if (urgencyFilter !== "全部") out = out.filter((t) => t.urgency === urgencyFilter);
    return out;
  }

  const visibleTasks = useMemo(() => {
    const list = applyFilters(monthTasks);
    const sorted = [...list];
    if (sort === "期限順") sorted.sort((a, b) => (a.deadline < b.deadline ? -1 : a.deadline > b.deadline ? 1 : 0));
    else if (sort === "重要度") sorted.sort((a, b) => priorityRank[b.importance] - priorityRank[a.importance]);
    else sorted.sort((a, b) => priorityRank[b.urgency] - priorityRank[a.urgency]);
    return sorted;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthTasks, quickFilter, areaFilter, capFilter, importanceFilter, urgencyFilter, sort]);

  const visibleUndatedTasks = useMemo(() => {
    const list = applyFilters(undatedTasks);
    if (sort === "重要度") return [...list].sort((a, b) => priorityRank[b.importance] - priorityRank[a.importance]);
    if (sort === "緊急度") return [...list].sort((a, b) => priorityRank[b.urgency] - priorityRank[a.urgency]);
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [undatedTasks, quickFilter, areaFilter, capFilter, importanceFilter, urgencyFilter, sort]);

  const endStates = monthEndStates.filter((s) => s.monthKey === monthKey);

  function resetRefine() {
    setAreaFilter("全部");
    setCapFilter("全部");
    setImportanceFilter("全部");
    setUrgencyFilter("全部");
  }

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
        <p className="mb-2.5 text-xs font-bold text-stone-500">{monthLabel(monthKey)}の締切分布</p>
        <div className="grid grid-cols-4 gap-1.5">
          {weekBuckets.map((bucket, i) => (
            <div key={i} className="flex flex-col items-center gap-1.5 rounded-xl bg-stone-50 py-2">
              <p className="text-[10px] font-bold text-stone-400">{i + 1}週目</p>
              <div className="flex min-h-[16px] flex-wrap items-center justify-center gap-0.5 px-1">
                {bucket.length === 0 ? (
                  <span className="h-1 w-1 rounded-full bg-stone-200" />
                ) : (
                  bucket.map((area, j) => (
                    <span
                      key={j}
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: areaDotColor[area] }}
                    />
                  ))
                )}
              </div>
              <span className={`text-[9px] font-bold text-accent-dark ${todayBucketIndex === i ? "" : "invisible"}`}>
                ▲今日
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-5 mt-2.5 rounded-3xl bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,0,0,0.12)]">
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
        <div className="flex items-center gap-1.5">
          {QUICK_FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setQuickFilter(f)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors ${
                quickFilter === f
                  ? "bg-accent text-white shadow-[0_4px_12px_-4px_rgba(234,91,12,0.6)]"
                  : "bg-white text-stone-500 shadow-sm"
              }`}
            >
              {f}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setRefineOpen((v) => !v)}
            className={`ml-auto flex shrink-0 items-center gap-1 rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors ${
              activeRefineCount > 0 ? "bg-stone-800 text-white" : "bg-white text-stone-500 shadow-sm"
            }`}
          >
            絞り込み{activeRefineCount > 0 ? ` ${activeRefineCount}` : ""}
            <span className={`text-[9px] transition-transform ${refineOpen ? "rotate-180" : ""}`}>▾</span>
          </button>
        </div>

        {refineOpen && (
          <div className="mt-2.5 flex flex-col gap-3 rounded-2xl bg-white p-3.5 shadow-sm">
            <RefineGroup label="Area" options={["全部", ...AREAS]} value={areaFilter} onChange={setAreaFilter} />
            <RefineGroup label="担当" options={["全部", ...CAPABILITY_GROUPS]} value={capFilter} onChange={setCapFilter} />
            <RefineGroup label="重要度" options={["全部", ...PRIORITIES]} value={importanceFilter} onChange={setImportanceFilter} />
            <RefineGroup label="緊急度" options={["全部", ...PRIORITIES]} value={urgencyFilter} onChange={setUrgencyFilter} />
            {activeRefineCount > 0 && (
              <button
                type="button"
                onClick={resetRefine}
                className="self-start text-[11px] font-bold text-stone-400"
              >
                絞り込みをクリア
              </button>
            )}
          </div>
        )}

        <div className="mt-2.5 flex items-center gap-2">
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
          visibleTasks.map((t) => <TaskListRow key={t.id} task={t} onOpen={() => setSelectedTask(t)} />)
        )}
      </section>

      {visibleUndatedTasks.length > 0 && (
        <section className="mt-5 px-5">
          <h2 className="mb-2 text-xs font-bold text-stone-400">期限未設定（{visibleUndatedTasks.length}）</h2>
          <div className="flex flex-col gap-1.5">
            {visibleUndatedTasks.map((t) => (
              <TaskListRow key={t.id} task={t} onOpen={() => setSelectedTask(t)} />
            ))}
          </div>
        </section>
      )}

      <section className="mt-6 px-5 pb-4">
        <h2 className="mb-2.5 text-sm font-bold text-stone-800">{monthLabel(monthKey)}末、こうなっていたい</h2>
        <div className="flex flex-col gap-2">
          {endStates.length === 0 && outcomes.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-stone-200 px-4 py-4 text-center text-xs text-stone-400">
              この月の月末目標はまだ設定されていません
            </p>
          ) : (
            <>
              {endStates.map((s) => (
                <div key={s.area} className="rounded-2xl bg-white px-4 py-3 shadow-sm">
                  <p className="text-[11px] font-bold text-accent-dark">{s.area}</p>
                  <p className="mt-0.5 text-sm font-medium text-stone-700">{s.state}</p>
                </div>
              ))}
              {outcomes.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setSelectedOutcome(o)}
                  className="rounded-2xl bg-white px-4 py-3 text-left shadow-sm"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-[11px] font-bold text-accent-dark">{o.area}</p>
                    <span className="text-[10px] font-bold text-stone-300">詳しく見る ＞</span>
                  </div>
                  <p className="mt-0.5 text-sm font-medium text-stone-700">{o.title}</p>
                </button>
              ))}
            </>
          )}
        </div>
      </section>

      {selectedTask && <TaskDetailSheet task={selectedTask} onClose={() => setSelectedTask(null)} />}
      {selectedOutcome && <OutcomeDetailSheet outcome={selectedOutcome} onClose={() => setSelectedOutcome(null)} />}
    </div>
  );
}

function RefineGroup<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: T[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-bold text-stone-400">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition-colors ${
              value === opt ? "bg-accent text-white" : "bg-stone-100 text-stone-500"
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
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

function TaskListRow({ task, onOpen }: { task: Task; onOpen: () => void }) {
  const overdue =
    task.deadline !== null &&
    task.status !== "完了" &&
    task.status !== "Archive" &&
    daysBetween(today, task.deadline) < 0;
  const done = task.status === "完了";
  const badge = capabilityBadge(task.aiCapability);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-2.5 rounded-xl bg-white px-3 py-2.5 text-left shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_10px_-8px_rgba(0,0,0,0.15)]"
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
          <span className="text-[10px] font-medium text-stone-400">{capabilityOwnerLabel(task.aiCapability)}</span>
          {badge.tone === "warning" && (
            <span className="rounded-full bg-danger-soft px-1.5 py-0.5 text-[10px] font-bold text-danger">
              ⚠ Blocked
            </span>
          )}
          {task.deliveryStatus && task.deliveryStatus !== "BLOCKED" && (
            <span
              className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                deliveryStatusLabel(task.deliveryStatus).tone === "accent"
                  ? "bg-accent-soft text-accent-dark"
                  : "bg-stone-100 text-stone-500"
              }`}
            >
              {deliveryStatusLabel(task.deliveryStatus).label}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
