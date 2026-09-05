"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fixedCalendarEvents, monthEndStates, outcomes, tasks as allTasks, timeBlocks } from "@/lib/dummy-data";
import {
  dayOfMonth,
  daysBetween,
  daysInMonth,
  formatMd,
  isSameMonth,
  monthKeyOf,
  monthLabel,
  startOfWeek,
  weekDates,
} from "@/lib/date";
import { computeProgress } from "@/lib/progress";
import { capabilityBadge, capabilityGroup, capabilityOwnerLabel, deliveryStatusLabel, CAPABILITY_GROUPS, CapabilityGroup } from "@/lib/capability";
import { confidenceLabel, eventsForMonth, planningConstraintLabel } from "@/lib/calendar";
import { useTodayExecution } from "@/lib/todayExecutionStore";
import { buildWeekEntries, WeekEntry } from "@/lib/weekPlan";
import ProgressBar from "@/components/ProgressBar";
import TaskDetailSheet from "@/components/TaskDetailSheet";
import OutcomeDetailSheet from "@/components/OutcomeDetailSheet";
import type { Area, FixedEventType, Outcome, Priority, Task, TaskStatus } from "@/lib/types";

const WEEKDAY_LABEL = ["日", "月", "火", "水", "木", "金", "土"];

type QuickFilter = "全部" | "未着手" | "進行中" | "AI" | "7日以内";

const AREAS: Area[] = ["営業代行", "RIALA", "GENESIS", "Skill Plus", "その他"];
const PRIORITIES: Priority[] = ["高", "中", "低"];

type SortKey = "期限順" | "重要度" | "緊急度";

const SORTS: SortKey[] = ["期限順", "重要度", "緊急度"];

const priorityRank: Record<Priority, number> = { 高: 3, 中: 2, 低: 1 };

const areaStyle: Record<Area, string> = {
  営業代行: "bg-sky-50 text-sky-700",
  RIALA: "bg-violet-50 text-violet-700",
  GENESIS: "bg-teal-50 text-teal-700",
  "Skill Plus": "bg-amber-50 text-amber-700",
  その他: "bg-stone-100 text-stone-500",
};

const areaDotColor: Record<Area, string> = {
  営業代行: "#0284c7",
  RIALA: "#7c3aed",
  GENESIS: "#0d9488",
  "Skill Plus": "#b45309",
  その他: "#a8a29e",
};

const fixedEventTypeIcon: Record<FixedEventType, string> = {
  MILESTONE: "🏕",
  TRAVEL: "✈",
  FIXED_APPOINTMENT: "📌",
};

const statusDot: Record<TaskStatus, string> = {
  未着手: "bg-stone-300",
  進行中: "bg-accent",
  待ち: "bg-stone-300",
  完了: "bg-stone-800",
  Archive: "bg-stone-200",
};

