"use client";

import { OWN_FIELDS, phaseOwnState } from "@/lib/sales";
import type { PhaseOwnVersion, SalesPhase } from "@/lib/types";

// 17フェーズの状態を一目で (2026-09-08 第5ラウンド, §18).
//
// "0/11" alone doesn't say what would make it 1. This grid shows every phase
// as its own 0/3 → 3/3, so the answer to "何をすれば増える？" is on screen:
// the phases that aren't full yet, and which of the three fields is missing.
//
// Four states, distinguishable by colour AND shape, so it reads without
// relying on colour alone:
//   完成 (3/3)          filled, green tick
//   途中 (1-2/3)        partial ring
//   未着手 (0/3)        empty
//   商品情報待ち         amber, neutral — not a failure (§51)
export default function PhaseProgressGrid({
  phases,
  ownVersions,
  onOpenPhase,
}: {
  phases: SalesPhase[];
  ownVersions: Record<string, PhaseOwnVersion>;
  onOpenPhase: (phase: SalesPhase) => void;
}) {
  const states = phases.map((p) => phaseOwnState(p, ownVersions));

  return (
    <div>
      <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-9 lg:grid-cols-17">
        {states.map((s) => {
          const n = s.phase.phaseNumber;
          const waiting = s.needsProductInfo;
          const complete = s.complete && !waiting;
          const partial = s.filled > 0 && !complete;

          const bg = complete
            ? "#EEF8ED"
            : waiting
              ? "#FDF7E6"
              : partial
                ? "#EEF3FE"
                : "#FAFAF9";
          const border = complete
            ? "#51B749"
            : waiting
              ? "#E3B93B"
              : partial
                ? "#5484ED"
                : "#E7E5E4";
          const text = complete
            ? "#357F2F"
            : waiting
              ? "#8A6A0B"
              : partial
                ? "#2C55B8"
                : "#A8A29E";

          return (
            <button
              key={s.phase.id}
              type="button"
              onClick={() => onOpenPhase(s.phase)}
              title={`${n}. ${s.phase.title}`}
              className="flex aspect-square flex-col items-center justify-center rounded-lg border transition-transform duration-200 active:scale-95"
              style={{ backgroundColor: bg, borderColor: border }}
            >
              <span className="tabular-nums text-[11px] font-black leading-none" style={{ color: text }}>
                {String(n).padStart(2, "0")}
              </span>
              <span className="mt-0.5 text-[9px] font-bold leading-none" style={{ color: text }}>
                {complete ? "✓" : waiting ? "待" : `${s.filled}/${OWN_FIELDS.length}`}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-stone-400">
        <Legend color="#51B749" label="完成 3/3" />
        <Legend color="#5484ED" label="書きかけ" />
        <Legend color="#E7E5E4" label="未着手" />
        <Legend color="#E3B93B" label="商品情報待ち" />
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className="h-2 w-2 rounded-sm border" style={{ backgroundColor: color, borderColor: color }} />
      {label}
    </span>
  );
}
