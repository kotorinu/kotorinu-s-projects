"use client";

import { useState } from "react";
import Link from "next/link";
import { roleplayFeedback, salesPhases, salesSprint } from "@/lib/dummy-data";
import { formatMd } from "@/lib/date";
import { computeSprintProgress, masteryStatusLabel } from "@/lib/sales";
import ProgressBar from "@/components/ProgressBar";
import SalesPhaseDetailSheet from "@/components/SalesPhaseDetailSheet";
import type { SalesPhase } from "@/lib/types";

const masteryDot: Record<SalesPhase["masteryStatus"], string> = {
  NOT_STARTED: "bg-stone-300",
  UNDERSTANDING: "bg-sky-400",
  FILLED: "bg-accent",
  PRACTICING: "bg-amber-500",
  FEEDBACK_RECEIVED: "bg-violet-500",
  USABLE: "bg-emerald-500",
};

export default function SalesMasterPage() {
  const [selected, setSelected] = useState<SalesPhase | null>(null);
  const progress = computeSprintProgress(salesPhases, roleplayFeedback);

  return (
    <div className="flex flex-col pb-8">
      <header className="sticky top-0 z-10 bg-gradient-to-b from-background via-background to-transparent px-5 pb-2 pt-6">
        <Link href="/tasks" className="text-xs font-bold text-stone-400">
          ＜ TASK MAP
        </Link>
        <p className="mt-1 text-xs font-bold tracking-widest text-accent-dark">営業代行</p>
        <h1 className="mt-0.5 text-[26px] font-black tracking-tight">営業Master</h1>
        <p className="mt-0.5 text-xs font-medium text-stone-400">
          学んだ知識・実践者FB・ロープレ・実商談を17フェーズへ蓄積する、自分専用の営業プレイブック
        </p>
      </header>

      <section className="mx-5 mt-1 rounded-3xl bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,0,0,0.12)]">
        <p className="text-[11px] font-bold text-stone-400">CHECKPOINT</p>
        <p className="mt-0.5 text-[15px] font-black text-stone-800">{salesSprint.checkpointLabel}</p>
        {salesSprint.checkpointDate && (
          <p className="text-[11px] font-bold text-stone-400">{formatMd(salesSprint.checkpointDate)}まで</p>
        )}
        <p className="mt-2 text-[12px] leading-relaxed text-stone-600">{salesSprint.goal}</p>

        <div className="mt-3 flex flex-col gap-2 border-t border-stone-100 pt-3">
          <ProgressRow
            label="Structure Coverage"
            done={progress.structureCoverage.done}
            total={progress.structureCoverage.total}
          />
          <ProgressRow
            label="Practice Coverage"
            done={progress.practiceCoverage.done}
            total={progress.practiceCoverage.total}
          />
          <div className="flex items-center justify-between text-[12px]">
            <span className="font-bold text-stone-500">Roleplay</span>
            <span className={`font-bold ${progress.roleplayDone ? "text-accent-dark" : "text-stone-400"}`}>
              {progress.roleplayDone ? "実施済み" : "未実施"}
            </span>
          </div>
          <div className="flex items-center justify-between text-[12px]">
            <span className="font-bold text-stone-500">Self Feedback</span>
            <span className={`font-bold ${progress.selfFeedbackDone ? "text-accent-dark" : "text-stone-400"}`}>
              {progress.selfFeedbackDone ? "完成" : "未完成"}
            </span>
          </div>
        </div>
        <p className="mt-2 text-[10px] text-stone-400">
          17/17入力＝営業習得100%ではありません。Structure（書けた数）とPractice（練習した数）は別に見ます。
        </p>
      </section>

      <section className="mt-5 px-5">
        <h2 className="mb-2 text-xs font-bold text-stone-400">17フェーズ</h2>
        <div className="flex flex-col gap-1.5">
          {salesPhases.map((phase) => (
            <button
              key={phase.id}
              type="button"
              onClick={() => setSelected(phase)}
              className="flex w-full items-center gap-3 rounded-xl bg-white px-3.5 py-3 text-left shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_10px_-8px_rgba(0,0,0,0.15)]"
            >
              <span className="tabular-nums w-6 shrink-0 text-[11px] font-bold text-stone-300">
                {String(phase.phaseNumber).padStart(2, "0")}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-stone-800">{phase.title}</span>
              <span className={`h-2 w-2 shrink-0 rounded-full ${masteryDot[phase.masteryStatus]}`} />
              <span className="shrink-0 text-[11px] font-bold text-stone-400">
                {masteryStatusLabel(phase.masteryStatus)}
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="mt-5 px-5">
        <p className="rounded-2xl border border-dashed border-stone-200 px-4 py-3 text-[11px] leading-relaxed text-stone-400">
          将来：商談の録音・文字起こしが取得できるようになったら、AIが要約・フェーズ分類・不安/反論抽出・改善候補を補助する構想があります。Zoom
          Phone等は料金・利用可否が未確認のため TOOL_CANDIDATE（未確定）扱いです。
        </p>
      </section>

      {selected && <SalesPhaseDetailSheet phase={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function ProgressRow({ label, done, total }: { label: string; done: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div>
      <div className="flex items-center justify-between text-[12px]">
        <span className="font-bold text-stone-500">{label}</span>
        <span className="tabular-nums font-bold text-stone-700">
          {done}/{total}
        </span>
      </div>
      <div className="mt-1">
        <ProgressBar pct={pct} size="sm" />
      </div>
    </div>
  );
}
