"use client";

import { useMemo } from "react";
import { liveReplan, replanChanges, replanOverruns } from "@/lib/calendarAuthority";
import type { TimeBlock } from "@/lib/types";

// 実行順が変わったら、Calendarを現実に合わせる (2026-09-09, §5/§6).
//
// 19:00 に Sales の予定で RIALA を先に始めたなら、Calendar は
// 19:00-19:30 RIALA / 19:30-21:30 Sales でなければならない。元の予定を
// 「やったことになっている」まま残すと、翌朝Calendarを見た自分が嘘を読む。
//
// このアプリはCalendarへ書き込めないので、ここが出すのは**指示**であって
// 完了報告ではない。だから状態は必ず「反映待ち」と書く。

export interface CalendarSyncStripProps {
  /** 今日のライブな実行枠（Calendar順）。 */
  todayBlocks: TimeBlock[];
  /** いま実行中のTask。null なら実行順の再計算はしない。 */
  startedTaskId: string | null;
  /** 実行を始めた時刻 "HH:mm"。 */
  startedAtHm: string | null;
  /** そのTaskにこれまで積んだ分数。まだ短ければ枠の長さを使う。 */
  startedMinutes: number;
}

function blockMinutes(b: Pick<TimeBlock, "startTime" | "endTime">): number {
  const [sh, sm] = b.startTime.split(":").map(Number);
  const [eh, em] = b.endTime.split(":").map(Number);
  return eh * 60 + em - (sh * 60 + sm);
}

export default function CalendarSyncStrip({
  todayBlocks,
  startedTaskId,
  startedAtHm,
  startedMinutes,
}: CalendarSyncStripProps) {
  // §6: Calendarに枠が無い今日の予定＝反映待ち。
  const pendingSync = useMemo(
    () => todayBlocks.filter((b) => b.lifecycle === "ACTIVE" && b.calendarEventId === null),
    [todayBlocks]
  );

  // §5: 予定と違う順番で始めた場合の、Calendarのあるべき姿。
  const { replan, overruns } = useMemo(() => {
    if (startedTaskId === null || startedAtHm === null) return { replan: [], overruns: false };
    const own = todayBlocks.find((b) => b.taskId === startedTaskId);
    if (!own) return { replan: [], overruns: false };
    // まだ実行中なら、その枠の予定分数をそのまま使う。実際にかかる時間は
    // まだ分からないので、勝手に短くも長くもしない。
    const minutes = Math.max(startedMinutes, blockMinutes(own));
    const slots = liveReplan({
      blocks: todayBlocks.filter((b) => b.lifecycle === "ACTIVE"),
      startedTaskId,
      actualStart: startedAtHm,
      actualMinutes: minutes,
    });
    return { replan: replanChanges(slots), overruns: replanOverruns(slots) };
  }, [todayBlocks, startedTaskId, startedAtHm, startedMinutes]);

  if (replan.length === 0 && pendingSync.length === 0) return null;

  return (
    <section className="mx-5 mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3.5 py-3">
      <div className="flex items-baseline gap-2">
        <p className="text-[12px] font-black text-amber-900">Calendar反映待ち</p>
        <span className="rounded-full bg-amber-200 px-1.5 py-0.5 text-[9px] font-black text-amber-900">
          NEEDS_CALENDAR_SYNC
        </span>
      </div>

      {replan.length > 0 && (
        <div className="mt-2">
          <p className="text-[11px] font-bold text-amber-900">実行順が予定と変わりました</p>
          <p className="mt-0.5 text-[10px] leading-relaxed text-amber-800">
            実際に始めた順にCalendarを直します。所要時間は変えず、開始時刻だけ詰め直しています。
          </p>
          <ul className="mt-1.5 flex flex-col gap-1">
            {replan.map((slot) => (
              <li key={slot.blockId} className="rounded-lg bg-white/70 px-2.5 py-1.5">
                <p className="text-[11px] font-bold text-stone-800">{slot.label}</p>
                <p className="mt-0.5 flex items-center gap-1.5 text-[11px] tabular-nums">
                  <span className="text-stone-400 line-through">
                    {slot.from.startTime}〜{slot.from.endTime}
                  </span>
                  <span className="text-stone-300">→</span>
                  <span className="font-bold text-amber-900">
                    {slot.to.startTime}〜{slot.to.endTime}
                  </span>
                </p>
              </li>
            ))}
          </ul>
          {overruns && (
            <p className="mt-1.5 rounded-lg bg-white/70 px-2.5 py-1.5 text-[10px] leading-relaxed text-rose-800">
              この順番だと、今日の予定の終わりを越えます。所要時間は変えていないので、
              どれかを短くするか別日へ移す判断が要ります。
            </p>
          )}
        </div>
      )}

      {pendingSync.length > 0 && (
        <div className="mt-2">
          <p className="text-[11px] font-bold text-amber-900">Calendarに枠が無い予定</p>
          <ul className="mt-1 flex flex-col gap-0.5">
            {pendingSync.map((b) => (
              <li key={b.id} className="text-[11px] leading-snug text-amber-900">
                ・{b.label}（{b.startTime}〜{b.endTime}）
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-2 text-[10px] leading-relaxed text-amber-800">
        このアプリからCalendarへは書き込めません。手動、またはCalendar接続のあるセッションから反映してください。
        反映後、次回の照合で一致が確認できます。
      </p>
    </section>
  );
}
