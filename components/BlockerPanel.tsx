"use client";

import { useState } from "react";
import Link from "next/link";
import type { Blocker, BlockerType } from "@/lib/types";

// 気になっていること (2026-09-09, P5/P5-1).
//
// A bare "4件" told the user something was in the way but not what, and gave
// them nowhere to go. Each item now names who it waits on and links to the
// place it actually lives; an item with nothing to link to still shows its
// detail and where it came from, rather than being a number.
const TYPE_LABEL: Record<BlockerType, string> = {
  WAITING_EXTERNAL: "相手待ち",
  MISSING_INFO: "情報が足りない",
  NEEDS_DECISION: "決めれば動く",
  RISK: "リスク",
};

const TYPE_STYLE: Record<BlockerType, string> = {
  WAITING_EXTERNAL: "bg-[#FDF7E6] text-[#8A6A0B]",
  MISSING_INFO: "bg-stone-100 text-stone-600",
  NEEDS_DECISION: "bg-accent-soft text-accent-dark",
  RISK: "bg-danger-soft text-danger",
};

export default function BlockerPanel({
  blockers,
  onOpenTask,
  onOpenGap,
}: {
  blockers: Blocker[];
  onOpenTask?: (taskId: string) => void;
  onOpenGap?: (gapId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const items = blockers.filter((b) => b.status === "OPEN");
  if (items.length === 0) return null;

  return (
    <section className="rounded-2xl border border-stone-150 bg-white px-4 py-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="text-[12px] font-bold text-stone-600">
          気になっていること
          <span className="ml-1.5 tabular-nums text-[13px] font-black text-stone-800">{items.length}</span>
        </span>
        <span className="text-[11px] text-stone-300">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <ul className="mt-2 flex flex-col gap-1.5">
          {items.map((b) => (
            <li key={b.id} className="rounded-xl bg-stone-50 px-3 py-2.5">
              <div className="flex items-baseline gap-1.5">
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${TYPE_STYLE[b.type]}`}>
                  {TYPE_LABEL[b.type]}
                </span>
                <span className="text-[10px] font-bold text-stone-400">{b.owner}</span>
              </div>
              <p className="mt-1 text-[12px] font-bold leading-snug text-stone-800">{b.title}</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-stone-500">{b.detail}</p>

              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                {b.linkedTaskId && onOpenTask && (
                  <button
                    type="button"
                    onClick={() => onOpenTask(b.linkedTaskId!)}
                    className="text-[11px] font-bold text-accent-dark"
                  >
                    Taskを開く ›
                  </button>
                )}
                {b.linkedGapId && onOpenGap && (
                  <button
                    type="button"
                    onClick={() => onOpenGap(b.linkedGapId!)}
                    className="text-[11px] font-bold text-accent-dark"
                  >
                    足りないものを見る ›
                  </button>
                )}
                {b.linkedHref && (
                  <Link href={b.linkedHref} className="text-[11px] font-bold text-accent-dark">
                    {b.linkedHref.includes("sales-master")
                      ? "営業Master ›"
                      : b.linkedHref.includes("riala-master")
                        ? "RIALA Master ›"
                        : "Area Home ›"}
                  </Link>
                )}
                <span className="ml-auto text-[10px] text-stone-300">出典 {b.source}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
