"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { allGapItems, goals, tasks } from "@/lib/dummy-data";
import { formatMd } from "@/lib/date";
import { GAP_STATUS_LABEL } from "@/lib/gapBoard";
import {
  areaGoals,
  currentStep,
  goalPath,
  horizonHeadline,
  journeySpine,
  nextMilestone,
  northStarGoals,
  pathProgress,
  surfaceLine,
} from "@/lib/goalTree";
import { useTodayExecution } from "@/lib/todayExecutionStore";
import {
  GOAL_HORIZON_LABEL,
  NORTH_STAR_LABEL,
  type GapItem,
  type Goal,
} from "@/lib/types";

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
  // a module-level const would bake in the deploy-time date forever.
  const { currentDate: today } = useTodayExecution();
  const searchParams = useSearchParams();
  const linkedFocusId = searchParams.get("focus");

  const spine = useMemo(() => journeySpine(goals, today), [today]);
  const areas = useMemo(() => areaGoals(goals), []);
  const stars = useMemo(() => northStarGoals(goals), []);
  const milestone = useMemo(() => nextMilestone(goals, today), [today]);

  // 開いた瞬間に「一番近い未来」が選ばれている。何も選ばれていない状態を作らない。
  const [selectedId, setSelectedId] = useState<string | null>(linkedFocusId ?? milestone?.id ?? null);
  const selected = useMemo(() => goals.find((g) => g.id === selectedId) ?? null, [selectedId]);
  // Mobileでは詳細をSheetで出す (§9)。Desktopは右カラムに常時。
  const [sheetOpen, setSheetOpen] = useState(false);

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

  function select(id: string) {
    setSelectedId(id);
    setSheetOpen(true);
  }

  return (
    <div className="flex flex-col pb-8">
      <header className="sticky top-0 z-10 bg-gradient-to-b from-background via-background to-transparent px-5 pb-2 pt-6">
        <p className="text-xs font-bold tracking-widest text-accent-dark">AI WORK OS</p>
        <h1 className="mt-0.5 text-[26px] font-black tracking-tight">GOAL TREE</h1>
        <p className="mt-0.5 text-xs font-medium text-stone-400">いまはどこへ向かっているか</p>
      </header>

      {/* §8/P2: 開いた瞬間に「あと何日で、何になっていればいいか」。 */}
      {milestone && <NextMilestoneCard goal={milestone} today={today} />}

      <div className="mt-3 flex flex-col gap-4 px-5 lg:flex-row lg:items-start lg:gap-5">
        <div className="min-w-0 lg:w-[55%]">
          <NowMarker today={today} />

          {spine.map((node) => (
            <div key={node.goal.id} id={`goal-${node.goal.id}`} className="scroll-mt-28">
              <JourneyCard
                goal={node.goal}
                today={today}
                isNext={node.isNextMilestone}
                selected={selectedId === node.goal.id}
                onSelect={() => select(node.goal.id)}
              />
              {node.goal.horizon === "1M" && areas.length > 0 && (
                <div className="mb-2 ml-6 border-l border-dashed border-stone-200 pl-3">
                  <p className="mb-1.5 text-[10px] font-bold text-stone-400">この1か月を作っているもの</p>
                  <div className="flex flex-col gap-1.5">
                    {areas.map((g) => (
                      <div key={g.id} id={`goal-${g.id}`} className="scroll-mt-28">
                        <AreaCard
                          goal={g}
                          today={today}
                          selected={selectedId === g.id}
                          onSelect={() => select(g.id)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Desktop: 常時見える詳細。 */}
        {selected && (
          <div className="hidden lg:sticky lg:top-24 lg:block lg:w-[45%]">
            <GoalDetail goal={selected} today={today} linkedTasks={tasksOf.get(selected.id) ?? 0} />
          </div>
        )}
      </div>

      {/* §23/§24: 5 YEAR の下。横幅を丸ごと使って全文を読ませる。
          スペースが余っているのに3枚の小カードへ圧縮して切るのは禁止。 */}
      <NorthStarSection stars={stars} onOpen={select} />

      {/* Mobile: Tap → Sheet (§9)。 */}
      {selected && sheetOpen && (
        <div className="fixed inset-0 z-40 flex items-end lg:hidden">
          <button
            type="button"
            aria-label="閉じる"
            onClick={() => setSheetOpen(false)}
            className="absolute inset-0 bg-stone-900/45"
          />
          <div className="relative max-h-[82dvh] w-full overflow-y-auto rounded-t-3xl bg-white px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-2.5">
            <div className="mb-2 flex justify-center">
              <span className="h-1 w-9 rounded-full bg-stone-200" />
            </div>
            <GoalDetail
              goal={selected}
              today={today}
              linkedTasks={tasksOf.get(selected.id) ?? 0}
              onClose={() => setSheetOpen(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * §22〜§25: North Star は本人が確定した全文がSource of Truth。
 * AIが要約・言い換えしない。Desktopは横幅を使って読ませ、Mobileだけ
 * Accordionにする——ただし畳むのは表示であって、文そのものは短縮しない。
 */
function NorthStarSection({ stars, onOpen }: { stars: Goal[]; onOpen: (id: string) => void }) {
  const [openId, setOpenId] = useState<string | null>(stars[0]?.id ?? null);
  if (stars.length === 0) return null;

  return (
    <section className="mt-4 px-5">
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full bg-stone-800" />
        <p className="text-[11px] font-black tracking-widest text-stone-800">NORTH STAR</p>
        <span className="h-px flex-1 bg-stone-200" />
      </div>
      <p className="mb-2 mt-1 pl-[18px] text-[10px] text-stone-400">
        期限を持たないもの。ここへ向かって、上の期間Goalが並んでいます。
      </p>

      <div className="flex flex-col gap-2">
        {stars.map((g) => {
          const star = g.isNorthStar;
          if (star === null) return null;
          const open = openId === g.id;
          return (
            <div key={g.id} className="rounded-2xl border border-stone-150 bg-white px-4 py-3.5">
              <button
                type="button"
                onClick={() => setOpenId(open ? null : g.id)}
                className="flex w-full items-baseline gap-2 text-left lg:cursor-default"
              >
                <span className="text-[11px] font-black tracking-wide text-accent-dark">
                  {NORTH_STAR_LABEL[star]}
                </span>
                <span className="ml-auto text-[10px] font-bold text-stone-300 lg:hidden">
                  {open ? "閉じる" : "全文を読む"}
                </span>
              </button>

              {/* Desktopは常に全文。Mobileは開いたときだけ全文、閉じていても
                  冒頭2行は見える (§25)。 */}
              <p
                className={`mt-1.5 whitespace-pre-line text-[13px] leading-relaxed text-stone-700 lg:line-clamp-none ${
                  open ? "" : "line-clamp-2"
                }`}
              >
                {g.desiredState}
              </p>

              {g.achievementCriteria && (open || false) && (
                <p className="mt-2 whitespace-pre-line text-[11px] leading-relaxed text-stone-400">
                  {g.achievementCriteria}
                </p>
              )}

              <button
                type="button"
                onClick={() => onOpen(g.id)}
                className="mt-2 text-[11px] font-bold text-accent-dark"
              >
                このNorth Starの詳細 ＞
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function NextMilestoneCard({ goal, today }: { goal: Goal; today: string }) {
  const headline = horizonHeadline(goal, today);
  const label = GOAL_HORIZON_LABEL[goal.horizon];
  return (
    <section className="mx-5 mt-2 rounded-2xl bg-accent px-4 py-3 text-white">
      <p className="text-[10px] font-black tracking-widest text-white/70">NEXT MILESTONE</p>
      <div className="mt-0.5 flex items-baseline gap-2">
        <span className="text-[26px] font-black leading-none tabular-nums">{headline}</span>
        <span className="text-[13px] font-bold text-white/80">
          {label === "この期間の中身" ? goal.title : label}
        </span>
        {goal.targetDate && (
          <span className="ml-auto text-[11px] font-bold text-white/70">{formatMd(goal.targetDate)}</span>
        )}
      </div>
      {/* §9: ここも2行まで。全文は下のCardをTapして読む。 */}
      <p className="mt-1.5 line-clamp-2 text-[12px] font-medium leading-relaxed text-white/95">
        {goal.desiredState.replace(/\n/g, " ")}
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

/**
 * §8/§9: カード表面は 期間 / Countdown / 理想1〜2行 / Evidence か Gap 1つ。
 * 達成条件の全文は詳細側。ここに置くと必ず文字壁になる。
 */
function JourneyCard({
  goal,
  today,
  isNext,
  selected,
  onSelect,
}: {
  goal: Goal;
  today: string;
  isNext: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const headline = horizonHeadline(goal, today);
  const line = surfaceLine(goal);
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
            <span className="ml-auto shrink-0 text-[10px] font-bold text-stone-300">{formatMd(goal.targetDate)}</span>
          )}
        </div>
        <p className="mt-1 line-clamp-2 text-[12px] leading-snug text-stone-600">
          {goal.desiredState.replace(/\n/g, " ")}
        </p>
        {line.kind !== "NONE" && <SurfaceLine kind={line.kind} text={line.text} />}
      </button>
    </div>
  );
}

function AreaCard({
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
  const step = useMemo(() => currentStep(goal, allGapItems), [goal]);
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
      {/* いま止まっている一歩を1行だけ。 */}
      {step && (
        <p className="mt-1 line-clamp-1 text-[10px] font-bold text-stone-400">
          いまここ　{step.title}・{GAP_STATUS_LABEL[step.status]}
        </p>
      )}
    </button>
  );
}

function SurfaceLine({ kind, text }: { kind: "EVIDENCE" | "GAP"; text: string }) {
  return (
    <p
      className={`mt-1 line-clamp-1 text-[10px] font-bold ${
        kind === "EVIDENCE" ? "text-accent-dark" : "text-stone-400"
      }`}
    >
      {kind === "EVIDENCE" ? "次に積む　" : "いまの差　"}
      {text}
    </p>
  );
}

/** 詳細。Desktopは右、Mobileはsheet。ここだけが全文を持つ (§9)。 */
function GoalDetail({
  goal,
  today,
  linkedTasks,
  onClose,
}: {
  goal: Goal;
  today: string;
  linkedTasks: number;
  onClose?: () => void;
}) {
  const headline = horizonHeadline(goal, today);
  const path = useMemo(() => goalPath(goal, allGapItems), [goal]);
  const progress = useMemo(() => pathProgress(path), [path]);
  const label = GOAL_HORIZON_LABEL[goal.horizon];

  return (
    <section className="rounded-2xl border border-stone-150 bg-white px-4 py-3.5">
      <div className="flex items-baseline gap-2">
        <span className="text-[10px] font-black tracking-widest text-stone-400">
          {goal.isNorthStar ? "NORTH STAR" : label}
        </span>
        {goal.targetDate && (
          <span className="ml-auto tabular-nums text-[11px] font-bold text-stone-400">
            {formatMd(goal.targetDate)}
          </span>
        )}
        {onClose && (
          <button type="button" onClick={onClose} className="ml-auto text-[11px] font-bold text-stone-400 lg:hidden">
            閉じる
          </button>
        )}
      </div>
      <div className="mt-0.5 flex items-baseline gap-2">
        {goal.title !== label && (
          <h2 className="text-[17px] font-black leading-snug text-stone-900">{goal.title}</h2>
        )}
        {headline && <span className="text-[17px] font-black tabular-nums text-accent-dark">{headline}</span>}
      </div>

      {/* §10: どのNorth Starに繋がるか。説明はしない。 */}
      {goal.northStars.length > 0 && (
        <p className="mt-1.5 flex flex-wrap items-center gap-1 text-[10px] font-bold text-stone-400">
          {goal.northStars.map((s) => (
            <span key={s} className="rounded-full bg-stone-100 px-1.5 py-0.5">
              → {NORTH_STAR_LABEL[s]}
            </span>
          ))}
        </p>
      )}

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
