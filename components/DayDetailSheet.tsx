"use client";

import { useEffect } from "react";
import { fixedCalendarEvents, recurringRules, tasks as allTasks } from "@/lib/dummy-data";
import { liveTimeBlocks } from "@/lib/livePlan";
import { formatMd } from "@/lib/date";
import { findOverlaps } from "@/lib/overlap";
import { effectiveDeadline, effectiveWorkDate, isTaskDone, isTaskOpen } from "@/lib/taskState";
import { useTodayExecution } from "@/lib/todayExecutionStore";
import type { Task } from "@/lib/types";

const WEEKDAY_LABEL = ["日", "月", "火", "水", "木", "金", "土"];

// Day Detail (2026-09-06, §7): tapping a day in the Week View opens the
// whole day — every TimeBlock in time order with its Task, DoD and planned
// duration, plus Tasks assigned to that day with no time set yet. This is
// what answers "明日は何を、何時から、どこまでやるのか" without opening
// each Task one at a time.
export default function DayDetailSheet({
  date,
  onClose,
  onOpenTask,
}: {
  date: string;
  onClose: () => void;
  onOpenTask: (task: Task) => void;
}) {
  const {
    completions,
    dispositions,
    deadlineOverrides,
    workDateOverrides,
    lifecycleOverrides,
    timeBlockOverrides,
    supersededBlockIds,
  } = useTodayExecution();
  const overlays = { completions, dispositions, deadlineOverrides, workDateOverrides, lifecycleOverrides };
  // §19/§20: the same live plan TODAY and TASK MAP use — a rescheduled block
  // has to leave the old day's detail and appear on the new one.
  const planBlocks = liveTimeBlocks({ timeBlockOverrides, supersededBlockIds });

  useEffect(() => {
    const mainEl = document.querySelector("main");
    const prev = mainEl?.style.overflow;
    if (mainEl) mainEl.style.overflow = "hidden";
    return () => {
      if (mainEl) mainEl.style.overflow = prev ?? "";
    };
  }, []);

  const dayBlocks = planBlocks
    .filter((tb) => tb.date === date)
    .sort((a, b) => (a.startTime < b.startTime ? -1 : a.startTime > b.startTime ? 1 : 0));
  const overlaps = findOverlaps(dayBlocks);
  const overlappingIds = new Set(overlaps.flatMap((o) => [o.a.id, o.b.id]));

  const scheduledTaskIds = new Set(dayBlocks.map((tb) => tb.taskId).filter((id): id is string => id !== null));
  // Assigned to this day but with no time block yet — the "いつやるか未定"
  // half of the day that would otherwise be invisible.
  const untimedTasks = allTasks.filter(
    (t) => isTaskOpen(t, overlays) && !scheduledTaskIds.has(t.id) && effectiveWorkDate(t, overlays) === date
  );

  const dayFixedEvents = fixedCalendarEvents.filter((e) => e.startDate <= date && e.endDate >= date);
  const weekday = WEEKDAY_LABEL[new Date(date + "T00:00:00").getDay()];
  const plannedMinutes = dayBlocks.reduce((sum, tb) => {
    const [sh, sm] = tb.startTime.split(":").map(Number);
    const [eh, em] = tb.endTime.split(":").map(Number);
    return sum + (eh * 60 + em - (sh * 60 + sm));
  }, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center lg:items-stretch lg:justify-end">
      <button type="button" aria-label="閉じる" onClick={onClose} className="absolute inset-0 bg-stone-900/45" />

      <div className="relative flex max-h-[85dvh] w-full max-w-[430px] flex-col rounded-t-3xl bg-white shadow-2xl lg:h-full lg:max-h-none lg:w-[480px] lg:max-w-[480px] lg:rounded-none lg:rounded-l-3xl">
        <div className="flex shrink-0 justify-center pt-2.5 lg:hidden">
          <span className="h-1 w-9 rounded-full bg-stone-200" />
        </div>

        <div className="shrink-0 px-5 pb-3 pt-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[17px] font-black leading-snug text-stone-900">
                {formatMd(date)}（{weekday}）
              </p>
              <p className="mt-1 text-[11px] font-bold text-stone-400">
                予定{dayBlocks.length}件
                {plannedMinutes > 0 && `・計${Math.floor(plannedMinutes / 60)}時間${plannedMinutes % 60 || ""}${plannedMinutes % 60 ? "分" : ""}`}
                {untimedTasks.length > 0 && `・時間未定${untimedTasks.length}件`}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="閉じる"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-stone-100 text-sm text-stone-400"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-[max(2rem,env(safe-area-inset-bottom))]">
          {overlaps.length > 0 && (
            <div className="mb-3 rounded-2xl bg-danger-soft px-3.5 py-3">
              <p className="text-[12px] font-bold text-danger">⚠ 予定が重複しています（{overlaps.length}件）</p>
              <ul className="mt-1 flex flex-col gap-0.5">
                {overlaps.map((o, i) => (
                  <li key={i} className="text-[11px] leading-relaxed text-stone-600">
                    「{o.a.label}」({o.a.startTime}〜{o.a.endTime}) と「{o.b.label}」({o.b.startTime}〜{o.b.endTime}) が
                    {o.overlapMinutes}分重なっています
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-[10px] text-stone-500">
                どちらかを短縮／後ろへ移動／別日へ移す必要があります（自動では動かしません）。
              </p>
            </div>
          )}

          {dayFixedEvents.length > 0 && (
            <p className="mb-2.5 text-[11px] font-bold text-stone-400">
              固定予定：{dayFixedEvents.map((e) => e.title).join("・")}
            </p>
          )}

          {dayBlocks.length === 0 && untimedTasks.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-stone-200 px-4 py-8 text-center text-xs text-stone-400">
              この日の予定はまだありません
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {dayBlocks.map((tb) => {
                const task = tb.taskId ? allTasks.find((t) => t.id === tb.taskId) ?? null : null;
                const rule = tb.recurringRuleId
                  ? recurringRules.find((r) => r.id === tb.recurringRuleId) ?? null
                  : null;
                const conflicted = overlappingIds.has(tb.id);
                const doneAlready = task ? isTaskDone(task, overlays) : false;
                return (
                  <li
                    key={tb.id}
                    className={`rounded-2xl px-3.5 py-3 ${conflicted ? "bg-danger-soft/60 ring-1 ring-danger" : "bg-stone-50"}`}
                    style={{ opacity: doneAlready ? 0.6 : 1 }}
                  >
                    <p className="tabular-nums text-[11px] font-bold text-stone-500">
                      {tb.startTime}〜{tb.endTime}
                      {conflicted && <span className="ml-1.5 text-danger">重複</span>}
                    </p>
                    {task ? (
                      <button type="button" onClick={() => onOpenTask(task)} className="mt-0.5 w-full text-left">
                        <p className={`text-[14px] font-bold ${doneAlready ? "text-stone-400 line-through" : "text-stone-800"}`}>
                          {task.title}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px]">
                          <span className="rounded-full bg-white px-1.5 py-0.5 font-bold text-stone-500">{task.area}</span>
                          {task.estimateMinutes !== null && (
                            <span className="font-bold text-stone-400">予定{task.estimateMinutes}分</span>
                          )}
                          <span className="font-bold text-stone-400">
                            期限 {formatMd(effectiveDeadline(task, overlays))}
                          </span>
                        </div>
                        {task.definitionOfDone.length > 0 && (
                          <p className="mt-1 text-[10px] leading-relaxed text-stone-500">
                            達成基準：{task.definitionOfDone[0]}
                          </p>
                        )}
                      </button>
                    ) : (
                      <p className="mt-0.5 text-[13px] font-bold text-stone-600">{rule ? rule.title : tb.label}</p>
                    )}
                  </li>
                );
              })}

              {untimedTasks.length > 0 && (
                <li className="mt-1">
                  <p className="mb-1.5 text-[10px] font-black tracking-widest text-stone-400">
                    時間未定（{untimedTasks.length}）
                  </p>
                  <ul className="flex flex-col gap-1.5">
                    {untimedTasks.map((t) => (
                      <li key={t.id}>
                        <button
                          type="button"
                          onClick={() => onOpenTask(t)}
                          className="w-full rounded-xl bg-stone-50 px-3 py-2 text-left"
                        >
                          <p className="text-[13px] font-bold text-stone-700">{t.title}</p>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px]">
                            <span className="rounded-full bg-white px-1.5 py-0.5 font-bold text-stone-500">{t.area}</span>
                            {t.estimateMinutes !== null && (
                              <span className="font-bold text-stone-400">予定{t.estimateMinutes}分</span>
                            )}
                            <span className="font-bold text-stone-400">
                              期限 {formatMd(effectiveDeadline(t, overlays))}
                            </span>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                </li>
              )}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
