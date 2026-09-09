"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { allGapItems, goals, tasks } from "@/lib/dummy-data";
import { formatMd } from "@/lib/date";
import { GAP_STATUS_LABEL } from "@/lib/gapBoard";
import {
  areaGoals,
  goalPath,
  horizonHeadline,
  journeySpine,
  nextMilestone,
  pathProgress,
  philosophyGoals,
} from "@/lib/goalTree";
import { useTodayExecution } from "@/lib/todayExecutionStore";
import { GOAL_HORIZON_LABEL, type GapItem, type Goal } from "@/lib/types";

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
  const searchParams = useSearchParams();
  const linkedFocusId = searchParams.get("focus");

  const spine = useMemo(() => journeySpine(goals, today), [today]);
  const areas = useMemo(() => areaGoals(goals), []);
  const philosophy = useMemo(() => philosophyGoals(goals), []);
  const milestone = useMemo(() => nextMilestone(goals, today), [today]);

  // 右パネルに出すGoal。最初から「一番近い未来」を選んでおく——開いた瞬間に
  // 22日後の理想が読めるのが目的なので、何も選ばれていない状態を作らない。
  const [selectedId, setSelectedId] = useState<string | null>(linkedFocusId ?? milestone?.id ?? null);
  const selected = useMemo(() => goals.find((g) => g.id === selectedId) ?? null, [selectedId]);

  const tasksOf = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of tasks) {
      if (!t.goalId) continue;
      map.set(t.goalId, (map.get(t.goalId) ?? 0) + 1);
    }
    return map;
  }, []);

  useEffect(() => {
    if (!linkedFocusId) return;
    document.getElementById(`goal-${linkedFocusId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [linkedFocusId]);

  return (
    <div className="flex flex-col pb-8">
      <header className="sticky top-0 z-10 bg-gradient-to-b from-background via-background to-transparent px-5 pb-2 pt-6">
        <p className="text-xs font-bold tracking-widest text-accent-dark">AI WORK OS</p>
        <h1 className="mt-0.5 text-[26px] font-black tracking-tight">GOAL TREE</h1>
        <p className="mt-0.5 text-xs font-medium text-stone-400">いまはどこへ向かっているか</p>
      </header>

      {/* P2: 開いた瞬間に「あと何日で、何になっていればいいか」。 */}
      {milestone && <NextMilestoneCard goal={milestone} today={today} />}

      {goals.length === 0 ? (
        <div className="mx-5 mt-4 flex flex-col items-center gap-2 rounded-3xl border border-dashed border-stone-200 py-14 text-center">
          <span className="text-3xl">🌱</span>
          <p className="text-sm text-stone-400">
            まだGoalは登録されていません
            <br />
            確定した目標が決まり次第、ここに表示されます
          </p>
        </div>
      ) : (
        // Desktop: 左55% Journey / 右45% 選択中Goal。Mobileは1カラムで、
        // 各行が理想の1〜2行を常時見せる（開かないと分からない状態をやめる）。
        <div className="mt-3 flex flex-col gap-4 px-5 lg:flex-row lg:items-start lg:gap-5">
          <div className="min-w-0 lg:w-[55%]">
            <NowMarker today={today} />

            {spine.map((node) => (
              <div key={node.goal.id} id={`goal-${node.goal.id}`} className="scroll-mt-28">
                <JourneyRow
                  goal={node.goal}
                  today={today}
                  isNext={node.isNextMilestone}
                  selected={selectedId === node.goal.id}
                  linkedTasks={tasksOf.get(node.goal.id) ?? 0}
                  onSelect={() => setSelectedId(node.goal.id)}
                />
                {/* 1か月後の中身＝いま動かしている3領域。ここに置くことで
                    「今月やっていること」と「1か月後の理想」がつながる。 */}
                {node.goal.horizon === "1M" && areas.length > 0 && (
                  <div className="mb-2 ml-6 border-l border-dashed border-stone-200 pl-3">
                    <p className="mb-1.5 text-[10px] font-bold text-stone-400">この1か月を作っているもの</p>
                    <div className="flex flex-col gap-1.5">
                      {areas.map((g) => (
                        <div key={g.id} id={`goal-${g.id}`} className="scroll-mt-28">
                          <AreaGoalRow
                            goal={g}
                            today={today}
                            selected={selectedId === g.id}
                            onSelect={() => setSelectedId(g.id)}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}

            {philosophy.length > 0 && (
              <div className="mt-2 border-t border-stone-150 pt-3">
                <p className="mb-1.5 text-[10px] font-bold tracking-wide text-stone-400">その先にあるもの</p>
                <div className="flex flex-col gap-1.5">
                  {philosophy.map((g) => (
                    <div key={g.id} id={`goal-${g.id}`} className="scroll-mt-28">
                      <AreaGoalRow
                        goal={g}
                        today={today}
                        selected={selectedId === g.id}
                        onSelect={() => setSelectedId(g.id)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Desktop: 常時見えるPreview。Mobile: 選んだGoalの詳細として下に続く。 */}
          {selected && (
            <div className="lg:sticky lg:top-24 lg:w-[45%]">
              <GoalPreview goal={selected} today={today} linkedTasks={tasksOf.get(selected.id) ?? 0} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function NextMilestoneCard({ goal, today }: { goal: Goal; today: string }) {
  const headline = horizonHeadline(goal, today);
  return (
    <section className="mx-5 mt-2 rounded-2xl bg-accent px-4 py-3 text-white">
      <p className="text-[10px] font-black tracking-widest text-white/70">NEXT MILESTONE</p>
      <div className="mt-0.5 flex items-baseline gap-2">
        <span className="text-[26px] font-black leading-none tabular-nums">{headline}</span>
        <span className="text-[13px] font-bold text-white/80">
          {GOAL_HORIZON_LABEL[goal.horizon] === "この期間の中身" ? goal.title : GOAL_HORIZON_LABEL[goal.horizon]}
        </span>
        {goal.targetDate && (
          <span className="ml-auto text-[11px] font-bold text-white/70">{formatMd(goal.targetDate)}</span>
        )}
      </div>
      <p className="mt-1.5 whitespace-pre-line text-[12px] font-medium leading-relaxed text-white/95">
        {goal.desiredState}
      </p>
    </section>
  );
}

function NowMarker({ today }: { today: string }) {
  const [, m, d] = today.split("-");
  return (
    <div className="flex items-center gap-2 pb-1">
      <span className="h-2.5 w-2.5 rounded-full bg-stone-800 ring-4 ring-stone-800/10" />
      <span className="text-[11px] font-black tracking-widest text-stone-800">NOW</span>
      <span className="tabular-nums text-[11px] font-bold text-stone-400">
        {Number(m)}/{Number(d)}
      </span>
      <span className="h-px flex-1 bg-stone-200" />
    </div>
  );
}

/** 期間Goal 1行。理想を常時2行まで見せる（P1）。 */
function JourneyRow({
  goal,
  today,
  isNext,
  selected,
  linkedTasks,
  onSelect,
}: {
  goal: Goal;
  today: string;
  isNext: boolean;
  selected: boolean;
  linkedTasks: number;
  onSelect: () => void;
}) {
  const headline = horizonHeadline(goal, today);
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <span
          className={`mt-3 h-3 w-3 shrink-0 rounded-full ${
            isNext ? "bg-accent ring-4 ring-accent-soft" : "bg-white ring-2 ring-stone-200"
          }`}
        />
        <span className="mt-1 w-px flex-1 bg-stone-200" />
      </div>

      <button
        type="button"
        onClick={onSelect}
        className={`mb-2 min-w-0 flex-1 rounded-2xl border bg-white px-3.5 py-2.5 text-left transition-colors ${
          selected ? "border-accent" : "border-stone-150"
        }`}
      >
        <div className="flex items-baseline gap-2">
          <span className="text-[13px] font-black text-stone-800">{GOAL_HORIZON_LABEL[goal.horizon]}</span>
          {headline && (
            <span className={`tabular-nums text-[12px] font-black ${isNext ? "text-accent-dark" : "text-stone-400"}`}>
              {headline}
            </span>
          )}
          {goal.targetDate && (
            <span className="ml-auto shrink-0 text-[10px] font-bold text-stone-300">
              {formatMd(goal.targetDate)}
            </span>
          )}
        </div>
        {/* Mobileでも常時見える理想。最大2行。 */}
        <p className="mt-1 line-clamp-2 text-[12px] leading-snug text-stone-600">
          {goal.desiredState.replace(/\n/g, " ")}
        </p>
        {linkedTasks > 0 && (
          <p className="mt-1 text-[10px] font-medium text-stone-400">タスク {linkedTasks}件</p>
        )}
      </button>
    </div>
  );
}

function AreaGoalRow({
  goal,
  today,
  selected,
  onSelect,
}: {
  goal: Goal;
  today: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const headline = horizonHeadline(goal, today);
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-xl border bg-white px-3 py-2 text-left transition-colors ${
        selected ? "border-accent" : "border-stone-150"
      }`}
    >
      <div className="flex items-baseline gap-2">
        <span className="text-[12px] font-bold text-stone-800">{goal.title}</span>
        {headline && <span className="tabular-nums text-[11px] font-bold text-stone-400">{headline}</span>}
      </div>
      <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-stone-500">
        {goal.desiredState.replace(/\n/g, " ")}
      </p>
    </button>
  );
}

