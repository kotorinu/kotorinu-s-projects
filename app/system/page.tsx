"use client";

import { useMemo } from "react";
import Link from "next/link";
import PlanIntegrityPanel from "@/components/PlanIntegrityPanel";
import { buildLabel } from "@/lib/buildInfo";
import { AUTHORITY_NOTE, PLAN_READINESS_LABEL, tasksWaitingForPlan, timeDrifts } from "@/lib/calendarAuthority";
import { calendarSnapshot } from "@/lib/calendarSnapshot";
import { useClock } from "@/lib/currentTime";
import { tasks as allTasks } from "@/lib/dummy-data";
import { liveTimeBlocks, planLastChangedAt, supersededByReschedule } from "@/lib/livePlan";
import { useTodayExecution } from "@/lib/todayExecutionStore";

// System Status (2026-09-09, §21/§54).
//
// Plan Validator / Calendar Diff / Snapshot の詳細 / build情報 は、問題が
// 起きたときにだけ必要なもの。毎日のTASK MAPの一等地に置いておくと、読まれ
// ないまま場所だけ取り、肝心の「今日の前進」を押し下げる。
//
// だからここへ移した。日常の画面は、問題があるときだけ小さなBannerでここへ
// 送る。

export default function SystemStatusPage() {
  const store = useTodayExecution();
  const { nowHmValue } = useClock();
  const {
    currentDate: today,
    timeBlockOverrides,
    supersededBlockIds,
    completions,
    dispositions,
    deadlineOverrides,
    workDateOverrides,
    lifecycleOverrides,
  } = store;

  const overlays = useMemo(
    () => ({ completions, dispositions, deadlineOverrides, workDateOverrides, lifecycleOverrides }),
    [completions, dispositions, deadlineOverrides, workDateOverrides, lifecycleOverrides]
  );
  const planBlocks = useMemo(
    () => liveTimeBlocks({ timeBlockOverrides, supersededBlockIds }),
    [timeBlockOverrides, supersededBlockIds]
  );
  const staleBlocks = useMemo(
    () => supersededByReschedule({ timeBlockOverrides, supersededBlockIds }),
    [timeBlockOverrides, supersededBlockIds]
  );
  const planChangedAt = useMemo(() => planLastChangedAt({ timeBlockOverrides }), [timeBlockOverrides]);

  const waiting = useMemo(
    () => tasksWaitingForPlan(allTasks, planBlocks, overlays),
    [planBlocks, overlays]
  );
  const drifts = useMemo(() => timeDrifts(planBlocks), [planBlocks]);

  return (
    <div className="flex flex-col pb-8">
      <header className="sticky top-0 z-10 bg-gradient-to-b from-background via-background to-transparent px-5 pb-2 pt-6">
        <Link href="/tasks" className="text-xs font-bold text-stone-400">
          ＜ TASK MAP
        </Link>
        <h1 className="mt-1 text-[24px] font-black tracking-tight">System Status</h1>
        <p className="mt-0.5 text-xs font-medium text-stone-400">
          問題があるときだけ見る画面です。毎日は見なくて構いません。
        </p>
      </header>

      <PlanIntegrityPanel
        tasks={allTasks}
        planBlocks={planBlocks}
        supersededBlocks={staleBlocks}
        overlays={overlays}
        clock={{ today, nowHm: nowHmValue }}
        planLastChangedAt={planChangedAt}
      />

      <section className="mx-5 mt-3 rounded-xl border border-stone-150 bg-white px-3 py-2.5">
        <h2 className="text-[11px] font-black tracking-wide text-stone-500">Calendarに枠が無いTask</h2>
        {waiting.length === 0 ? (
          <p className="mt-1 text-[11px] text-stone-500">
            ✓ ありません。実行すると決めたTaskはすべてCalendarに枠を持っています。
          </p>
        ) : (
          <ul className="mt-1.5 flex flex-col gap-1">
            {waiting.map((t) => (
              <li key={t.id} className="rounded-lg bg-amber-50 px-2.5 py-1.5">
                <p className="text-[11px] font-bold text-amber-900">{t.title}</p>
                <p className="mt-0.5 text-[10px] text-amber-800">
                  {PLAN_READINESS_LABEL.WAITING_FOR_PLAN}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mx-5 mt-3 rounded-xl border border-stone-150 bg-white px-3 py-2.5">
        <h2 className="text-[11px] font-black tracking-wide text-stone-500">時刻のズレ</h2>
        {drifts.length === 0 ? (
          <p className="mt-1 text-[11px] text-stone-500">✓ OSとCalendarの時刻は一致しています。</p>
        ) : (
          <ul className="mt-1.5 flex flex-col gap-1">
            {drifts.map((d) => (
              <li key={d.blockId} className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px]">
                <p className="font-bold text-amber-900">{d.label}</p>
                <p className="mt-0.5 tabular-nums text-amber-800">
                  OS {d.os.startTime}〜{d.os.endTime} → Calendar {d.calendar.startTime}〜{d.calendar.endTime}
                </p>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-1.5 text-[10px] leading-relaxed text-stone-400">{AUTHORITY_NOTE}</p>
      </section>

      <section className="mx-5 mt-3 rounded-xl border border-stone-150 bg-white px-3 py-2.5">
        <h2 className="text-[11px] font-black tracking-wide text-stone-500">Calendar Snapshot</h2>
        <dl className="mt-1 grid grid-cols-[5.5rem_1fr] gap-x-2 gap-y-1 text-[11px]">
          <dt className="text-stone-400">最終取得</dt>
          <dd className="tabular-nums text-stone-700">{calendarSnapshot.readAt}</dd>
          <dt className="text-stone-400">範囲</dt>
          <dd className="text-stone-700">
            {calendarSnapshot.coverageStart}〜{calendarSnapshot.coverageEnd}
          </dd>
          <dt className="text-stone-400">件数</dt>
          <dd className="tabular-nums text-stone-700">{calendarSnapshot.events.length}件</dd>
        </dl>
        <p className="mt-1.5 text-[10px] leading-relaxed text-stone-400">
          静的Snapshotです。取得したあとに本人がCalendarを編集したかどうかは、このアプリからは分かりません。
          だから「最新」とは表示せず、いつ取得したものかだけを出しています。
        </p>
      </section>

      <section className="mx-5 mt-3 rounded-xl border border-stone-150 bg-white px-3 py-2.5">
        <h2 className="text-[11px] font-black tracking-wide text-stone-500">Build</h2>
        <p className="mt-1 text-[11px] tabular-nums text-stone-600">{buildLabel()}</p>
      </section>
    </div>
  );
}
