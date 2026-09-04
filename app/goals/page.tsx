"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { goals, tasks } from "@/lib/dummy-data";
import { formatMd, todayStr } from "@/lib/date";
import type { Goal } from "@/lib/types";

const todayMs = new Date(todayStr()).getTime();

export default function GoalTreePage() {
  return (
    <Suspense fallback={null}>
      <GoalTreeContent />
    </Suspense>
  );
}

function GoalTreeContent() {
  const searchParams = useSearchParams();
  const linkedFocusId = searchParams.get("focus");

  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () => new Set(linkedFocusId ? [linkedFocusId] : [])
  );
  const nodeRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const chain = useMemo(() => {
    const byParent = new Map<string | null, Goal>();
    for (const g of goals) byParent.set(g.parentId, g);
    const ordered: Goal[] = [];
    let current = byParent.get(null);
    while (current) {
      ordered.push(current);
      current = byParent.get(current.id);
    }
    return ordered;
  }, []);

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
    for (const g of chain) {
      if (!g.targetDate) continue;
      const diff = new Date(g.targetDate).getTime() - todayMs;
      if (diff < 0) continue;
      if (!best || diff < best.diff) best = { id: g.id, diff };
    }
    return best?.id ?? null;
  }, [chain]);

  useEffect(() => {
    if (!linkedFocusId) return;
    const el = nodeRefs.current.get(linkedFocusId);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
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
        <p className="mb-4 text-[11px] font-medium text-stone-400">※ 目標の文言は仮データです</p>
        {chain.map((goal, i) => (
          <div
            key={goal.id}
            className="scroll-mt-28"
            ref={(el) => {
              if (el) nodeRefs.current.set(goal.id, el);
              else nodeRefs.current.delete(goal.id);
            }}
          >
            <TimelineRow
              goal={goal}
              isLast={i === chain.length - 1}
              isFocus={goal.id === focusId}
              isLinked={goal.id === linkedFocusId}
              linkedTasks={tasksOf.get(goal.id) ?? 0}
              expanded={expandedIds.has(goal.id)}
              onToggle={() => toggle(goal.id)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function TimelineRow({
  goal,
  isLast,
  isFocus,
  isLinked,
  linkedTasks,
  expanded,
  onToggle,
}: {
  goal: Goal;
  isLast: boolean;
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
        {!isLast && <span className="mt-1 w-px flex-1 bg-stone-200" />}
      </div>

      <button
        type="button"
        onClick={onToggle}
        className={`min-w-0 flex-1 rounded-2xl pb-5 text-left ${isLinked ? "ring-2 ring-accent-soft" : ""}`}
      >
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
            <p>
              <span className="font-bold text-stone-400">理想　</span>
              {goal.desiredState}
            </p>
            <p>
              <span className="font-bold text-stone-400">基準　</span>
              {goal.achievementCriteria}
            </p>
            {linkedTasks > 0 && (
              <p className="text-stone-500">
                <span className="font-bold">紐づくタスク　</span>
                {linkedTasks}件
              </p>
            )}
          </div>
        )}
      </button>
    </div>
  );
}