/**
 * 右パネル（Mobileでは下）。P1で挙がった項目を上から順に:
 * 期間 / Countdown / Target Date / 理想 / 達成条件 / 現在のGap / 次に積むEvidence。
 */
function GoalPreview({ goal, today, linkedTasks }: { goal: Goal; today: string; linkedTasks: number }) {
  const headline = horizonHeadline(goal, today);
  const path = useMemo(() => goalPath(goal, allGapItems), [goal]);
  const progress = useMemo(() => pathProgress(path), [path]);

  return (
    <section className="rounded-2xl border border-stone-150 bg-white px-4 py-3.5">
      <div className="flex items-baseline gap-2">
        <span className="text-[10px] font-black tracking-widest text-stone-400">
          {GOAL_HORIZON_LABEL[goal.horizon]}
        </span>
        {goal.targetDate && (
          <span className="ml-auto tabular-nums text-[11px] font-bold text-stone-400">
            {formatMd(goal.targetDate)}
          </span>
        )}
      </div>
      <div className="mt-0.5 flex items-baseline gap-2">
        {/* 期間Goalはタイトルと期間名が同じ（「1か月後」）ので、上のラベルと
            二重に出さない。 */}
        {goal.title !== GOAL_HORIZON_LABEL[goal.horizon] && (
          <h2 className="text-[17px] font-black leading-snug text-stone-900">{goal.title}</h2>
        )}
        {headline && <span className="text-[17px] font-black tabular-nums text-accent-dark">{headline}</span>}
      </div>

      <Block label="この日までにこうなっていたい">
        <p className="whitespace-pre-line text-[13px] leading-relaxed text-stone-700">{goal.desiredState}</p>
      </Block>

      <Block label="達成条件">
        <p className="whitespace-pre-line text-[12px] leading-relaxed text-stone-600">{goal.achievementCriteria}</p>
      </Block>

      <Block label="現在のGap">
        {goal.currentGap ? (
          <p className="whitespace-pre-line text-[12px] leading-relaxed text-stone-700">{goal.currentGap}</p>
        ) : (
          // 測っていないことを「差が無い」と書かない。
          <p className="text-[12px] leading-relaxed text-stone-400">まだ測っていません。</p>
        )}
      </Block>

      <Block label="次に積むEvidence">
        {goal.nextEvidence ? (
          <p className="rounded-xl bg-accent-soft px-3 py-2 text-[12px] font-bold leading-relaxed text-accent-dark">
            {goal.nextEvidence}
          </p>
        ) : (
          <p className="text-[12px] text-stone-400">まだ決まっていません。</p>
        )}
      </Block>

      {path.length > 0 && (
        <Block label={`ここまでの道筋　${progress.done} / ${progress.total}`}>
          <ol className="flex flex-col gap-1">
            {path.map((step) => (
              <PathStep key={step.id} step={step} isCurrent={step.id === progress.current?.id} />
            ))}
          </ol>
        </Block>
      )}

      {(linkedTasks > 0 || goal.linkedUrl || goal.note) && (
        <div className="mt-3 border-t border-stone-100 pt-2.5">
          {linkedTasks > 0 && <p className="text-[11px] text-stone-500">紐づくタスク {linkedTasks}件</p>}
          {goal.note && <p className="mt-1 text-[10px] leading-relaxed text-stone-400">{goal.note}</p>}
          {goal.linkedUrl && (
            <Link href={goal.linkedUrl} className="mt-1.5 inline-block text-[12px] font-bold text-accent-dark">
              ＞ 詳細を見る
            </Link>
          )}
        </div>
      )}
    </section>
  );
}

