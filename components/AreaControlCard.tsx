"use client";

import { daysBetween, formatMd } from "@/lib/date";
import { AREA_THEME } from "@/lib/areaTheme";
import { GAP_OWNER_LABEL, type ResolvedGap } from "@/lib/gapBoard";
import type { AreaHomeData } from "@/lib/areaHome";
import type { TimeBlock } from "@/lib/types";

const WEEKDAY = ["日", "月", "火", "水", "木", "金", "土"];

// Area Control Card (2026-09-08 第5ラウンド, §15).
//
// Three cards, one layout, one height. Everything on the face is a state, not
// prose: the earlier version led with paragraphs and the areas were
// indistinguishable at a glance.
//
// Colour carries the identity (§4): a tinted header strip and a left rule in
// the Area's hue, matching TODAY, Area Home and — once it exists — Google
// Calendar. No large dark fills (§8).
export default function AreaControlCard({
  data,
  today,
  headline,
  mainGap,
  nextBlock,
  riskCount,
  selected,
  onSelect,
}: {
  data: AreaHomeData;
  today: string;
  headline: { label: string; value: string; note?: string };
  mainGap: ResolvedGap | null;
  nextBlock: { block: TimeBlock; taskTitle: string } | null;
  riskCount: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const theme = AREA_THEME[data.profile.area];
  const daysLeft = data.outcome?.deadline != null ? daysBetween(today, data.outcome.deadline) : null;
  const overdue = daysLeft !== null && daysLeft < 0;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex h-full w-full flex-col overflow-hidden rounded-2xl border bg-white text-left transition-all duration-200 ${
        selected ? "shadow-md" : "shadow-sm hover:shadow-md"
      }`}
      style={{
        borderColor: selected ? theme.primary : "#EAE8E6",
        borderLeftWidth: 3,
        borderLeftColor: theme.primary,
      }}
    >
      {/* Header strip — the Area's colour, kept light (§8) */}
      <div className="flex items-baseline justify-between gap-2 px-3.5 py-2" style={{ backgroundColor: theme.soft }}>
        <span className="text-[12px] font-black tracking-wide" style={{ color: theme.text }}>
          {theme.label}
        </span>
        {data.outcome?.deadline && (
          <span
            className={`shrink-0 text-[11px] font-bold ${overdue ? "text-danger" : ""}`}
            style={overdue ? undefined : { color: theme.text }}
          >
            {formatMd(data.outcome.deadline)}
            {daysLeft !== null && (daysLeft >= 0 ? `・あと${daysLeft}日` : `・${-daysLeft}日超過`)}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 px-3.5 py-3">
        {/* Current Outcome — two lines max */}
        <p className="line-clamp-2 text-[13px] font-bold leading-snug text-stone-800">
          {data.outcome?.title ?? "Outcome未設定"}
        </p>

        {/* Headline metric */}
        <div className="flex items-baseline gap-2 border-y border-stone-100 py-2">
          <span className="text-[11px] text-stone-400">{headline.label}</span>
          <span className="ml-auto tabular-nums text-[20px] font-black leading-none" style={{ color: theme.text }}>
            {headline.value}
          </span>
        </div>

        {/* Main Gap */}
        {mainGap && (
          <p className="line-clamp-1 text-[11px] text-stone-500">
            <span className="font-bold text-stone-400">足りない　</span>
            {mainGap.title}
            <span className="ml-1 text-stone-300">{GAP_OWNER_LABEL[mainGap.owner]}</span>
          </p>
        )}

        {/* NEXT — max 2 (§15) */}
        <ul className="flex flex-col gap-1">
          {data.next.slice(0, 2).map(({ task, block }) => (
            <li key={task.id} className="flex items-baseline gap-1.5 text-[11px] leading-snug">
              <span className="shrink-0 tabular-nums font-bold" style={{ color: theme.primary }}>
                {block ? `${formatMd(block.date)} ${block.startTime}` : "時間未設定"}
              </span>
              <span className="min-w-0 flex-1 truncate text-stone-600">{task.title}</span>
            </li>
          ))}
          {data.next.length === 0 && <li className="text-[11px] text-stone-300">実行中の予定はありません</li>}
        </ul>

        {/* 次のTimeBlock — pinned to the bottom so all three cards align */}
        <div className="mt-auto pt-1">
          {nextBlock ? (
            <p
              className="truncate rounded-lg px-2 py-1.5 text-[10px] font-bold"
              style={{ backgroundColor: theme.soft, color: theme.text }}
            >
              次の枠 {formatMd(nextBlock.block.date)}（
              {WEEKDAY[new Date(nextBlock.block.date + "T00:00:00").getDay()]}）{nextBlock.block.startTime}〜
              {nextBlock.block.endTime}
            </p>
          ) : (
            <p className="rounded-lg bg-stone-50 px-2 py-1.5 text-[10px] font-bold text-stone-300">
              次の枠は未設定
            </p>
          )}
          {riskCount > 0 && (
            <p className="mt-1 text-[10px] font-bold text-stone-400">気になっていること {riskCount}件</p>
          )}
        </div>
      </div>
    </button>
  );
}
