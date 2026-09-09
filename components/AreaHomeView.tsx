"use client";

import { useState } from "react";
import { useMemo } from "react";
import Link from "next/link";
import {
  allGapItems,
  blockers,
  capabilities,
  goals,
  monthEndStates,
  outcomeMilestones,
  salesVideoLibrary,
  salesPhases,
  weeklyReadings,
} from "@/lib/dummy-data";
import BlockerPanel from "@/components/BlockerPanel";
import CapabilityMap from "@/components/CapabilityMap";
import GapBoard from "@/components/GapBoard";
import { resolveGaps } from "@/lib/gapBoard";
import { liveTimeBlocks } from "@/lib/livePlan";
import { AREA_THEME, ACTIVITY_THEME } from "@/lib/areaTheme";
import { tasks as allTasks } from "@/lib/dummy-data";
import MilestoneStepper from "@/components/MilestoneStepper";
import PhaseProgressGrid from "@/components/PhaseProgressGrid";
import SalesPhaseDetailSheet from "@/components/SalesPhaseDetailSheet";
import type { SalesPhase } from "@/lib/types";
import { daysBetween, formatMd } from "@/lib/date";
import { areaProfileBySlug, buildAreaHome } from "@/lib/areaHome";
import { phaseCoverage } from "@/lib/sales";
import { useTodayExecution } from "@/lib/todayExecutionStore";
import TaskDetailSheet from "@/components/TaskDetailSheet";
import type { Task } from "@/lib/types";

const WEEKDAY = ["日", "月", "火", "水", "木", "金", "土"];

