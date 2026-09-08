"use client";

import { useState } from "react";
import {
  GAP_COLUMNS_PRIMARY,
  GAP_COLUMNS_SECONDARY,
  GAP_KIND_LABEL,
  GAP_OWNER_LABEL,
  GAP_STATUS_EMPTY,
  GAP_STATUS_HINT,
  GAP_STATUS_LABEL,
  groupGaps,
  type ResolvedGap,
} from "@/lib/gapBoard";
import type { GapStatus } from "@/lib/types";

// Gap Board (2026-09-08 第5ラウンド, §30-§32).
//
// Card faces carry Title / Progress / Owner only. DoD, why and what is being
// waited on move behind a tap — cramming them onto the face is what made the
// board unreadable on a phone, and the fix is fewer words, not smaller ones.
//
// Status colour is a thin left rule and a small chip. 待ち is amber-neutral,
// never red: red is reserved for a real deadline problem (§51).
const STATUS_STYLE: Record<GapStatus, { rule: string; chip: string; dot: string }> = {
  DOING: { rule: "#5484ED", chip: "bg-[#EEF3FE] text-[#2C55B8]", dot: "bg-[#5484ED]" },
  READY: { rule: "#57534E", chip: "bg-stone-100 text-stone-600", dot: "bg-stone-500" },
  WAITING: { rule: "#E3B93B", chip: "bg-[#FDF7E6] text-[#8A6A0B]", dot: "bg-[#E3B93B]" },
  BACKLOG: { rule: "#D6D3D1", chip: "bg-stone-50 text-stone-400", dot: "bg-stone-300" },
  DONE: { rule: "#51B749", chip: "bg-[#EEF8ED] text-[#357F2F]", dot: "bg-[#51B749]" },
};

export default function GapBoard({
  gaps,
  onOpenTask,
  progressOverride,
}: {
  gaps: ResolvedGap[];
  onOpenTask?: (taskId: string) => void;
  progressOverride?: Record<string, { done: number; total: number; unit: string }>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const byStatus = groupGaps(gaps);

  const secondaryCount = GAP_COLUMNS_SECONDARY.reduce((n, s) => n + byStatus[s].length, 0);

  function column(status: GapStatus) {
    const items = byStatus[status];
    const style = STATUS_STYLE[status];
    return (
      <section key={status} className="rounded-2xl border border-stone-150 bg-white p-3">
        <div className="flex items-baseline gap-1.5">
          <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
          <span className="text-[12px] font-bold text-stone-700">{GAP_STATUS_LABEL[status]}</span>
          <span className="tabular-nums text-[11px] font-bold text-stone-300">{items.length}</span>
          <span className="ml-auto text-[10px] text-stone-300">{GAP_STATUS_HINT[status]}</span>
        </div>

        {items.length === 0 ? (
          <p className="mt-2 rounded-xl bg-stone-50 px-3 py-3 text-center text-[11px] text-stone-400">
            {GAP_STATUS_EMPTY[status]}
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1.5">
            {items.map((item) => {
              const progress = progressOverride?.[item.id] ?? item.progress;
              const isOpen = openId === item.id;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => setOpenId(isOpen ? null : item.id)}
                    className="block w-full rounded-xl border border-stone-150 border-l-[3px] bg-white px-3 py-2.5 text-left transition-colors duration-200 hover:bg-stone-50"
                    style={{ borderLeftColor: style.rule }}
                  >
                    <p className="text-[13px] font-bold leading-snug text-stone-800">{item.title}</p>
                    <div className="mt-1 flex items-center gap-1.5">
                      <span className="rounded-full bg-stone-50 px-1.5 py-0.5 text-[10px] font-bold text-stone-400">
                        {GAP_KIND_LABEL[item.kind]}
                      </span>
                      <span className="text-[10px] font-bold text-stone-400">{GAP_OWNER_LABEL[item.owner]}</span>
                      {progress && (
                        <span className="ml-auto tabular-nums text-[12px] font-black text-stone-700">
                          {progress.done}
                          <span className="text-[10px] font-bold text-stone-300"> / {progress.total}</span>
                        </span>
                      )}
                    </div>
                  </button>

                  {isOpen && (
                    <div className="mt-1 rounded-xl bg-stone-50 px-3 py-2.5">
                      <p className="text-[11px] leading-relaxed text-stone-600">
                        <span className="font-bold text-stone-400">完了条件　</span>
                        {item.doneWhen}
                      </p>
                      {item.waitingOn && (
                        <p className="mt-1 text-[11px] leading-relaxed text-[#8A6A0B]">
                          <span className="font-bold">待ち　</span>
                          {item.waitingOn}
                        </p>
                      )}
                      {item.note && (
                        <p className="mt-1 text-[10px] leading-relaxed text-stone-400">{item.note}</p>
                      )}
                      {item.taskId && onOpenTask && (
                        <button
                          type="button"
                          onClick={() => onOpenTask(item.taskId!)}
                          className="mt-1.5 text-[11px] font-bold text-[#2C55B8]"
                        >
                          Taskを開く ›
                        </button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {/* §31: on a phone only 進行中 / 次にやれる / 待ち are shown; the rest is
          one tap away. On desktop everything sits side by side. */}
      <div className="flex flex-col gap-2 lg:grid lg:grid-cols-5 lg:items-start">
        {GAP_COLUMNS_PRIMARY.map(column)}
        <div className="contents max-lg:hidden">{GAP_COLUMNS_SECONDARY.map(column)}</div>
      </div>

      {secondaryCount > 0 && (
        <div className="lg:hidden">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="w-full rounded-xl border border-stone-150 bg-white px-3 py-2 text-[11px] font-bold text-stone-400"
          >
            {expanded ? "あとで・完了を隠す" : `あとで・完了 ${secondaryCount}件を見る`}
          </button>
          {expanded && <div className="mt-2 flex flex-col gap-2">{GAP_COLUMNS_SECONDARY.map(column)}</div>}
        </div>
      )}
    </div>
  );
}
