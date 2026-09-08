"use client";

import Link from "next/link";
import { daysBetween, formatMd } from "@/lib/date";
import { GAP_OWNER_LABEL } from "@/lib/gapBoard";
import type { AreaHomeData } from "@/lib/areaHome";
import type { GapItem, TimeBlock } from "@/lib/types";

const WEEKDAY = ["日", "月", "火", "水", "木", "金", "土"];

const areaStyle: Record<string, string> = {
  営業代行: "bg-sky-50 text-sky-700",
  RIALA: "bg-violet-50 text-violet-700",
  GENESIS: "bg-teal-50 text-teal-700",
};

// Area Control Card (2026-09-08, §3).
//
// Answers, without reading a paragraph: 何を目指し / 今どこで / 何が足りず /
// 次に何を / いつやるか / 何で止まっているか. Every line is a state, not prose
// — the previous version led with three sentences of description and the user
// could not tell the areas apart at a glance.
export default function AreaControlCard({
  data,
  today,
  headline,
  mainGap,
  nextBlock,
  risks,
  selected,
  onSelect,
}: {
  data: AreaHomeData;
  today: string;
  headline: { label: string; value: string };
  mainGap: GapItem | null;
  nextBlock: { block: TimeBlock; taskTitle: string } | null;
  risks: string[];
  selected: boolean;
  onSelect: () => void;
}) {
  const daysLeft = data.outcome?.deadline != null ? daysBetween(today, data.outcome.deadline) : null;

  return (
    <div
      className={`rounded-2xl bg-white shadow-sm transition ${selected ? "ring-2 ring-accent" : ""}`}
    >
      <button type="button" onClick={onSelect} className="block w-full px-4 py-3 text-left">
        <div className="flex items-baseline justify-between gap-2">
          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${areaStyle[data.profile.area]}`}>
            {data.profile.area}
          </span>
          {data.outcome?.deadline && (
            <span
              className={`shrink-0 text-[11px] font-black ${
                daysLeft !== null && daysLeft < 0 ? "text-danger" : "text-accent-dark"
              }`}
            >
              〜{formatMd(data.outcome.deadline)}
              {daysLeft !== null && (daysLeft >= 0 ? `・あと${daysLeft}日` : `・${-daysLeft}日超過`)}
            </span>
          )}
        </div>

        {/* Current Outcome */}
        <p className="mt-1.5 text-[13px] font-black leading-snug text-stone-800">
          {data.outcome?.title ?? "Outcome未設定"}
        </p>

        {/* Current State — one number, never a task-completion percentage */}
        <div className="mt-2 flex items-baseline gap-1.5 rounded-xl bg-stone-800 px-2.5 py-1.5">
          <span className="text-[9px] font-bold text-white/50">{headline.label}</span>
          <span className="ml-auto tabular-nums text-[15px] font-black leading-none text-white">
            {headline.value}
          </span>
        </div>

        {/* Main Gap */}
        {mainGap && (
          <p className="mt-1.5 text-[11px] leading-snug text-stone-600">
            <span className="font-black text-stone-400">足りない：</span>
            {mainGap.title}
            <span className="ml-1 font-bold text-stone-300">{GAP_OWNER_LABEL[mainGap.owner]}</span>
          </p>
        )}

        {/* Next 1-3 with their time */}
        {data.next.length > 0 && (
          <ul className="mt-1.5 flex flex-col gap-0.5">
            {data.next.slice(0, 3).map(({ task, block }) => (
              <li key={task.id} className="flex gap-1.5 text-[11px] leading-snug">
                <span className="shrink-0 tabular-nums font-black text-accent-dark">
                  {block ? `${formatMd(block.date)} ${block.startTime}` : "時間未設定"}
                </span>
                <span className="min-w-0 flex-1 truncate text-stone-600">{task.title}</span>
              </li>
            ))}
          </ul>
        )}

        {/* 今日または次のTimeBlock */}
        {nextBlock && (
          <p className="mt-1.5 rounded-lg bg-accent-soft px-2 py-1 text-[10px] font-bold text-accent-dark">
            次の枠 {formatMd(nextBlock.block.date)}（
            {WEEKDAY[new Date(nextBlock.block.date + "T00:00:00").getDay()]}）{nextBlock.block.startTime}〜
            {nextBlock.block.endTime}・{nextBlock.taskTitle}
          </p>
        )}

        {/* Blocked / Risk */}
        {risks.length > 0 && (
          <p className="mt-1.5 line-clamp-2 text-[10px] leading-relaxed text-danger">⚠ {risks[0]}</p>
        )}
      </button>

      <Link
        href={`/area/${data.profile.slug}`}
        className="flex items-center justify-between border-t border-stone-100 px-4 py-2 text-[11px] font-bold text-stone-400"
      >
        Area Homeを開く
        <span>›</span>
      </Link>
    </div>
  );
}
