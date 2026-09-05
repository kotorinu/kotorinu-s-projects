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

  const roots = useMemo(() => childrenOf.get(null) ?? [], [childrenOf]);

  // Flattened DFS order with an absolute depth per node (2026-09-06
  // readability fix). Rendering used to nest each node's own div inside its
  // parent's, so CSS marginLeft compounded down the chain — capping the
  // per-node value didn't help, since a long chain (人生→Work→5年→3年→1年→
  // 半年→3か月→1か月) still added its own capped margin on top of the
  // parent's already-cumulative position, drifting off the right edge just
  // the same. Rendering as one flat sibling list with an absolute, capped
  // marginLeft per row fixes this for real.
  const flatNodes = useMemo(() => {
    const out: Array<{ goal: Goal; depth: number; hasChildren: boolean }> = [];
    function visit(goal: Goal, depth: number) {
      const children = childrenOf.get(goal.id) ?? [];
      out.push({ goal, depth, hasChildren: children.length > 0 });
      for (const child of children) visit(child, depth + 1);
    }
    for (const r of roots) visit(r, 0);
    return out;
  }, [roots, childrenOf]);

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

      {/* Desktop (2026-09-06): cap the reading column so Goal text doesn't
          stretch to an unreadable measure at 1280px — a wide shell doesn't
          mean every line of prose should go edge to edge. */}
      <div className="mt-4 px-5 lg:max-w-[720px]">
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
          flatNodes.map(({ goal, depth, hasChildren }) => (
            <div
              key={goal.id}
              id={`goal-${goal.id}`}
              className="scroll-mt-28"
              style={{ marginLeft: Math.min(depth, 2) * 16 }}
            >
              <TimelineRow
                goal={goal}
                today={today}
                hasChildren={hasChildren}
                isFocus={goal.id === focusId}
                isLinked={goal.id === linkedFocusId}
                linkedTasks={tasksOf.get(goal.id) ?? 0}
                expanded={expandedIds.has(goal.id)}
                onToggle={() => toggle(goal.id)}
              />
            </div>
          ))
        )}
      </div>
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
