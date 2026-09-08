"use client";

import { useState } from "react";
import { currentRunbookStep } from "@/lib/livePlan";
import type { SessionRunbook } from "@/lib/types";

// Runbook on TODAY (2026-09-08, §14).
//
// A 2.5-hour block that says only "17フェーズの目的とOK状態を書き切る" gives
// the user nothing to start on. This shows which step is running and, always,
// exactly one NEXT STEP — so the question at any moment is "do this next 30
// minutes", not "spend the evening on this somehow".
export default function RunbookStrip({
  runbook,
  nowHmValue,
}: {
  runbook: SessionRunbook;
  nowHmValue: string;
}) {
  const [open, setOpen] = useState(false);
  const { currentIndex, nextIndex } = currentRunbookStep(runbook, nowHmValue);
  const current = currentIndex >= 0 ? runbook.steps[currentIndex] : null;
  const next = nextIndex !== null ? runbook.steps[nextIndex] : null;

  return (
    <div className="mt-1.5 rounded-xl bg-white/70 px-2.5 py-2">
      {current ? (
        <>
          <p className="text-[9px] font-black tracking-widest text-accent-dark">
            いまここ {current.startTime}〜{current.endTime}
          </p>
          <p className="mt-0.5 text-[12px] font-bold leading-snug text-stone-800">{current.label}</p>
          <p className="mt-0.5 text-[10px] leading-relaxed text-stone-500">→ {current.outputs}</p>
        </>
      ) : (
        <p className="text-[9px] font-black tracking-widest text-stone-400">この枠の進め方</p>
      )}

      {next && (
        <p className="mt-1.5 border-t border-stone-100 pt-1.5 text-[10px] leading-snug text-stone-500">
          <span className="font-black text-stone-400">NEXT {next.startTime}　</span>
          {next.label}
        </p>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mt-1 text-[10px] font-bold text-stone-400"
      >
        {open ? "手順を隠す" : `全${runbook.steps.length}ステップを見る`}
      </button>

      {open && (
        <ol className="mt-1.5 flex flex-col gap-1">
          {runbook.steps.map((step, i) => (
            <li
              key={step.id}
              className={`rounded-lg px-2 py-1.5 text-[10px] leading-snug ${
                i === currentIndex ? "bg-accent-soft" : "bg-stone-50"
              }`}
            >
              <span className="tabular-nums font-black text-stone-400">
                {step.startTime}〜{step.endTime}
              </span>
              <span className="font-bold text-stone-700">{step.label}</span>
              <span className="mt-0.5 block text-stone-500">→ {step.outputs}</span>
            </li>
          ))}
        </ol>
      )}
      {runbook.note && <p className="mt-1 text-[9px] leading-relaxed text-stone-400">{runbook.note}</p>}
    </div>
  );
}
