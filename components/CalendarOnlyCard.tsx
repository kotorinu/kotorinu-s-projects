"use client";

import { useState } from "react";
import { ROLE_LABEL, themeForCalendarColorId, type DayEntry } from "@/lib/calendarDay";

// Calendarにだけある予定 (2026-09-09, §3/§4).
//
// 営業実践クラス、面談、契約手続き、移動。どれも「やること」だが、成果物を
// 持つTaskではない。だからTaskカードにはせず、そのために偽Taskも作らない。
//
// 出すのは Calendarが持っている情報だけ: 時間 / 色 / 予定名 / NOW・NEXT、
// あれば説明文。**DoD・Why・Outcomeを勝手に作らない** — それらはOSが持つもの
// で、この予定にはまだ無い。

const STATUS_LABEL: Record<string, string> = { NOW: "NOW", NEXT: "NEXT", PAST: "", LATER: "" };

export default function CalendarOnlyCard({ entry }: { entry: DayEntry }) {
  const [descOpen, setDescOpen] = useState(false);
  const theme = themeForCalendarColorId(entry.colorId);
  const isPast = entry.status === "PAST";
  const isNow = entry.status === "NOW";
  const hasDescription = entry.description !== null && entry.description.trim() !== "";

  return (
    <li
      className="rounded-2xl border bg-white px-3.5 py-3"
      style={{
        borderTopColor: isNow && theme ? theme.primary : "#EAE8E6",
        borderRightColor: isNow && theme ? theme.primary : "#EAE8E6",
        borderBottomColor: isNow && theme ? theme.primary : "#EAE8E6",
        borderLeftWidth: 3,
        borderLeftColor: theme?.primary ?? "#D6D3D1",
        opacity: isPast ? 0.55 : 1,
      }}
    >
      <div className="flex items-baseline gap-1.5 text-[11px] font-bold text-stone-400">
        <span className="tabular-nums">
          {entry.startTime}〜{entry.endTime}
        </span>
        {STATUS_LABEL[entry.status] && (
          <span style={isNow && theme ? { color: theme.text } : undefined} className={isNow ? "" : "text-stone-400"}>
            {STATUS_LABEL[entry.status]}
          </span>
        )}
        <span className="ml-auto rounded-full bg-stone-100 px-1.5 py-0.5 text-[9px] text-stone-400">
          {ROLE_LABEL[entry.role]}
        </span>
      </div>

      <p className="mt-0.5 text-[15px] font-bold leading-snug text-stone-800">{entry.title}</p>

      {theme && (
        <span
          className="mt-1.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-bold"
          style={{ backgroundColor: theme.soft, color: theme.text }}
        >
          {theme.label}
        </span>
      )}

      {hasDescription && (
        <div className="mt-1.5">
          <button
            type="button"
            onClick={() => setDescOpen((v) => !v)}
            className="text-[10px] font-bold text-stone-400"
          >
            {descOpen ? "Calendarのメモを閉じる" : "Calendarのメモを見る"}
          </button>
          {descOpen && (
            <p className="mt-1 whitespace-pre-line rounded-lg bg-stone-50 px-2.5 py-2 text-[11px] leading-relaxed text-stone-600">
              {stripHtml(entry.description as string)}
            </p>
          )}
        </div>
      )}
    </li>
  );
}

/** Calendarの説明はHTML片で来ることがある。表示のためだけに素朴に落とす。 */
function stripHtml(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .trim();
}
