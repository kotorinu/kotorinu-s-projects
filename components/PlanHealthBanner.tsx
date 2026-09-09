"use client";

import Link from "next/link";
import { useMemo } from "react";
import { actionableNow, calendarDiff, needsRecheck } from "@/lib/calendarDiff";
import { calendarSnapshot } from "@/lib/calendarSnapshot";
import { tasksWaitingForPlan, timeDrifts } from "@/lib/calendarAuthority";
import { validatePlan } from "@/lib/planValidator";
import type { Clock } from "@/lib/clock";
import type { TaskStateOverlays } from "@/lib/taskState";
import type { Task, TimeBlock } from "@/lib/types";

// 健康なら静か (2026-09-09, §19/§20).
//
// 本人から「計画の状態はほぼ見ない」というFeedback。正常時に「OS内部 整合 /
// Calendar Source of Truth / 差分0」の大きなパネルを毎回出すのは、読まれない
// 情報で画面の一等地を埋めているだけだった。
//
// なので出す条件を反転させる:
//   問題があるときだけBanner。無いときは何も出さない（見出しの小さな ✓ だけ）。
//
// Bannerを出すのは次の場合だけ:
//   Calendar再取得が必要 / TaskにCalendar枠が無い / 時刻のズレ /
//   Plan Validatorのエラー

export interface PlanHealth {
  ok: boolean;
  issues: number;
  waitingForPlan: number;
  drifts: number;
  calendarActions: number;
  needsRecheck: number;
}

export function usePlanHealth(
  tasks: Task[],
  planBlocks: TimeBlock[],
  supersededBlocks: TimeBlock[],
  overlays: TaskStateOverlays,
  clock: Clock,
  planLastChangedAt: string | null
): PlanHealth {
  return useMemo(() => {
    const issues = validatePlan(tasks, planBlocks, overlays, clock).length;
    const waiting = tasksWaitingForPlan(tasks, planBlocks, overlays).length;
    const drift = timeDrifts(planBlocks).length;
    const diff = calendarDiff({ planBlocks, supersededBlocks, from: clock.today });
    const actions = actionableNow(diff).length;
    const recheck =
      needsRecheck(diff).length +
      (planLastChangedAt !== null && planLastChangedAt > calendarSnapshot.readAt ? 1 : 0);
    return {
      ok: issues === 0 && waiting === 0 && drift === 0 && actions === 0 && recheck === 0,
      issues,
      waitingForPlan: waiting,
      drifts: drift,
      calendarActions: actions,
      needsRecheck: recheck,
    };
  }, [tasks, planBlocks, supersededBlocks, overlays, clock, planLastChangedAt]);
}

export default function PlanHealthBanner({ health }: { health: PlanHealth }) {
  if (health.ok) return null;

  const lines: string[] = [];
  if (health.issues > 0) lines.push(`実行計画の矛盾 ${health.issues}件`);
  if (health.waitingForPlan > 0) lines.push(`Calendarに枠が無いTask ${health.waitingForPlan}件`);
  if (health.drifts > 0) lines.push(`Calendarと時刻がずれている予定 ${health.drifts}件`);
  if (health.calendarActions > 0) lines.push(`Calendarへ反映が必要 ${health.calendarActions}件`);
  if (health.needsRecheck > 0) lines.push(`Calendarの再取得が必要 ${health.needsRecheck}件`);

  return (
    <Link
      href="/system"
      className="mx-5 mt-2 block rounded-xl border border-amber-200 bg-amber-50 px-3 py-2"
    >
      <div className="flex items-center gap-2">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
        <span className="text-[12px] font-bold text-amber-900">{lines[0]}</span>
        {lines.length > 1 && (
          <span className="text-[11px] text-amber-800">ほか{lines.length - 1}件</span>
        )}
        <span className="ml-auto shrink-0 text-[11px] font-bold text-amber-800">確認 ＞</span>
      </div>
    </Link>
  );
}

/** 正常時のしるし。見出しの横に置く程度の大きさ。 */
export function PlanOkMark({ health }: { health: PlanHealth }) {
  if (!health.ok) return null;
  return <span className="text-[10px] font-bold text-emerald-600">✓ Plan OK</span>;
}
