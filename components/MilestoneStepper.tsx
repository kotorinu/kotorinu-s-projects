"use client";

import { GAP_OWNER_LABEL } from "@/lib/gapBoard";
import type { OutcomeMilestone } from "@/lib/types";

// 工程のStepper (2026-09-08 第5ラウンド, §23).
//
// While the number of people is unknown, RIALA's progress is the steps of the
// migration — shown as a rail, not as sentences. No invented headcount.
const DOT: Record<string, { fill: string; ring: string; label: string }> = {
  DONE: { fill: "#51B749", ring: "#51B749", label: "済" },
  DOING: { fill: "#5484ED", ring: "#5484ED", label: "中" },
  READY: { fill: "#FFFFFF", ring: "#57534E", label: "" },
  WAITING: { fill: "#FFFFFF", ring: "#E3B93B", label: "" },
  BACKLOG: { fill: "#FFFFFF", ring: "#D6D3D1", label: "" },
};

export default function MilestoneStepper({ milestones }: { milestones: OutcomeMilestone[] }) {
  const done = milestones.filter((m) => m.status === "DONE").length;

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <p className="text-[12px] font-bold text-stone-500">工程</p>
        <p className="tabular-nums text-[12px] font-black text-stone-700">
          {done}
          <span className="text-[10px] font-bold text-stone-300"> / {milestones.length}</span>
        </p>
      </div>

      <ol className="mt-2">
        {milestones.map((m, i) => {
          const style = DOT[m.status] ?? DOT.BACKLOG;
          const last = i === milestones.length - 1;
          return (
            <li key={m.id} className="flex gap-2.5">
              <div className="flex flex-col items-center">
                <span
                  className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 text-[8px] font-black text-white"
                  style={{ backgroundColor: style.fill, borderColor: style.ring }}
                >
                  {style.label}
                </span>
                {!last && <span className="w-[2px] flex-1 bg-stone-150" style={{ minHeight: 14 }} />}
              </div>
              <div className={`min-w-0 flex-1 ${last ? "" : "pb-2.5"}`}>
                <p
                  className={`text-[12px] font-bold leading-snug ${
                    m.status === "DONE" ? "text-stone-400" : "text-stone-800"
                  }`}
                >
                  {m.title}
                </p>
                <p className="text-[10px] text-stone-400">{GAP_OWNER_LABEL[m.owner]}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
