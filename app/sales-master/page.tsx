"use client";

import { useState } from "react";
import Link from "next/link";
import { roleplayFeedback, salesPhases, salesSprint } from "@/lib/dummy-data";
import { formatMd } from "@/lib/date";
import { computeSprintProgress, masteryStatusLabel, phaseCoverage } from "@/lib/sales";
import SalesPhaseDetailSheet from "@/components/SalesPhaseDetailSheet";
import { useTodayExecution } from "@/lib/todayExecutionStore";
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
  // 自分版は本人が書いた内容から導出する（§5）。fixtureは不変なので
  // 入力はstoreのoverlayに入る——ここで読まないとCoverageが動かない。
  const { phaseOwnVersions } = useTodayExecution();
  const progress = computeSprintProgress(salesPhases, roleplayFeedback);
  const coverage = phaseCoverage(salesPhases, phaseOwnVersions);

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

        {/* 2026-09-08: this checkpoint targets UNDERSTANDING, not USABLE —
            committing to a finished product talk while the product itself is
            not yet understood would only produce invented content.
            ワークシートが届いたので①基礎は17/17。ただしそれは「与えられた
            もの」であって本人の進捗ではないので、進捗として見るのは②自分版の
            方。両者を足して1つの%にしない。 */}
        <div className="mt-3 border-t border-stone-100 pt-3">
          <p className="mb-2 text-[10px] font-black tracking-widest text-stone-400">
            9/9の到達目標：UNDERSTANDING
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-2xl bg-stone-50 px-3 py-2.5">
              <p className="text-[10px] font-bold text-stone-400">① 基礎（ワークシート）</p>
              <p className="mt-0.5 text-[18px] font-black tabular-nums text-stone-800">
                {coverage.purpose}
                <span className="text-[11px] font-bold text-stone-400"> / {coverage.total}</span>
              </p>
              <p className="mt-0.5 text-[10px] leading-relaxed text-stone-400">
                目的・OK状態・確認事項・質問例・NG例
              </p>
            </div>
            <div className="rounded-2xl bg-accent-soft px-3 py-2.5">
              <p className="text-[10px] font-bold text-accent-dark">② 自分版（これから）</p>
              <p className="mt-0.5 text-[18px] font-black tabular-nums text-stone-800">
                {coverage.ownVersionDone}
                <span className="text-[11px] font-bold text-stone-400"> / {coverage.ownVersionAchievable}</span>
              </p>
              <p className="mt-0.5 text-[10px] leading-relaxed text-stone-500">自分の理解＋自分の質問</p>
            </div>
          </div>
          {coverage.productInfoRequired > 0 && (
            <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800">
              商品情報待ち {coverage.productInfoRequired}フェーズ（提案内容・価格・オファー・クロージング表現）。
              自分版の分母から外してあり、埋まっていないことを進捗の遅れとして数えません。
            </p>
          )}
        </div>

        <div className="mt-3 flex flex-col gap-2 border-t border-stone-100 pt-3">
          <p className="text-[10px] font-black tracking-widest text-stone-400">次のCheckpoint（未着手）</p>
          <div className="flex items-center justify-between text-[12px]">
            <span className="font-bold text-stone-500">Practice Coverage（口頭練習）</span>
            <span className="tabular-nums font-bold text-stone-400">
              {progress.practiceCoverage.done} / {progress.practiceCoverage.total}
            </span>
          </div>
          <div className="flex items-center justify-between text-[12px]">
            <span className="font-bold text-stone-500">通しロープレ</span>
            <span className={`font-bold ${progress.roleplayDone ? "text-accent-dark" : "text-stone-400"}`}>
              {progress.roleplayDone ? "実施済み" : "次Checkpointへ"}
            </span>
          </div>
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-stone-400">
          「17/17 入力された」ことと「営業で使える」ことは別に扱います。9/9は理解（目的・OK状態・引き出す情報・聞き方）までが目標で、口頭練習とロープレは次のCheckpointです。
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

