"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { salesVideoLibrary, salesPhases, weeklyReadings } from "@/lib/dummy-data";
import { daysBetween, formatMd } from "@/lib/date";
import { areaProfileBySlug, buildAreaHome } from "@/lib/areaHome";
import { phaseCoverage } from "@/lib/sales";
import { useTodayExecution } from "@/lib/todayExecutionStore";
import TaskDetailSheet from "@/components/TaskDetailSheet";
import type { Task } from "@/lib/types";

const WEEKDAY = ["日", "月", "火", "水", "木", "金", "土"];

// Area Home (2026-09-08, §6-§8/§18/§19).
//
// One screen per area answering, in this order: 何のため → 何を目指す →
// いつまでに何を → 今どこ → 次に何を → 何時に → どのMaster → どのSource →
// 何で止まっている. The order is the point: a task list that starts with
// "未完了8件" tells the user nothing about where they are.
export default function AreaHomeView({ slug }: { slug: string }) {
  const {
    currentDate: today,
    completions,
    dispositions,
    deadlineOverrides,
    workDateOverrides,
    lifecycleOverrides,
  } = useTodayExecution();
  const overlays = { completions, dispositions, deadlineOverrides, workDateOverrides, lifecycleOverrides };
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  const profile = areaProfileBySlug(slug);
  const data = useMemo(
    () => (profile ? buildAreaHome(profile.area, today, overlays) : null),
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
    data.outcome?.deadline !== null && data.outcome?.deadline !== undefined
      ? daysBetween(today, data.outcome.deadline)
      : null;

  const coverage = profile.area === "営業代行" ? phaseCoverage(salesPhases) : null;
  const currentReading =
    profile.area === "GENESIS" ? weeklyReadings.find((r) => r.status === "IN_PROGRESS") ?? null : null;

  return (
    <div className="flex flex-col pb-10">
      <header className="px-5 pb-3 pt-6">
        <Link href="/tasks" className="text-xs font-bold text-stone-400">
          ＜ TASK MAP
        </Link>
        <h1 className="mt-1 text-[26px] font-black tracking-tight">{profile.area}</h1>
        <p className="mt-1 text-[12px] leading-relaxed text-stone-500">{profile.purpose}</p>
      </header>

      <div className="lg:grid lg:grid-cols-[1fr_360px] lg:gap-5 lg:px-5">
        <div className="flex flex-col gap-3 px-5 lg:px-0">
          {/* ② 現在のゴール（長期）／③ Current Outcome（いま必達） */}
          <section className="rounded-3xl bg-white px-4 py-4 shadow-sm">
            <p className="text-[10px] font-black tracking-widest text-stone-400">GOAL・目指している状態</p>
            <p className="mt-1 text-[13px] font-bold leading-relaxed text-stone-700">{profile.standingGoal}</p>

            <div className="mt-3 rounded-2xl bg-accent-soft px-3.5 py-3">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-[10px] font-black tracking-widest text-accent-dark">NOW・いま必達のOutcome</p>
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
                  <p className="mt-1 text-[14px] font-black leading-snug text-stone-800">{data.outcome.title}</p>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-stone-600">{data.outcome.desiredState}</p>
                </>
              ) : (
                <p className="mt-1 text-[12px] text-stone-500">Outcome未設定</p>
              )}
            </div>
          </section>

          {/* ④ 現在地 */}
          <section className="rounded-3xl bg-white px-4 py-4 shadow-sm">
            <p className="text-[10px] font-black tracking-widest text-stone-400">現在地</p>
            <p className="mt-1 text-[12px] leading-relaxed text-stone-600">{profile.currentState}</p>

            {coverage && (
              <div className="mt-3 grid grid-cols-3 gap-2">
                <CoverageTile label="目的" filled={coverage.purpose} total={coverage.total} />
                <CoverageTile label="OK状態" filled={coverage.okState} total={coverage.total} />
                <CoverageTile label="確認事項・質問" filled={coverage.means} total={coverage.total} />
              </div>
            )}
            {coverage && (
              <p className="mt-2 text-[10px] leading-relaxed text-stone-400">
                {profile.progressLabel}。「17/17 入力された」ことと「営業で使える」ことは別に扱います。
              </p>
            )}
            {!coverage && (
              <p className="mt-2 text-[10px] leading-relaxed text-stone-400">{profile.progressLabel}</p>
            )}

            <div className="mt-3 flex flex-wrap gap-1.5 text-[10px] font-bold">
              <Pill tone="accent">実行中の計画 {data.activeCount}</Pill>
              <Pill tone="muted">Backlog {data.backlogCount}</Pill>
              {data.overdueCount > 0 && <Pill tone="danger">期限超過 {data.overdueCount}</Pill>}
              {data.blockedCount > 0 && <Pill tone="dark">Blocked {data.blockedCount}</Pill>}
            </div>
          </section>

          {/* ⑤ Next ＋ ⑥ Calendar Plan（同じカードで「何を」と「何時に」を一緒に） */}
          <section className="rounded-3xl bg-white px-4 py-4 shadow-sm">
            <p className="text-[10px] font-black tracking-widest text-stone-400">NEXT・次にやること</p>
            {data.next.length === 0 ? (
              <p className="mt-2 text-[12px] text-stone-400">実行中のTaskはありません</p>
            ) : (
              <ul className="mt-2 flex flex-col gap-2">
                {data.next.map(({ task, block, deadline }) => (
                  <li key={task.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedTask(task)}
                      className="w-full rounded-2xl bg-stone-50 px-3.5 py-3 text-left"
                    >
                      <p className="text-[13px] font-bold leading-snug text-stone-800">{task.title}</p>
                      <p className="mt-1 text-[11px] font-black tabular-nums text-accent-dark">
                        {block
                          ? `${formatMd(block.date)}（${WEEKDAY[new Date(block.date + "T00:00:00").getDay()]}） ${block.startTime}〜${block.endTime}`
                          : "実行時間が未設定"}
                      </p>
                      {task.definitionOfDone[0] && (
                        <p className="mt-1 text-[10px] leading-relaxed text-stone-500">
                          完了条件：{task.definitionOfDone[0]}
                        </p>
                      )}
                      {deadline && (
                        <p className="mt-0.5 text-[10px] font-bold text-stone-400">期限 {formatMd(deadline)}</p>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {data.unscheduledActive.length > 0 && (
              <p className="mt-2 rounded-xl bg-danger-soft px-3 py-2 text-[11px] font-bold text-danger">
                実行時間が決まっていないACTIVE Taskが{data.unscheduledActive.length}件あります（時間を決めるか
                Backlogへ戻す必要があります）
              </p>
            )}
          </section>

          {/* Area固有：営業＝Master導線と動画、GENESIS＝今週の読書 */}
          {profile.area === "営業代行" && (
            <section className="rounded-3xl bg-white px-4 py-4 shadow-sm">
              <p className="text-[10px] font-black tracking-widest text-stone-400">学習の状況</p>
              <div className="mt-2 rounded-2xl bg-stone-50 px-3.5 py-3">
                <p className="text-[12px] font-bold text-stone-700">{salesVideoLibrary.label}</p>
                <p className="mt-0.5 text-[11px] font-black text-stone-500">
                  全{salesVideoLibrary.totalVideos}本・{salesVideoLibrary.totalMinutes}分 ／ フェーズへ紐づけ済み{" "}
                  {salesVideoLibrary.videos.filter((v) => v.linkedPhaseIds.length > 0).length}本
                </p>
                <p className="mt-1 text-[10px] leading-relaxed text-stone-400">{salesVideoLibrary.note}</p>
              </div>
            </section>
          )}

          {currentReading && (
            <section className="rounded-3xl bg-white px-4 py-4 shadow-sm">
              <p className="text-[10px] font-black tracking-widest text-stone-400">今週の読書</p>
              <p className="mt-1 text-[15px] font-black text-stone-800">『{currentReading.bookTitle}』</p>
              <p className="mt-1 text-[10px] leading-relaxed text-stone-400">
                読む → 学び → 具体例 → 次Action まで通して1冊。
                {currentReading.targetDate && ` 目標 ${formatMd(currentReading.targetDate)}`}
              </p>
            </section>
          )}
        </div>

        {/* 右レール（Desktop）: Master / Source / Blocker */}
        <div className="mt-3 flex flex-col gap-3 px-5 lg:mt-0 lg:px-0">
          {profile.masterHref && (
            <Link
              href={profile.masterHref}
              className="flex items-center justify-between rounded-3xl bg-stone-800 px-4 py-4 text-white shadow-sm"
            >
              <span>
                <span className="block text-[10px] font-black tracking-widest text-white/50">MASTER</span>
                <span className="mt-0.5 block text-[15px] font-black">{profile.masterLabel}</span>
              </span>
              <span className="text-lg">›</span>
            </Link>
          )}

          {profile.knowledge.length > 0 && (
            <section className="rounded-3xl bg-white px-4 py-4 shadow-sm">
              <p className="text-[10px] font-black tracking-widest text-stone-400">KNOWLEDGE</p>
              <ul className="mt-1.5 flex flex-col gap-1">
                {profile.knowledge.map((k) => (
                  <li key={k} className="text-[12px] font-medium text-stone-600">
                    ・{k}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="rounded-3xl bg-white px-4 py-4 shadow-sm">
            <p className="text-[10px] font-black tracking-widest text-stone-400">SOURCE・作業する場所</p>
            <ul className="mt-1.5 flex flex-col gap-1.5">
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
          </section>

          {profile.blockers.length > 0 && (
            <section className="rounded-3xl bg-danger-soft px-4 py-4">
              <p className="text-[10px] font-black tracking-widest text-danger">BLOCKER・進まない理由</p>
              <ul className="mt-1.5 flex flex-col gap-1.5">
                {profile.blockers.map((b) => (
                  <li key={b} className="text-[11px] leading-relaxed text-stone-700">
                    ・{b}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>

      {selectedTask && <TaskDetailSheet task={selectedTask} onClose={() => setSelectedTask(null)} />}
    </div>
  );
}

function CoverageTile({ label, filled, total }: { label: string; filled: number; total: number }) {
  return (
    <div className="rounded-2xl bg-stone-50 px-2.5 py-2 text-center">
      <p className="text-[10px] font-bold text-stone-400">{label}</p>
      <p className="mt-0.5 text-[15px] font-black tabular-nums text-stone-800">
        {filled}
        <span className="text-[11px] font-bold text-stone-400"> / {total}</span>
      </p>
    </div>
  );
}

function Pill({ tone, children }: { tone: "accent" | "muted" | "danger" | "dark"; children: React.ReactNode }) {
  const cls = {
    accent: "bg-accent-soft text-accent-dark",
    muted: "bg-stone-100 text-stone-500",
    danger: "bg-danger-soft text-danger",
    dark: "bg-stone-800 text-white",
  }[tone];
  return <span className={`rounded-full px-2 py-0.5 ${cls}`}>{children}</span>;
}
