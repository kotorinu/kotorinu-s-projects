"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  areaProfiles,
  fixedCalendarEvents,
  monthEndStates,
  outcomes,
  tasks as allTasks,
} from "@/lib/dummy-data";
import { areaHeadline, areaRisks, buildAreaHome, nextBlockForArea } from "@/lib/areaHome";
import { allGapItems, blockers, outcomeMilestones } from "@/lib/dummy-data";
import { mainGap, resolveGaps } from "@/lib/gapBoard";
import { AREA_THEME, themeFor } from "@/lib/areaTheme";
import { liveTimeBlocks, planLastChangedAt, supersededByReschedule } from "@/lib/livePlan";
import { REPLAN_REASON_LABEL } from "@/lib/replan";
import PlanHealthBanner, { PlanOkMark, usePlanHealth } from "@/components/PlanHealthBanner";
import { phaseCoverage } from "@/lib/sales";
import { salesPhases } from "@/lib/dummy-data";
import AreaControlCard from "@/components/AreaControlCard";
import GapBoard from "@/components/GapBoard";
import BlockerPanel from "@/components/BlockerPanel";
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
import { useClock } from "@/lib/currentTime";
import { capabilityBadge, capabilityGroup, capabilityOwnerLabel, deliveryStatusLabel, CAPABILITY_GROUPS, CapabilityGroup } from "@/lib/capability";
import { confidenceLabel, eventsForMonth, planningConstraintLabel } from "@/lib/calendar";
import { useTodayExecution } from "@/lib/todayExecutionStore";
import { resolveSeries } from "@/lib/taskSeries";
import { tasksEffectiveOnDate } from "@/lib/dayPlan";
import {
  effectiveDeadline,
  effectiveLifecycle,
  effectiveWorkDate,
  isTaskBlocked,
  isTaskCommitted,
  isTaskDone,
  isTaskLive,
  isTaskOpen,
  overdueTasks as computeOverdueTasks,
} from "@/lib/taskState";
import { buildWeekEntries, WeekEntry } from "@/lib/weekPlan";
import ProgressBar from "@/components/ProgressBar";
import TaskDetailSheet from "@/components/TaskDetailSheet";
import OutcomeDetailSheet from "@/components/OutcomeDetailSheet";
import OverdueInbox from "@/components/OverdueInbox";
import DayDetailSheet from "@/components/DayDetailSheet";
import type { Area, FixedEventType, HomeArea, Outcome, Priority, Task, TaskStatus } from "@/lib/types";

const WEEKDAY_LABEL = ["日", "月", "火", "水", "木", "金", "土"];

type QuickFilter = "全部" | "未着手" | "進行中" | "AI" | "7日以内";

// 全量Task表示のスコープ (§6). "Taskが存在しているのに画面上から見つけ
// られない状態は禁止" — 「全部」は完了・やめたものも含めて必ず全件出す。
type Scope = "今月" | "全部" | "今日" | "今週" | "期限超過" | "Backlog" | "完了" | "整理済み";