export default function TaskMapPage() {
  // currentDate comes from the Day Rollover store, not a module-level
  // todayStr() — this page is statically prerendered, so a module const
  // would bake in the deploy-time date and never advance for any viewer
  // (期限超過/7日以内 would silently go stale after deploy day).
  const { currentDate: today, workDateOverrides } = useTodayExecution();
  const [monthOffset, setMonthOffset] = useState(0);
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("全部");
  const [refineOpen, setRefineOpen] = useState(false);
  const [areaFilter, setAreaFilter] = useState<Area | "全部">("全部");
  const [capFilter, setCapFilter] = useState<CapabilityGroup | "全部">("全部");
  const [importanceFilter, setImportanceFilter] = useState<Priority | "全部">("全部");
  const [urgencyFilter, setUrgencyFilter] = useState<Priority | "全部">("全部");
  const [sort, setSort] = useState<SortKey>("期限順");
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [selectedOutcome, setSelectedOutcome] = useState<Outcome | null>(null);
  const [fixedScheduleOpen, setFixedScheduleOpen] = useState(false);

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
  }, [monthTasks, today]);

  // Monthly Calendar Map (2026-09-06 readability round): a real day-by-day
  // grid replaces the old "1週目/2週目/3週目/4週目" quartile-bucket rows —
  // the goal here is "どこが詰まっているか" at a glance, not task detail
  // (that's what the Task List below is for). Each cell holds at most a
  // few Area dots, never full task text.
  type MonthCell = { day: number; date: string; areas: Area[] } | null;
  const monthCells = useMemo<MonthCell[]>(() => {
    const total = daysInMonth(monthKey);
    const firstDow = new Date(`${monthKey}-01T00:00:00`).getDay();
    const cells: MonthCell[] = [];
    for (let i = 0; i < firstDow; i++) cells.push(null);
    for (let d = 1; d <= total; d++) {
      const date = `${monthKey}-${String(d).padStart(2, "0")}`;
      const areas = monthTasks.filter((t) => t.deadline === date).map((t) => t.area);
      cells.push({ day: d, date, areas });
    }
    return cells;
  }, [monthTasks, monthKey]);

  // Week View (top priority per §6): always the real week containing
  // `today`, not the currently-browsed month — switching months shouldn't
  // move this. workDateOverrides comes from Day Rollover Carryover
  // decisions (§10-11 of the previous round) so a Task moved via "今日やる"
  // actually shows up here too.
  const weekStart = useMemo(() => startOfWeek(today), [today]);
  const weekDateList = useMemo(() => weekDates(weekStart), [weekStart]);
  const weekEntries = useMemo(
    () => buildWeekEntries(weekDateList, allTasks, timeBlocks, fixedCalendarEvents, workDateOverrides),
    [weekDateList, workDateOverrides]
  );

  const activeRefineCount = [areaFilter, capFilter, importanceFilter, urgencyFilter].filter(
    (v) => v !== "全部"
  ).length;

  function applyFilters<T extends Task>(list: T[]): T[] {
    let out = list;
    if (quickFilter === "未着手") out = out.filter((t) => t.status === "未着手");
    else if (quickFilter === "進行中") out = out.filter((t) => t.status === "進行中");
    else if (quickFilter === "AI") out = out.filter((t) => t.aiCapability !== "HUMAN");
    else if (quickFilter === "7日以内")
      out = out.filter((t) => {
        if (t.status === "完了" || t.status === "Archive" || t.deadline === null) return false;
        const diff = daysBetween(today, t.deadline);
        return diff >= 0 && diff <= 7;
      });

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
  const monthFixedEvents = eventsForMonth(fixedCalendarEvents, monthKey);

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

      <WeekView
        dates={weekDateList}
        entriesByDate={weekEntries}
        today={today}
        onOpenTask={(taskId) => {
          const t = allTasks.find((task) => task.id === taskId);
          if (t) setSelectedTask(t);
        }}
      />

      <section className="mx-5 mt-2.5 rounded-3xl bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,0,0,0.12)]">
        <p className="mb-2.5 text-xs font-bold text-stone-500">{monthLabel(monthKey)}の締切カレンダー</p>
        <div className="grid grid-cols-7 gap-y-1.5 text-center">
          {WEEKDAY_LABEL.map((w) => (
            <span key={w} className="text-[9px] font-bold text-stone-300">
              {w}
            </span>
          ))}
          {monthCells.map((c, i) =>
            c === null ? (
              <span key={`blank-${i}`} />
            ) : (
              <div
                key={c.date}
                className={`mx-auto flex h-9 w-9 flex-col items-center justify-center gap-0.5 rounded-lg ${
                  c.date === today ? "bg-accent-soft ring-1 ring-accent" : ""
                }`}
              >
                <span className={`text-[10px] font-bold ${c.date === today ? "text-accent-dark" : "text-stone-500"}`}>
                  {c.day}
                </span>
                {c.areas.length > 0 && (
                  <div className="flex items-center gap-0.5">
                    {c.areas.slice(0, 3).map((a, j) => (
                      <span key={j} className="h-1 w-1 rounded-full" style={{ backgroundColor: areaDotColor[a] }} />
                    ))}
                    {c.areas.length > 3 && <span className="text-[7px] font-bold text-stone-400">+{c.areas.length - 3}</span>}
                  </div>
                )}
              </div>
            )
          )}
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
          <StatFilterButton
            label="進行中"
            value={stats.inProgress}
            active={quickFilter === "進行中"}
            onClick={() => setQuickFilter((f) => (f === "進行中" ? "全部" : "進行中"))}
          />
          <StatFilterButton
            label="未着手"
            value={stats.notStarted}
            active={quickFilter === "未着手"}
            onClick={() => setQuickFilter((f) => (f === "未着手" ? "全部" : "未着手"))}
          />
          <StatFilterButton
            label="AI担当"
            value={stats.aiOwned}
            accent
            active={quickFilter === "AI"}
            onClick={() => setQuickFilter((f) => (f === "AI" ? "全部" : "AI"))}
          />
          <StatFilterButton
            label="7日以内"
            value={stats.within7}
            active={quickFilter === "7日以内"}
            onClick={() => setQuickFilter((f) => (f === "7日以内" ? "全部" : "7日以内"))}
          />
        </div>
        {stats.overdue > 0 && (
          <div className="mt-2 flex items-center gap-1.5 rounded-xl bg-danger-soft px-3 py-1.5 text-xs font-bold text-danger">
            <span>⚠</span> 期限超過 {stats.overdue}件
          </div>
        )}
      </section>

      <section className="mt-2.5 px-5">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setRefineOpen((v) => !v)}
            className={`flex shrink-0 items-center gap-1 rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors ${
              activeRefineCount > 0 ? "bg-stone-800 text-white" : "bg-white text-stone-500 shadow-sm"
            }`}
          >
            絞り込み{activeRefineCount > 0 ? ` ${activeRefineCount}` : ""}
            <span className={`text-[9px] transition-transform ${refineOpen ? "rotate-180" : ""}`}>▾</span>
          </button>

          <div className="flex shrink-0 items-center gap-1.5">
            <span className="text-[10px] font-medium text-stone-400">並び替え</span>
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
        </div>

        {(quickFilter !== "全部" || activeRefineCount > 0) && (
          <button
            type="button"
            onClick={() => {
              setQuickFilter("全部");
              resetRefine();
            }}
            className="mt-1.5 text-[11px] font-bold text-stone-400"
          >
            フィルター解除
          </button>
        )}

        {refineOpen && (
          <div className="mt-2 flex flex-col gap-3 rounded-2xl bg-white p-3.5 shadow-sm">
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
      </section>

      <section className="mt-2.5 flex flex-col gap-1.5 px-5">
        {visibleTasks.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-3xl border border-dashed border-stone-200 py-10 text-center">
            <span className="text-3xl">📭</span>
            <p className="text-sm text-stone-400">該当するタスクはありません</p>
          </div>
        ) : (
          visibleTasks.map((t) => <TaskListRow key={t.id} task={t} today={today} onOpen={() => setSelectedTask(t)} />)
        )}
      </section>

      {visibleUndatedTasks.length > 0 && (
        <section className="mt-5 px-5">
          <h2 className="mb-2 text-xs font-bold text-stone-400">期限未設定（{visibleUndatedTasks.length}）</h2>
          <div className="flex flex-col gap-1.5">
            {visibleUndatedTasks.map((t) => (
              <TaskListRow key={t.id} task={t} today={today} onOpen={() => setSelectedTask(t)} />
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

      {monthFixedEvents.length > 0 && (
        <section className="px-5 pb-6">
          <button
            type="button"
            onClick={() => setFixedScheduleOpen((v) => !v)}
            className="flex w-full items-center gap-2 rounded-2xl border border-dashed border-stone-200 px-4 py-2.5 text-left"
          >
            <span className="text-[11px] font-bold text-stone-400">
              {monthLabel(monthKey)}の固定予定 {monthFixedEvents.length}件
            </span>
            <span className={`ml-auto text-[9px] text-stone-300 transition-transform ${fixedScheduleOpen ? "rotate-180" : ""}`}>
              ▾
            </span>
          </button>
          {fixedScheduleOpen && (
            <div className="mt-1.5 flex flex-col gap-1.5">
              {monthFixedEvents.map((e) => {
                const constraintLabel = planningConstraintLabel(e.planningConstraint);
                const dateLabel =
                  e.startDate === e.endDate
                    ? `${formatMd(e.startDate)}${e.startTime ? ` ${e.startTime}〜${e.endTime}` : ""}`
                    : `${formatMd(e.startDate)}〜${formatMd(e.endDate)}`;
                return (
                  <div key={e.id} className="rounded-xl bg-stone-50 px-3.5 py-2.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-[12px] font-bold text-stone-600">
                        {fixedEventTypeIcon[e.type]} {e.title}
                      </p>
                      <span className="shrink-0 text-[10px] font-bold text-stone-400">{dateLabel}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {constraintLabel && (
                        <span className="rounded-full bg-stone-200 px-2 py-0.5 text-[10px] font-bold text-stone-600">
                          {constraintLabel}
                        </span>
                      )}
                      <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-bold text-stone-400">
                        {confidenceLabel(e.confidence)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {selectedTask && <TaskDetailSheet task={selectedTask} onClose={() => setSelectedTask(null)} />}
      {selectedOutcome && <OutcomeDetailSheet outcome={selectedOutcome} onClose={() => setSelectedOutcome(null)} />}
    </div>
  );
}

const weekEntryStyle: Record<WeekEntry["kind"], string> = {
  FIXED: "bg-stone-100 text-stone-500",
  DEADLINE: "bg-danger-soft text-danger",
  PLANNED_WORK: "bg-accent-soft text-accent-dark",
};

// TASK MAP Week View (2026-09-06): "今週、いつ何をやるか" at a glance —
// not a Google Calendar replacement (PRD.md's Google Calendar semantics
// section), so this stays compact: a handful of short entries per day, not
// a full time-grid. Horizontal scroll on narrow screens, today scrolled
// into view on mount so it's the first thing visible without swiping.
function WeekView({
  dates,
  entriesByDate,
  today,
  onOpenTask,
}: {
  dates: string[];
  entriesByDate: Map<string, WeekEntry[]>;
  today: string;
  onOpenTask: (taskId: string) => void;
}) {
  const todayRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    todayRef.current?.scrollIntoView({ behavior: "auto", inline: "start", block: "nearest" });
  }, []);

  return (
    <section className="mt-1 px-5">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-sm font-bold text-stone-800">今週</h2>
        <span className="text-[11px] font-bold text-stone-400">
          {formatMd(dates[0])}〜{formatMd(dates[6])}
        </span>
      </div>
      <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1" style={{ scrollSnapType: "x proximity" }}>
        {dates.map((d) => {
          const isToday = d === today;
          const entries = entriesByDate.get(d) ?? [];
          const weekday = WEEKDAY_LABEL[new Date(d + "T00:00:00").getDay()];
          return (
            <div
              key={d}
              ref={isToday ? todayRef : undefined}
              className={`w-[108px] shrink-0 rounded-2xl p-2.5 ${
                isToday ? "bg-accent-soft ring-2 ring-accent" : "bg-white shadow-sm"
              }`}
              style={{ scrollSnapAlign: "start" }}
            >
              <p className={`text-[11px] font-bold ${isToday ? "text-accent-dark" : "text-stone-400"}`}>
                {weekday} <span className="tabular-nums">{dayOfMonth(d)}</span>
              </p>
              <div className="mt-1.5 flex flex-col gap-1">
                {entries.length === 0 ? (
                  <p className="text-[10px] text-stone-300">—</p>
                ) : (
                  entries.slice(0, 4).map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => e.taskId && onOpenTask(e.taskId)}
                      disabled={!e.taskId}
                      className={`truncate rounded-lg px-1.5 py-1 text-left text-[10px] font-bold ${weekEntryStyle[e.kind]}`}
                    >
                      {e.time && <span className="tabular-nums opacity-70">{e.time} </span>}
                      {e.label}
                    </button>
                  ))
                )}
                {entries.length > 4 && (
                  <p className="text-[9px] font-bold text-stone-400">+{entries.length - 4}件</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
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

function StatFilterButton({
  label,
  value,
  accent,
  active,
  onClick,
}: {
  label: string;
  value: number;
  accent?: boolean;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl py-1 transition-colors ${active ? "bg-accent-soft ring-1 ring-accent" : ""}`}
    >
      <p
        className={`tabular-nums text-lg font-black ${
          active ? "text-accent-dark" : accent ? "text-accent-dark" : "text-stone-800"
        }`}
      >
        {value}
      </p>
      <p className={`text-[10px] font-medium ${active ? "text-accent-dark" : "text-stone-400"}`}>{label}</p>
    </button>
  );
}

function TaskListRow({ task, today, onOpen }: { task: Task; today: string; onOpen: () => void }) {
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
