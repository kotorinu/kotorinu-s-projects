"use client";

import { GAP_COLUMNS, GAP_KIND_LABEL, GAP_OWNER_LABEL, GAP_STATUS_HINT, gapsByStatus } from "@/lib/gapBoard";
import type { GapItem, GapStatus, HomeArea } from "@/lib/types";

// Gap Board (2026-09-08, §4).
//
// The columns are ordered DOING → READY → WAITING → BACKLOG → DONE, not the
// usual left-to-right pipeline: the question this board answers is "what is
// missing right now", so what is moving and what could move next come first.
//
// WAITING is styled as a neutral hold, never as failure. Something the user
// cannot move — product info that hasn't been taught, a reply that hasn't
// come — is not them being behind, and colouring it red is how a board stops
// being believed.
const COLUMN_STYLE: Record<GapStatus, { chip: string; card: string }> = {
  DOING: { chip: "bg-accent text-white", card: "bg-accent-soft" },
  READY: { chip: "bg-stone-800 text-white", card: "bg-stone-50" },
  WAITING: { chip: "bg-amber-100 text-amber-800", card: "bg-amber-50" },
  BACKLOG: { chip: "bg-stone-100 text-stone-500", card: "bg-stone-50" },
  DONE: { chip: "bg-emerald-100 text-emerald-700", card: "bg-stone-50" },
};

export default function GapBoard({
  items,
  area,
  onOpenTask,
  progressOverride,
}: {
  items: GapItem[];
  area: HomeArea;
  onOpenTask?: (taskId: string) => void;
  /** Live figures for gaps whose progress is derived, keyed by gap id. */
  progressOverride?: Record<string, { done: number; total: number; unit: string }>;
}) {
  const byStatus = gapsByStatus(items, area);

  return (
    <div className="flex flex-col gap-2.5 lg:grid lg:grid-cols-5 lg:items-start lg:gap-2.5">
      {GAP_COLUMNS.map((status) => {
        const column = byStatus[status];
        if (column.length === 0) return null;
        const style = COLUMN_STYLE[status];
        return (
          <section key={status} className="rounded-2xl bg-white px-3 py-3 shadow-sm">
            <div className="flex items-baseline gap-1.5">
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${style.chip}`}>{status}</span>
              <span className="tabular-nums text-[11px] font-bold text-stone-400">{column.length}</span>
            </div>
            <p className="mt-1 text-[9px] leading-relaxed text-stone-400">{GAP_STATUS_HINT[status]}</p>

            <ul className="mt-2 flex flex-col gap-1.5">
              {column.map((item) => {
                const progress = progressOverride?.[item.id] ?? item.progress;
                const body = (
                  <div className={`rounded-xl px-3 py-2.5 ${style.card}`}>
                    <div className="flex items-baseline justify-between gap-1.5">
                      <span className="text-[9px] font-bold text-stone-400">{GAP_KIND_LABEL[item.kind]}</span>
                      <span className="shrink-0 text-[9px] font-bold text-stone-400">
                        {GAP_OWNER_LABEL[item.owner]}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[12px] font-bold leading-snug text-stone-800">{item.title}</p>
                    {progress && (
                      <p className="mt-1 tabular-nums text-[11px] font-black text-stone-600">
                        {progress.done}
                        <span className="text-[10px] font-bold text-stone-400">
                          {" "}
                          / {progress.total} {progress.unit}
                        </span>
                      </p>
                    )}
                    {item.waitingOn && (
                      <p className="mt-1 text-[10px] leading-relaxed text-amber-800">待ち：{item.waitingOn}</p>
                    )}
                    <p className="mt-1 text-[10px] leading-relaxed text-stone-500">完了条件：{item.doneWhen}</p>
                  </div>
                );
                if (item.taskId && onOpenTask) {
                  return (
                    <li key={item.id}>
                      <button type="button" onClick={() => onOpenTask(item.taskId!)} className="block w-full text-left">
                        {body}
                      </button>
                    </li>
                  );
                }
                return <li key={item.id}>{body}</li>;
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