// 2026-09-08: 「未スケジュール」became 「Backlog」— an unscheduled Task is no
// longer an anomaly to chase, it is an explicit state (§2). 「整理済み」holds
// the superseded / merged / archived ones so that nothing ever becomes
// unfindable (§6), while 「全部」stays literally everything.
const SCOPES: Scope[] = ["今月", "全部", "今日", "今週", "期限超過", "Backlog", "完了", "整理済み"];

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
  const {
    currentDate: today,
    workDateOverrides,
    completions,
    dispositions,
    deadlineOverrides,
    taskStartedAt,
    lifecycleOverrides,
    phaseOwnVersions,
    replanFlags,
    timeBlockOverrides,
    supersededBlockIds,
  } = useTodayExecution();
  const overlays = { completions, dispositions, deadlineOverrides, workDateOverrides, lifecycleOverrides };
  const [monthOffset, setMonthOffset] = useState(0);
  const [scope, setScope] = useState<Scope>("今月");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("全部");
  const [refineOpen, setRefineOpen] = useState(false);
  const [areaFilter, setAreaFilter] = useState<Area | "全部">("全部");
  const [capFilter, setCapFilter] = useState<CapabilityGroup | "全部">("全部");
  const [importanceFilter, setImportanceFilter] = useState<Priority | "全部">("全部");
  const [urgencyFilter, setUrgencyFilter] = useState<Priority | "全部">("全部");
  const [sort, setSort] = useState<SortKey>("期限順");
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [selectedOutcome, setSelectedOutcome] = useState<Outcome | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [fixedScheduleOpen, setFixedScheduleOpen] = useState(false);
  const [selectedArea, setSelectedArea] = useState<HomeArea>("営業代行");
  const [monthlyOpen, setMonthlyOpen] = useState(false);
  const [inventoryOpen, setInventoryOpen] = useState(false);
  // §16: one clock for the whole app, so TODAY and TASK MAP can never
  // disagree about what "now" is.
  const { nowHmValue } = useClock();

  // The live schedule includes blocks created by rescheduling and excludes
  // the ones they replaced (§10).
  const planBlocks = useMemo(
    () => liveTimeBlocks({ timeBlockOverrides, supersededBlockIds }),
    [timeBlockOverrides, supersededBlockIds]
  );

  // 自分版 is always derived from the three per-phase fields (§5) — never a
  // stored counter.
  const salesCoverage = useMemo(() => phaseCoverage(salesPhases, phaseOwnVersions), [phaseOwnVersions]);
  const salesOwn = { done: salesCoverage.ownVersionDone, total: salesCoverage.ownVersionAchievable };
  const gapProgressOverride = useMemo(
    () => ({
      "gap-sales-own-version": {
        done: salesCoverage.ownFieldsFilled,
        total: salesCoverage.ownFieldsTotal,
        unit: "項目（11フェーズ×3）",
      },
    }),
    [salesCoverage]
  );

  // §17/§22: blocks replaced by a reschedule — their Calendar events are now
  // stale, which is exactly what the diff needs to report as DELETE.
  const staleBlocks = useMemo(
    () => supersededByReschedule({ timeBlockOverrides, supersededBlockIds }),
    [timeBlockOverrides, supersededBlockIds]
  );

  // P0: the Calendar snapshot only vouches for the plan as it stood when it
  // was read. If the plan moved after that, say so instead of showing a 0
  // that was true yesterday.
  const planChangedAt = useMemo(() => planLastChangedAt({ timeBlockOverrides }), [timeBlockOverrides]);

  // §20: 出す/出さないの判断に必要なぶんだけ計算する。詳細は /system。
  const planHealth = usePlanHealth(
    allTasks,
    planBlocks,
    staleBlocks,
    overlays,
    { today, nowHm: nowHmValue },
    planChangedAt
  );

  // §33: a Task-backed gap takes its status from the Task, so the board and
  // the task list can never disagree.
  const gapsByArea = useMemo(() => {
    const started = new Set(taskStartedAt.keys());
    return Object.fromEntries(
      areaProfiles.map((prof) => [prof.area, resolveGaps(allGapItems, prof.area, allTasks, overlays, started)])
    ) as Record<HomeArea, ReturnType<typeof resolveGaps>>;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskStartedAt, completions, dispositions, deadlineOverrides, workDateOverrides, lifecycleOverrides]);

  const milestoneProgress = useMemo(() => {
    const ms = outcomeMilestones.filter((m) => m.outcomeId === "o-riala-migration");
    return { done: ms.filter((m) => m.status === "DONE").length, total: ms.length };
  }, []);

  const replanTasks = useMemo(
    () =>
      Object.values(replanFlags)
        .map((flag) => ({ flag, task: allTasks.find((t) => t.id === flag.taskId) }))
        .filter((x): x is { flag: typeof x.flag; task: Task } => x.task !== undefined),
    [replanFlags]
  );

  const monthKey = monthKeyOf(monthOffset);

  // 2026-09-08: month figures count live work only. A Task that was
  // superseded, merged away or archived is not "未完了" — counting it kept the
  // monthly numbers permanently inflated and made 完了率 meaningless.
  const monthTasks = useMemo(
    () =>
      allTasks.filter(
        (t): t is Task & { deadline: string } =>
          t.deadline !== null && isSameMonth(t.deadline, monthKey) && isTaskLive(t, { lifecycleOverrides })
      ),
    [monthKey, lifecycleOverrides]
  );

  const progress = useMemo(() => computeProgress(monthTasks), [monthTasks]);

  const overdue = useMemo(
    () => computeOverdueTasks(allTasks, today, overlays),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [today, completions, dispositions, deadlineOverrides, workDateOverrides]
  );

  // Stats now derive from real execution state rather than the immutable
  // fixture `status` (which is always 未着手, so 進行中 used to be
  // permanently 0): 進行中 = actually started and not finished.
  const stats = useMemo(() => {
    const open = monthTasks.filter((t) => isTaskOpen(t, overlays));
    const inProgress = open.filter((t) => taskStartedAt.has(t.id)).length;
    const notStarted = open.length - inProgress;
    const aiOwned = open.filter((t) => t.aiCapability !== "HUMAN").length;
    const within7 = open.filter((t) => {
      const deadline = effectiveDeadline(t, overlays);
      if (deadline === null) return false;
      const diff = daysBetween(today, deadline);
      return diff >= 0 && diff <= 7;
    }).length;
    return { inProgress, notStarted, aiOwned, within7 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthTasks, today, completions, dispositions, deadlineOverrides, taskStartedAt]);

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
    () =>
      buildWeekEntries(
        weekDateList,
        // Only committed work belongs in "今週" (§2/§3).
        allTasks.filter((t) => isTaskCommitted(t, { lifecycleOverrides })),
        planBlocks,
        fixedCalendarEvents,
        workDateOverrides
      ),
    [weekDateList, workDateOverrides, lifecycleOverrides, planBlocks]
  );

  // Area Home cards (2026-09-08, §20/§21). These are now the top of TASK MAP
  // and the entry point into each Area Home — the first thing the user needs
  // is 何を目指していて次に何をするか, not a count of open tasks. Every figure
  // is derived from the real Task set; an Area with no Outcome says so
  // rather than being given an invented one.
  const areaCards = useMemo(
    () => areaProfiles.map((p) => buildAreaHome(p.area, today, overlays, planBlocks)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [today, completions, dispositions, deadlineOverrides, workDateOverrides, lifecycleOverrides]
  );

  const activeRefineCount = [areaFilter, capFilter, importanceFilter, urgencyFilter].filter(
    (v) => v !== "全部"
  ).length;

  // The Task inventory for the selected scope (§6). Everything downstream
  // (quick filter, refine, sort) narrows this — so switching to 「全部」
  // genuinely shows every Task that exists, including completed ones.
  const scopedTasks = useMemo(() => {
    const weekEnd = weekDateList[6];
    switch (scope) {
      case "全部":
        return allTasks;
      case "今月":
        return monthTasks;
      case "今日":
        return tasksEffectiveOnDate(
          today,
          allTasks.filter((t) => isTaskCommitted(t, overlays)),
          planBlocks,
          workDateOverrides
        );
      case "今週":
        return allTasks.filter((t) => {
          if (!isTaskOpen(t, overlays) || !isTaskCommitted(t, overlays)) return false;
          const deadline = effectiveDeadline(t, overlays);
          const workDate = effectiveWorkDate(t, overlays);
          const inWeek = (d: string | null) => d !== null && d >= weekStart && d <= weekEnd;
          const scheduled = planBlocks.some((tb) => tb.taskId === t.id && tb.date >= weekStart && tb.date <= weekEnd);
          return inWeek(deadline) || inWeek(workDate) || scheduled;
        });
      case "期限超過":
        return overdue;
      case "Backlog":
        // やる意思はあるが、実行日時をまだ決めていないもの。ACTIVE PLANには
        // 出さないが、ここには必ず全部出す。
        return allTasks.filter(
          (t) => isTaskOpen(t, overlays) && effectiveLifecycle(t, overlays) === "BACKLOG"
        );
      case "完了":
        return allTasks.filter((t) => isTaskDone(t, overlays));
      case "整理済み":
        // 置き換え / 統合 / Archive / 削除。消さずに、ここで必ず見つけられる。
        return allTasks.filter((t) => !isTaskLive(t, overlays));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, monthTasks, today, weekStart, weekDateList, overdue, completions, dispositions, deadlineOverrides, workDateOverrides, lifecycleOverrides]);

  function applyFilters(list: Task[]): Task[] {
    let out = list;
    if (quickFilter === "未着手")
      out = out.filter((t) => isTaskOpen(t, overlays) && !taskStartedAt.has(t.id));
    else if (quickFilter === "進行中")
      out = out.filter((t) => isTaskOpen(t, overlays) && taskStartedAt.has(t.id));
    else if (quickFilter === "AI") out = out.filter((t) => t.aiCapability !== "HUMAN");
    else if (quickFilter === "7日以内")
      out = out.filter((t) => {
        if (!isTaskOpen(t, overlays)) return false;
        const deadline = effectiveDeadline(t, overlays);
        if (deadline === null) return false;
        const diff = daysBetween(today, deadline);
        return diff >= 0 && diff <= 7;
      });

    if (areaFilter !== "全部") out = out.filter((t) => t.area === areaFilter);
    if (capFilter !== "全部") out = out.filter((t) => capabilityGroup(t.aiCapability) === capFilter);
    if (importanceFilter !== "全部") out = out.filter((t) => t.importance === importanceFilter);
    if (urgencyFilter !== "全部") out = out.filter((t) => t.urgency === urgencyFilter);
    return out;
  }

  const visibleTasks = useMemo(() => {
    const sorted = [...applyFilters(scopedTasks)];
    if (sort === "期限順")
      sorted.sort((a, b) => {
        // Undated Tasks sort last rather than disappearing.
        const da = effectiveDeadline(a, overlays) ?? "9999-12-31";
        const db = effectiveDeadline(b, overlays) ?? "9999-12-31";
        return da < db ? -1 : da > db ? 1 : 0;
      });
    else if (sort === "重要度") sorted.sort((a, b) => priorityRank[b.importance] - priorityRank[a.importance]);
    else sorted.sort((a, b) => priorityRank[b.urgency] - priorityRank[a.urgency]);
    return sorted;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopedTasks, quickFilter, areaFilter, capFilter, importanceFilter, urgencyFilter, sort, taskStartedAt, completions, dispositions, deadlineOverrides]);

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

      {/* Execution Control Tower (2026-09-08 第4ラウンド, §20).
          Order: 再計画が必要 → Area Control Cards → 選択AreaのGap Board →
          今週の実行Plan → 全Task → 補助（締切一覧/月間/完了履歴）.
          The monthly deadline calendar is no longer the lead: Google Calendar
          is the better place to see WHEN, and this screen exists to answer
          何を目指し / 今どこで / 何が足りず / 次に何を. */}
      {replanTasks.length > 0 && (
        <section className="mx-5 mt-1 rounded-2xl bg-danger-soft px-4 py-3">
          <p className="text-xs font-bold text-danger">
            ⚠ 再計画が必要 <span className="text-stone-800">{replanTasks.length}件</span>
          </p>
          <ul className="mt-1.5 flex flex-col gap-1.5">
            {replanTasks.map(({ task, flag }) => (
              <li key={task.id}>
                <button
                  type="button"
                  onClick={() => setSelectedTask(task)}
                  className="w-full rounded-xl bg-white/70 px-3 py-2 text-left"
                >
                  <p className="text-[12px] font-bold text-stone-800">{task.title}</p>
                  <p className="mt-0.5 text-[10px] font-bold text-danger">
                    {REPLAN_REASON_LABEL[flag.reason]}
                  </p>
                  <p className="mt-0.5 text-[10px] leading-relaxed text-stone-500">{flag.detail}</p>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[10px] leading-relaxed text-stone-500">
            予定・期限・見積のどれかが現実と合っていません。Taskを開いて予定を組み直してください。
          </p>
        </section>
      )}

      {/* §19/§20: 健康なら何も出さない。問題があるときだけBanner。 */}
      <PlanHealthBanner health={planHealth} />

      {/* §14: 今月末どうなっていたいか。1〜2行だけ。 */}
      <section className="mt-2 px-5">
        <h2 className="mb-1.5 text-[13px] font-bold text-stone-500">{monthLabel(monthKey)}末の到達点</h2>
        <div className="flex flex-col gap-1.5 lg:grid lg:grid-cols-3">
          {areaCards.map((a) => {
            const th = AREA_THEME[a.profile.area];
            const goal = endStates.find((e) => e.area === a.profile.area);
            return (
              <div
                key={a.profile.area}
                className="rounded-xl border border-stone-150 bg-white px-3 py-2"
                style={{ borderLeftWidth: 3, borderLeftColor: th.primary }}
              >
                <p className="text-[10px] font-bold" style={{ color: th.text }}>
                  {th.label}
                </p>
                <p className="mt-0.5 line-clamp-3 text-[12px] leading-snug text-stone-700">
                  {goal?.state ?? "未設定"}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mt-3 px-5">
        <h2 className="mb-2 text-sm font-bold text-stone-800">Areaの現在地</h2>
        <div className="grid grid-cols-1 items-stretch gap-2 lg:grid-cols-3">
          {areaCards.map((a) => (
            <AreaControlCard
              key={a.profile.area}
              data={a}
              today={today}
              headline={areaHeadline(a.profile.area, a.profile.area === "営業代行" ? salesOwn : null, milestoneProgress)}
              mainGap={mainGap(gapsByArea[a.profile.area] ?? [])}
              nextBlock={nextBlockForArea(a.profile.area, today, planBlocks, allTasks, nowHmValue, overlays)}
              riskCount={areaRisks(a, allGapItems).length}
              selected={selectedArea === a.profile.area}
              onSelect={() => setSelectedArea(a.profile.area)}
            />
          ))}
        </div>
      </section>

      <section className="mt-2.5 px-5">
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-bold" style={{ color: AREA_THEME[selectedArea].text }}>
            {selectedArea}｜いま足りていないもの
          </h2>
          <Link href={`/area/${areaCards.find((a) => a.profile.area === selectedArea)?.profile.slug ?? "sales"}`} className="text-[11px] font-bold text-accent-dark">
            Area Home ›
          </Link>
        </div>
        <GapBoard
          gaps={gapsByArea[selectedArea] ?? []}
          progressOverride={gapProgressOverride}
          onOpenTask={(taskId) => {
            const t = allTasks.find((task) => task.id === taskId);
            if (t) setSelectedTask(t);
          }}
        />
        <div className="mt-2">
          <BlockerPanel
            blockers={blockers.filter((b) => b.area === selectedArea)}
            onOpenTask={(taskId) => {
              const t = allTasks.find((task) => task.id === taskId);
              if (t) setSelectedTask(t);
            }}
          />
        </div>
      </section>

      <WeekView
        dates={weekDateList}
        entriesByDate={weekEntries}
        today={today}
        onOpenTask={(taskId) => {
          const t = allTasks.find((task) => task.id === taskId);
          if (t) setSelectedTask(t);
        }}
        onOpenDay={(date) => setSelectedDate(date)}
      />

      {/* 補助情報 (§2/§20): WHENを把握するのはGoogle Calendarの方が適して
          いるので、月間締切カレンダーは折りたたみへ降格した。消してはいない。 */}
      <section className="mx-5 mt-2.5 rounded-3xl bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,0,0,0.12)]">
        <button
          type="button"
          onClick={() => setMonthlyOpen((v) => !v)}
          className="flex w-full items-center justify-between text-left"
        >
          <span className="text-xs font-bold text-stone-500">{monthLabel(monthKey)}の締切一覧</span>
          <span className="text-[11px] text-stone-300">{monthlyOpen ? "▾" : "▸"}</span>
        </button>
        {monthlyOpen && (
        <>
        <p className="mb-2.5 mt-2 text-[10px] text-stone-400">補助情報です。実行の判断はArea Controlと今週のPlanで行います。</p>
        <div className="grid grid-cols-7 gap-y-1.5 text-center">
          {WEEKDAY_LABEL.map((w) => (
            <span key={w} className="text-[10px] font-bold text-stone-300">
              {w}
            </span>
          ))}
          {monthCells.map((c, i) =>
            c === null ? (
              <span key={`blank-${i}`} />
            ) : (
              <button
                key={c.date}
                type="button"
                onClick={() => setSelectedDate(c.date)}
                className={`mx-auto flex h-9 w-9 flex-col items-center justify-center gap-0.5 rounded-lg lg:h-14 lg:w-14 ${
                  c.date === today ? "bg-accent-soft ring-1 ring-accent" : "hover:bg-stone-100"
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
              </button>
            )
          )}
        </div>
        </>
        )}
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
      </section>

      {/* 期限超過Inbox (§13): the same resolvable inbox as TODAY, so an
          overdue Task can be finished or re-planned from the management
          screen too — never a dead-end counter. */}
      {overdue.length > 0 && (
        <section className="mx-5 mt-2.5">
          <OverdueInbox tasks={overdue} today={today} />
        </section>
      )}

      {/* §56: Advanced Inventory. Scope / Filter / Sort / Archive live in
          here, not on the Control Tower surface. */}
      <section className="mt-3 px-5">
        <button
          type="button"
          onClick={() => setInventoryOpen((v) => !v)}
          className="flex w-full items-center justify-between rounded-2xl border border-stone-150 bg-white px-4 py-3 text-left"
        >
          <span>
            <span className="block text-[13px] font-bold text-stone-700">全Taskを見る</span>
            <span className="mt-0.5 block text-[11px] text-stone-400">
              絞り込み・並び替え・Archive・完了履歴（全{allTasks.length}件）
            </span>
          </span>
          <span className="text-[12px] text-stone-300">{inventoryOpen ? "▾" : "▸"}</span>
        </button>
      </section>

      {inventoryOpen && (
      <>
      <section className="mt-2 px-5">
        <div className="-mx-5 flex gap-1.5 overflow-x-auto px-5 pb-1">
          {SCOPES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setScope(s)}
              className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-bold transition-colors ${
                scope === s ? "bg-stone-800 text-white" : "bg-white text-stone-500 shadow-sm"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </section>

      <section className="mt-2 px-5">
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
        <p className="mb-0.5 text-[11px] font-bold text-stone-400">
          {scope}：{visibleTasks.length}件 / 全{allTasks.length}件
        </p>
        {visibleTasks.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-3xl border border-dashed border-stone-200 py-10 text-center">
            <span className="text-3xl">📭</span>
            <p className="text-sm text-stone-400">該当するタスクはありません</p>
          </div>
        ) : (
          visibleTasks.map((t) => (
            <TaskListRow
              key={t.id}
              task={t}
              today={today}
              deadline={effectiveDeadline(t, overlays)}
              done={isTaskDone(t, overlays)}
              blocked={isTaskBlocked(t, overlays)}
              onOpen={() => setSelectedTask(t)}
            />
          ))
        )}
      </section>
      </>
      )}

      <section className="mt-6 px-5 pb-4">
        <h2 className="mb-2.5 text-sm font-bold text-stone-500">達成したい状態の詳細</h2>
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

      {/* §21/§54: 診断はSystem Statusへ。日常のTASK MAPの主役にしない。 */}
      <div className="mt-6 flex items-center justify-end gap-2 px-5">
        <PlanOkMark health={planHealth} />
        <Link href="/system" className="text-[10px] text-stone-300">
          System Status ＞
        </Link>
      </div>

      {selectedTask && (
        <TaskDetailSheet
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onNavigateToTask={(taskId) => {
            const t = allTasks.find((task) => task.id === taskId);
            if (t) setSelectedTask(t);
          }}
        />
      )}
      {selectedOutcome && <OutcomeDetailSheet outcome={selectedOutcome} onClose={() => setSelectedOutcome(null)} />}
      {selectedDate && (
        <DayDetailSheet
          date={selectedDate}
          onClose={() => setSelectedDate(null)}
          onOpenTask={(t) => {
            setSelectedDate(null);
            setSelectedTask(t);
          }}
        />
      )}
    </div>
  );
}

// P1/P7: a week entry takes its colour from the Task behind it, never from a
// single generic accent — that is what made 今週 read as one orange block even
// after the Area theme landed.
function weekEntryStyle(e: WeekEntry): { className: string; style?: React.CSSProperties } {
  if (e.kind === "FIXED") return { className: "bg-stone-100 text-stone-500" };
  if (e.kind === "DEADLINE") return { className: "bg-danger-soft text-danger" };
  if (e.area === null) return { className: "bg-stone-100 text-stone-500" };
  const { surface } = themeFor(e.area, e.activityType);
  return {
    className: "",
    style: { backgroundColor: surface.soft, color: surface.text, borderLeft: `2px solid ${surface.primary}` },
  };
}

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
  onOpenDay,
}: {
  dates: string[];
  entriesByDate: Map<string, WeekEntry[]>;
  today: string;
  onOpenTask: (taskId: string) => void;
  /** Tapping the date header opens that whole day (§7). */
  onOpenDay: (date: string) => void;
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
      {/* Desktop Week View (2026-09-06): 7 columns in one row via lg:grid,
          not the mobile horizontal-scroll strip stretched wide — "見取り図"
          at a glance, like a real week calendar. */}
      <div
        className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 lg:mx-0 lg:grid lg:grid-cols-7 lg:overflow-visible lg:px-0"
        style={{ scrollSnapType: "x proximity" }}
      >
        {dates.map((d) => {
          const isToday = d === today;
          const entries = entriesByDate.get(d) ?? [];
          const weekday = WEEKDAY_LABEL[new Date(d + "T00:00:00").getDay()];
          return (
            <div
              key={d}
              ref={isToday ? todayRef : undefined}
              className={`w-[108px] shrink-0 rounded-2xl p-2.5 lg:w-auto lg:shrink ${
                isToday ? "bg-accent-soft ring-2 ring-accent" : "bg-white shadow-sm"
              }`}
              style={{ scrollSnapAlign: "start" }}
            >
              <button
                type="button"
                onClick={() => onOpenDay(d)}
                className={`w-full text-left text-[11px] font-bold underline-offset-2 hover:underline ${
                  isToday ? "text-accent-dark" : "text-stone-400"
                }`}
              >
                {weekday} <span className="tabular-nums">{dayOfMonth(d)}</span>
              </button>
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
                      className={`truncate rounded-lg px-1.5 py-1 text-left text-[10px] font-bold ${weekEntryStyle(e).className}`}
                      style={weekEntryStyle(e).style}
                    >
                      {e.time && <span className="tabular-nums opacity-70">{e.time} </span>}
                      {e.label}
                    </button>
                  ))
                )}
                {entries.length > 4 && (
                  <p className="text-[10px] font-bold text-stone-400">+{entries.length - 4}件</p>
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

function TaskListRow({
  task,
  today,
  deadline,
  done,
  blocked,
  onOpen,
}: {
  task: Task;
  today: string;
  /** Effective deadline (a 期限再設定 already applied). */
  deadline: string | null;
  /** Derived from the durable completion record, not the fixture status. */
  done: boolean;
  blocked: boolean;
  onOpen: () => void;
}) {
  const overdue = deadline !== null && !done && daysBetween(today, deadline) < 0;
  const badge = capabilityBadge(task.aiCapability);
  // A Task split into a real Series (2026-09-06) — surface its step here so
  // the several rows a series produces read as one flow at a glance. Labeled
  // "ステップ" so it's never confused with a book title's own page split
  // (e.g. "『THE FORMAT』1/2を読む" is book-half 1/2 but series step 1/3).
  const series = task.seriesId ? resolveSeries(task, allTasks) : null;
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
            {formatMd(deadline)}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${areaStyle[task.area]}`}>
            {task.area}
          </span>
          {series && (
            <span className="rounded-full bg-stone-100 px-1.5 py-0.5 text-[10px] font-bold text-stone-500">
              ステップ{series.sequenceNumber}/{series.totalSteps}
            </span>
          )}
          {blocked && (
            <span className="rounded-full bg-stone-800 px-1.5 py-0.5 text-[10px] font-bold text-white">Blocked</span>
          )}
          {task.importance === "高" && !done && (
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
