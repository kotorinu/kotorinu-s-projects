"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { goals, tasks } from "@/lib/dummy-data";
import { formatMd } from "@/lib/date";
import { countdownLabel, countdownToneClass, countdownTone } from "@/lib/countdown";
import { useTodayExecution } from "@/lib/todayExecutionStore";
import type { Goal } from "@/lib/types";

export default function GoalTreePage() {
  return (
    <Suspense fallback={null}>
      <GoalTreeContent />
    </Suspense>
  );
}

function GoalTreeContent() {
  // currentDate comes from the Day Rollover store (lib/todayExecutionStore),
  // not a module-level todayStr() — this page is statically prerendered, so
  // a module-level const would bake in the deploy-time date forever (the
  // Countdown would silently go stale for every viewer after deploy day).
  const { currentDate: today } = useTodayExecution();
  const todayMs = new Date(today).getTime();
  const searchParams = useSearchParams();
  const linkedFocusId = searchParams.get("focus");

  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () => new Set(linkedFocusId ? [linkedFocusId] : [])
  );

  // A real tree, not a single chain: g-direction alone has 3 children
  // (GENESIS/営業代行/RIALA) that all matter at once. Collapsing that into
  // one linear chain would silently drop siblings from view.
  const childrenOf = useMemo(() => {
    const map = new Map<string | null, Goal[]>();
    for (const g of goals) {
      const list = map.get(g.parentId) ?? [];
      list.push(g);
      map.set(g.parentId, list);
    }
    return map;
  }, []);

  const roots = childrenOf.get(null) ?? [];

  const tasksOf = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of tasks) {
      if (!t.goalId) continue;
      map.set(t.goalId, (map.get(t.goalId) ?? 0) + 1);
    }
    return map;
  }, []);

  const focusId = useMemo(() => {
    let best: { id: string; diff: number } | null = null;
    for (const g of goals) {
      if (!g.targetDate) continue;
      const diff = new Date(g.targetDate).getTime() - todayMs;
      if (diff < 0) continue;
      if (!best || diff < best.diff) best = { id: g.id, diff };
    }
    return best?.id ?? null;
  }, [todayMs]);

  useEffect(() => {
    if (!linkedFocusId) return;
    document.getElementById(`goal-${linkedFocusId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [linkedFocusId]);

  function toggle(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="flex flex-col pb-8">
      <header className="sticky top-0 z-10 bg-gradient-to-b from-background via-background to-transparent px-5 pb-2 pt-6">
        <p className="text-xs font-bold tracking-widest text-accent-dark">AI WORK OS</p>
        <h1 className="mt-0.5 text-[26px] font-black tracking-tight">GOAL TREE</h1>
        <p className="mt-0.5 text-xs font-medium text-stone-400">何のためにやっているかを確認する</p>
      </header>

      <div className="mt-4 px-5">
        {roots.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-3xl border border-dashed border-stone-200 py-14 text-center">
            <span className="text-3xl">🌱</span>
            <p className="text-sm text-stone-400">
              まだGoalは登録されていません
              <br />
              確定した目標が決まり次第、ここに表示されます
            </p>
          </div>
        ) : (
          roots.map((goal) => (
            <GoalBranch
              key={goal.id}
              goal={goal}
              depth={0}
              today={today}
              childrenOf={childrenOf}
              tasksOf={tasksOf}
              focusId={focusId}
              linkedFocusId={linkedFocusId}
              expandedIds={expandedIds}
              onToggle={toggle}
            />
          ))
        )}
      </div>
    </div>
  );
}

function GoalBranch({
  goal,
  depth,
  today,
  childrenOf,
  tasksOf,
  focusId,
  linkedFocusId,
  expandedIds,
  onToggle,
}: {
  goal: Goal;
  depth: number;
  today: string;
  childrenOf: Map<string | null, Goal[]>;
  tasksOf: Map<string, number>;
  focusId: string | null;
  linkedFocusId: string | null;
  expandedIds: Set<string>;
  onToggle: (id: string) => void;
}) {
  const children = childrenOf.get(goal.id) ?? [];
  return (
    <div id={`goal-${goal.id}`} className="scroll-mt-28" style={{ marginLeft: depth * 14 }}>
      <TimelineRow
        goal={goal}
        today={today}
        hasChildren={children.length > 0}
        isFocus={goal.id === focusId}
        isLinked={goal.id === linkedFocusId}
        linkedTasks={tasksOf.get(goal.id) ?? 0}
        expanded={expandedIds.has(goal.id)}
        onToggle={() => onToggle(goal.id)}
      />
      {children.map((child) => (
        <GoalBranch
          key={child.id}
          goal={child}
          depth={depth + 1}
          today={today}
          childrenOf={childrenOf}
          tasksOf={tasksOf}
          focusId={focusId}
          linkedFocusId={linkedFocusId}
          expandedIds={expandedIds}
          onToggle={onToggle}
        />
      ))}
    </div>
  );
}

function TimelineRow({
  goal,
  today,
  hasChildren,
  isFocus,
  isLinked,
  linkedTasks,
  expanded,
  onToggle,
}: {
  goal: Goal;
  today: string;
  hasChildren: boolean;
  isFocus: boolean;
  isLinked: boolean;
  linkedTasks: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <span
          className={`mt-1.5 h-3 w-3 shrink-0 rounded-full ${
            isFocus ? "bg-accent ring-4 ring-accent-soft" : "bg-white ring-2 ring-stone-200"
          }`}
        />
        {hasChildren && <span className="mt-1 w-px flex-1 bg-stone-200" />}
      </div>

      <button
        type="button"
        onClick={onToggle}
        className={`min-w-0 flex-1 rounded-2xl pb-5 text-left ${isLinked ? "ring-2 ring-accent-soft" : ""}`}
      >
        {goal.targetDate && (
          <p className={`text-[13px] font-black ${countdownToneClass[countdownTone(goal.targetDate, today)]}`}>
            {countdownLabel(goal.targetDate, today)}
          </p>
        )}
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate text-[14px] font-bold text-stone-800">{goal.title}</p>
          <span className="flex shrink-0 items-baseline gap-1.5">
            {goal.targetDate && (
              <span className="text-[11px] font-bold text-stone-500">{formatMd(goal.targetDate)}</span>
            )}
            <span
              className={`inline-block text-[9px] text-stone-300 transition-transform duration-200 ${
                expanded ? "rotate-90" : ""
              }`}
            >
              ▸
            </span>
          </span>
        </div>

        {!expanded && linkedTasks > 0 && (
          <p className="mt-0.5 text-[11px] font-medium text-stone-400">タスク {linkedTasks}件</p>
        )}

        {expanded && (
          <div className="mt-2 flex flex-col gap-1.5 rounded-2xl bg-white p-3 text-[12px] leading-relaxed text-stone-700 shadow-sm">
            <p className="whitespace-pre-line">
              <span className="font-bold text-stone-400">理想　</span>
              {goal.desiredState}
            </p>
            <p className="whitespace-pre-line">
              <span className="font-bold text-stone-400">基準　</span>
              {goal.achievementCriteria}
            </p>
            {linkedTasks > 0 && (
              <p className="text-stone-500">
                <span className="font-bold">紐づくタスク　</span>
                {linkedTasks}件
              </p>
            )}
            {goal.note && <p className="text-stone-400">{goal.note}</p>}
            {goal.linkedUrl && (
              <Link
                href={goal.linkedUrl}
                onClick={(e) => e.stopPropagation()}
                className="inline-block font-bold text-accent-dark"
              >
                ＞ 詳細を見る
              </Link>
            )}
          </div>
        )}
      </button>
    </div>
  );
}