function PathStep({ step, isCurrent }: { step: GapItem; isCurrent: boolean }) {
  const done = step.status === "DONE";
  const waiting = step.status === "WAITING";
  const doing = step.status === "DOING";
  // 済み / 進行中 / 相手待ち / まだ、を形でも区別する。色だけに頼ると
  // 「どこで止まっているか」がひと目で読めない。
  const mark = done ? "✓" : doing ? "▶" : waiting ? "…" : "○";
  return (
    <li
      className={`flex items-start gap-2 rounded-lg px-2 py-1.5 ${
        isCurrent ? "bg-accent-soft" : done ? "" : "bg-stone-50"
      }`}
    >
      <span
        className={`mt-[3px] shrink-0 text-[11px] font-black ${
          done ? "text-emerald-500" : waiting ? "text-amber-500" : isCurrent ? "text-accent-dark" : "text-stone-300"
        }`}
      >
        {mark}
      </span>
      <span className="min-w-0 flex-1">
        <span className={`text-[12px] leading-snug ${done ? "text-stone-400" : "font-bold text-stone-700"}`}>
          {step.title}
        </span>
        <span className="ml-1.5 text-[10px] font-bold text-stone-400">{GAP_STATUS_LABEL[step.status]}</span>
        {waiting && step.waitingOn && (
          <span className="block text-[10px] leading-snug text-amber-700">{step.waitingOn}</span>
        )}
      </span>
    </li>
  );
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-3">
      <p className="mb-1 text-[10px] font-black tracking-wide text-stone-400">{label}</p>
      {children}
    </div>
  );
}