// Area Home (2026-09-08, revised same day after mobile feedback).
//
// The first version put four long paragraphs — 目的 / GOAL / Outcome /
// 現在地 — above anything actionable. On a phone that is a wall of text, and
// the user could not tell what the screen was for.
//
// So the order is now: 追っている数字 → いま必達のOutcome → 次にやること(時刻付き)
// → あとは全部たたむ. The prose (why this area exists, where it stands) is
// still here and unchanged, just not in front of the answer. Nothing was
// deleted to make it fit.
export default function AreaHomeView({ slug }: { slug: string }) {
  const {
    currentDate: today,
    completions,
    dispositions,
    deadlineOverrides,
    workDateOverrides,
    lifecycleOverrides,
    phaseOwnVersions,
    taskStartedAt,
    timeBlockOverrides,
    supersededBlockIds,
  } = useTodayExecution();
  // §19: one live plan for every screen.
  const planBlocks = liveTimeBlocks({ timeBlockOverrides, supersededBlockIds });
  const overlays = { completions, dispositions, deadlineOverrides, workDateOverrides, lifecycleOverrides };
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [selectedPhase, setSelectedPhase] = useState<SalesPhase | null>(null);

  const profile = areaProfileBySlug(slug);
  const data = useMemo(
    () => (profile ? buildAreaHome(profile.area, today, overlays, planBlocks) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [profile?.area, today, completions, dispositions, deadlineOverrides, workDateOverrides, lifecycleOverrides]
  );

  if (!profile || !data) {
    return (
      <div className="px-5 py-10">
        <Link href="/tasks" className="text-xs font-bold text-stone-400">
          ＜ TASK MAP
        </Link>
        <p className="mt-4 text-sm text-stone-500">このAreaは見つかりませんでした。</p>
      </div>
    );
  }

  const outcomeDaysLeft =
    data.outcome?.deadline != null ? daysBetween(today, data.outcome.deadline) : null;

  const coverage = profile.area === "営業代行" ? phaseCoverage(salesPhases, phaseOwnVersions) : null;
  // §7: while the headcount is unknown, RIALA's progress is the steps of the
  // migration — real state, no invented number.
  const milestones =
    data.outcome !== null ? outcomeMilestones.filter((m) => m.outcomeId === data.outcome!.id) : [];
  const monthGoal = profile
    ? monthEndStates.find((m) => m.monthKey === "2026-09" && m.area === profile.area) ?? null
    : null;
  const areaCapabilities = profile ? capabilities.filter((c) => c.area === profile.area) : [];
  // P4: 合宿までの Readiness。締切は Goal 側の実データから取る——ここで
  // 日付をハードコードすると、Goalを動かした時に静かにズレる。
  const campGoal = goals.find((g) => g.id === "g-genesis-camp") ?? null;
  const campDaysLeft =
    campGoal?.targetDate != null ? daysBetween(today, campGoal.targetDate) : null;
  const gaps = profile
    ? resolveGaps(allGapItems, profile.area, allTasks, overlays, new Set(taskStartedAt.keys()))
    : [];
  const theme = profile ? AREA_THEME[profile.area] : AREA_THEME["その他"];
  const gapProgressOverride =
    coverage !== null
      ? {
          "gap-sales-own-version": {
            done: coverage.ownFieldsFilled,
            total: coverage.ownFieldsTotal,
            unit: "項目（11フェーズ×3）",
          },
        }
      : undefined;
  const currentReading =
    profile.area === "GENESIS" ? weeklyReadings.find((r) => r.status === "IN_PROGRESS") ?? null : null;

  // 追っている数字 — one headline figure per area, so "何を管理したいのか" is
  // answered before any prose. Never a task-completion percentage: that
  // measures activity, not the Outcome.
  const headline =
    coverage !== null
      ? {
          label: "自分版が書けているフェーズ",
          value: `${coverage.ownVersionDone} / ${coverage.ownVersionAchievable}`,
          sub: `基礎はワークシートから17/17。商品情報待ち ${coverage.productInfoRequired}フェーズは別枠`,
        }
      : profile.area === "RIALA"
        ? {
            label: "移行対応の工程",
            value: `${milestones.filter((m) => m.status === "DONE").length} / ${milestones.length}`,
            sub: "対象者の総数が未確認のため、人数ではなく工程で見る",
          }
        : {
            label: "毎日の積み上げを実行した日数",
            value: "DAY 1〜",
            sub: "Execution Baseline 2026-09-08 から計測",
          };

  return (
    <div className="flex flex-col pb-10">
      <header className="px-5 pb-3 pt-6">
        <Link href="/tasks" className="text-xs font-bold text-stone-400">
          ＜ TASK MAP
        </Link>
        <h1 className="mt-1 text-[24px] font-black tracking-tight">{profile.area}</h1>
        {profile.area === "RIALA" && (
          <p className="mt-2 rounded-xl bg-stone-100 px-3 py-2 text-[10px] font-bold leading-relaxed text-stone-500">
            旧FANTS移行の記録は <span className="text-stone-700">HISTORICAL / EXCEPTION ONLY</span>。新規の判断と準備は上のAI OPSで行います。
          </p>
        )}
      </header>

      <div className="lg:grid lg:grid-cols-[1fr_340px] lg:gap-5 lg:px-5">
        <div className="flex flex-col gap-2.5 px-5 lg:px-0">
          {/* 追っている数字 — §8: 大面積の黒はやめ、Areaの淡いTintにする */}
          <section
            className="rounded-2xl border px-4 py-3.5"
            style={{
              backgroundColor: theme.soft,
              borderTopColor: theme.border,
              borderRightColor: theme.border,
              borderBottomColor: theme.border,
              borderLeftWidth: 3,
              borderLeftColor: theme.primary,
            }}
          >
            <p className="text-[11px] font-bold text-stone-500">{headline.label}</p>
            <p className="mt-0.5 text-[30px] font-black leading-none tabular-nums" style={{ color: theme.text }}>
              {headline.value}
            </p>
            <p className="mt-1.5 text-[11px] leading-relaxed text-stone-500">{headline.sub}</p>
          </section>

          {/* P2-2/P2-4: 月末の到達点と「いま必達」を分ける。同じ言葉で
              2件並べない。 */}
          {monthGoal && (
            <section
              className="rounded-2xl border px-4 py-3"
              style={{
                backgroundColor: "#FFFFFF",
                borderTopColor: theme.border,
                borderRightColor: theme.border,
                borderBottomColor: theme.border,
                borderLeftWidth: 3,
                borderLeftColor: theme.primary,
              }}
            >
              <p className="text-[11px] font-bold text-stone-400">9月末の到達点</p>
              <p className="mt-0.5 text-[13px] font-bold leading-snug text-stone-800">{monthGoal.state}</p>
            </section>
          )}

          {/* いま必達 */}
          <section className="rounded-3xl bg-white px-4 py-3.5 shadow-sm">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-[10px] font-black tracking-widest text-accent-dark">いま必達</p>
              {data.outcome?.deadline && (
                <span className="shrink-0 text-[11px] font-black text-accent-dark">
                  〜{formatMd(data.outcome.deadline)}
                  {outcomeDaysLeft !== null &&
                    (outcomeDaysLeft >= 0 ? `・あと${outcomeDaysLeft}日` : `・${-outcomeDaysLeft}日超過`)}
                </span>
              )}
            </div>
            {data.outcome ? (
              <>
                <p className="mt-1 text-[15px] font-black leading-snug text-stone-800">{data.outcome.title}</p>
                <Collapsible label="達成の条件" count={data.outcome.achievementCriteria.length}>
                  <ul className="flex flex-col gap-1">
                    {data.outcome.achievementCriteria.map((c) => (
                      <li key={c} className="flex gap-1.5 text-[11px] leading-relaxed text-stone-600">
                        <span className="text-accent-dark">✓</span>
                        {c}
                      </li>
                    ))}
                  </ul>
                </Collapsible>
              </>
            ) : (
              <p className="mt-1 text-[12px] text-stone-500">Outcome未設定</p>
            )}
          </section>

          {/* 次にやること */}
          <section className="rounded-3xl bg-white px-4 py-3.5 shadow-sm">
            <p className="text-[10px] font-black tracking-widest text-stone-400">次にやること</p>
            {data.next.length === 0 ? (
              <p className="mt-1.5 text-[12px] text-stone-400">実行中のTaskはありません</p>
            ) : (
              <ul className="mt-1.5 flex flex-col gap-1.5">
                {data.next.map(({ task, block, deadline }) => (
                  <li key={task.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedTask(task)}
                      className="w-full rounded-2xl bg-stone-50 px-3.5 py-2.5 text-left"
                    >
                      <p className="text-[11px] font-black tabular-nums text-accent-dark">
                        {block
                          ? `${formatMd(block.date)}（${WEEKDAY[new Date(block.date + "T00:00:00").getDay()]}） ${block.startTime}〜${block.endTime}`
                          : "実行時間が未設定"}
                        {deadline && <span className="ml-1.5 text-stone-400">期限 {formatMd(deadline)}</span>}
                      </p>
                      <p className="mt-0.5 text-[13px] font-bold leading-snug text-stone-800">{task.title}</p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-[10px] font-bold text-stone-400">
              実行中の計画 {data.activeCount}件・Backlog {data.backlogCount}件
              {data.overdueCount > 0 && <span className="text-danger">・期限超過 {data.overdueCount}件</span>}
              {data.blockedCount > 0 && <span>・Blocked {data.blockedCount}件</span>}
            </p>
            {data.unscheduledActive.length > 0 && (
              <p className="mt-1.5 rounded-xl bg-danger-soft px-3 py-2 text-[11px] font-bold text-danger">
                実行時間が決まっていないACTIVE Taskが{data.unscheduledActive.length}件あります
              </p>
            )}
          </section>

          {/* §7: Outcomeの工程進捗（人数が取れない間の現在地） */}
          {milestones.length > 0 && (
            <section className="rounded-2xl border border-stone-150 bg-white px-4 py-3.5">
              <MilestoneStepper milestones={milestones} />
              <p className="mt-2 text-[10px] leading-relaxed text-stone-400">
                対象者の総数が確認できたら「分類済み N / 総数」へ切り替えます。数字は作りません。
              </p>
            </section>
          )}

          {/* §4: 何が足りないか */}
          <section>
            <p className="mb-1.5 text-[10px] font-black tracking-widest text-stone-400">
              足りていないもの（Gap Board）
            </p>
            <GapBoard
              gaps={gaps}
              progressOverride={gapProgressOverride}
              onOpenTask={(taskId) => {
                const t = allTasks.find((x) => x.id === taskId) ?? null;
                if (t) setSelectedTask(t);
              }}
            />
          </section>

          {/* 営業の学習状況 — 基礎と自分版を分けて出す */}
          {coverage && (
            <section className="rounded-2xl border border-stone-150 bg-white px-4 py-3.5">
              <div className="flex items-baseline justify-between">
                <p className="text-[12px] font-bold text-stone-500">17フェーズの自分版</p>
                <p className="tabular-nums text-[13px] font-black text-stone-700">
                  {coverage.ownFieldsFilled}
                  <span className="text-[10px] font-bold text-stone-300"> / {coverage.ownFieldsTotal} 項目</span>
                </p>
              </div>
              <p className="mb-2 mt-0.5 text-[11px] text-stone-400">
                タップして「自分の言葉の目的 / OK状態 / 質問」を書くと増えます
              </p>
              <PhaseProgressGrid phases={salesPhases} ownVersions={phaseOwnVersions} onOpenPhase={setSelectedPhase} />
              <p className="mt-2 text-[10px] leading-relaxed text-stone-400">
                ①基礎はワークシートから17/17。①が埋まっていることと「営業で使える」ことは別です。
                商品情報が必要な{coverage.productInfoRequired}フェーズは分母から外しています。
              </p>
              <Collapsible
                label="参考にする動画"
                count={salesVideoLibrary.videos.length}
                sub={`優先度：低（${salesVideoLibrary.priority}）`}
              >
                <ul className="flex flex-col gap-1">
                  {salesVideoLibrary.videos.map((v) => (
                    <li key={v.id} className="flex items-baseline justify-between gap-2 text-[11px]">
                      <span className="min-w-0 truncate text-stone-600">{v.title}</span>
                      <span className="shrink-0 tabular-nums font-bold text-stone-400">
                        {v.minutes !== null ? `${v.minutes}分` : "-"}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-1.5 text-[10px] leading-relaxed text-stone-400">{salesVideoLibrary.note}</p>
              </Collapsible>
            </section>
          )}

          {areaCapabilities.length > 0 && (
            <section className="rounded-2xl border border-stone-150 bg-white px-4 py-3.5">
              <div className="flex items-baseline gap-2">
                <p className="text-[12px] font-bold text-stone-500">
                  {campDaysLeft !== null && campDaysLeft >= 0 ? "合宿まで" : "鍛えている力"}
                </p>
                {campDaysLeft !== null && campDaysLeft >= 0 && (
                  <>
                    <span className="tabular-nums text-[15px] font-black text-accent-dark">
                      あと{campDaysLeft}日
                    </span>
                    {campGoal?.targetDate && (
                      <span className="ml-auto text-[10px] font-bold text-stone-300">
                        {formatMd(campGoal.targetDate)}
                      </span>
                    )}
                  </>
                )}
              </div>
              <p className="mb-2 mt-0.5 text-[11px] leading-relaxed text-stone-400">
                持ち運べる力（Portable Skills）。点数はつけません。いま何が足りないか・証拠・次の練習だけで見ます。
              </p>
              <CapabilityMap capabilities={areaCapabilities} />
            </section>
          )}

          {currentReading && (
            <section
              className="rounded-2xl border px-4 py-3.5"
              style={{
                backgroundColor: ACTIVITY_THEME.READING.soft,
                borderTopColor: ACTIVITY_THEME.READING.border,
                borderRightColor: ACTIVITY_THEME.READING.border,
                borderBottomColor: ACTIVITY_THEME.READING.border,
                borderLeftWidth: 3,
                borderLeftColor: ACTIVITY_THEME.READING.primary,
              }}
            >
              <p className="text-[11px] font-bold" style={{ color: ACTIVITY_THEME.READING.text }}>
                今週の読書（GENESIS）
              </p>
              <p className="mt-0.5 text-[15px] font-black text-stone-800">『{currentReading.bookTitle}』</p>
              <p className="mt-0.5 text-[10px] leading-relaxed text-stone-400">
                読む → 学び → 具体例 → 次Action まで通して1冊
                {currentReading.targetDate && `・目標 ${formatMd(currentReading.targetDate)}`}
              </p>
            </section>
          )}

          {/* たたんである説明 — 消してはいない */}
          <section className="rounded-3xl bg-white px-4 py-1 shadow-sm">
            <Collapsible label="このAreaは何のためにあるか" flush>
              <p className="text-[12px] leading-relaxed text-stone-600">{profile.purpose}</p>
              <p className="mt-2 text-[10px] font-black tracking-widest text-stone-400">目指している状態</p>
              <p className="mt-0.5 text-[12px] leading-relaxed text-stone-600">{profile.standingGoal}</p>
            </Collapsible>
            <Collapsible label="いまどこまで来ているか" flush>
              <p className="text-[12px] leading-relaxed text-stone-600">{profile.currentState}</p>
              {profile.knowledge.length > 0 && (
                <ul className="mt-2 flex flex-col gap-0.5">
                  {profile.knowledge.map((k) => (
                    <li key={k} className="text-[11px] text-stone-500">
                      ・{k}
                    </li>
                  ))}
                </ul>
              )}
            </Collapsible>
          </section>
        </div>

        {/* 右レール（Desktop）／ モバイルでは下に続く */}
        <div className="mt-2.5 flex flex-col gap-2.5 px-5 lg:mt-0 lg:px-0">
          {profile.masterHref && (
            <Link
              href={profile.masterHref}
              className="flex items-center justify-between rounded-3xl bg-stone-800 px-4 py-3.5 text-white shadow-sm"
            >
              <span>
                <span className="block text-[10px] font-black tracking-widest text-white/50">MASTER</span>
                <span className="mt-0.5 block text-[14px] font-black">{profile.masterLabel}</span>
              </span>
              <span className="text-lg">›</span>
            </Link>
          )}

          <section className="rounded-3xl bg-white px-4 py-1 shadow-sm">
            <Collapsible label="作業する場所" count={profile.sources.length} flush>
              <ul className="flex flex-col gap-1.5">
                {profile.sources.map((src) => (
                  <li key={src.label}>
                    {src.url ? (
                      <a
                        href={src.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block rounded-xl bg-stone-50 px-3 py-2"
                      >
                        <p className="text-[12px] font-bold text-accent-dark">{src.label} ↗</p>
                        <p className="mt-0.5 text-[10px] leading-relaxed text-stone-500">{src.purpose}</p>
                      </a>
                    ) : (
                      <div className="rounded-xl bg-stone-50 px-3 py-2">
                        <p className="text-[12px] font-bold text-stone-600">{src.label}</p>
                        <p className="mt-0.5 text-[10px] leading-relaxed text-stone-500">{src.purpose}</p>
                        <p className="mt-0.5 text-[10px] font-bold text-stone-400">リンク未確認</p>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </Collapsible>
          </section>

          <BlockerPanel
            blockers={blockers.filter((b) => b.area === profile.area)}
            onOpenTask={(taskId) => {
              const t = allTasks.find((x) => x.id === taskId) ?? null;
              if (t) setSelectedTask(t);
            }}
          />
        </div>
      </div>

      {selectedTask && <TaskDetailSheet task={selectedTask} onClose={() => setSelectedTask(null)} />}
      {selectedPhase && <SalesPhaseDetailSheet phase={selectedPhase} onClose={() => setSelectedPhase(null)} />}
    </div>
  );
}

/**
 * Collapsed by default on every screen size. Anything worth reading twice is
 * outside one of these; anything that was making the phone unreadable is
 * inside — still present, one tap away, with its count on the header so
 * nothing hides silently.
 */
function Collapsible({
  label,
  count,
  sub,
  tone = "normal",
  flush = false,
  children,
}: {
  label: string;
  count?: number;
  sub?: string;
  tone?: "normal" | "danger";
  flush?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={flush ? "border-b border-stone-100 py-2.5 last:border-0" : "mt-2"}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span
          className={`text-[11px] font-black tracking-wide ${tone === "danger" ? "text-danger" : "text-stone-400"}`}
        >
          {label}
          {count !== undefined && <span className="ml-1 tabular-nums">{count}</span>}
          {sub && <span className="ml-1.5 font-bold text-stone-300">{sub}</span>}
        </span>
        <span className={`shrink-0 text-[11px] ${tone === "danger" ? "text-danger" : "text-stone-300"}`}>
          {open ? "▾" : "▸"}
        </span>
      </button>
      {open && <div className="mt-2">{children}</div>}
    </div>
  );
}

