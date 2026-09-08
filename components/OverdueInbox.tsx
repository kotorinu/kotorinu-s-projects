"use client";

import { useState } from "react";
import { daysBetween, formatMd } from "@/lib/date";
import { buildCompletionRecord, effectiveDeadline } from "@/lib/taskState";
import { useTodayExecution } from "@/lib/todayExecutionStore";
import TaskCompleteDialog from "@/components/TaskCompleteDialog";
import RescheduleDialog from "@/components/RescheduleDialog";
import { useReschedule } from "@/lib/useReschedule";
import type { Task } from "@/lib/types";

// 期限超過 Inbox (2026-09-06 Execution Management round).
//
// Fixes the round's headline bug: overdue Tasks used to render as a
// read-only list, so a Task past its deadline could never be completed —
// and because completion only wrote a day-scoped `done` set while the
// overdue list read the immutable fixture status, completing it wouldn't
// have cleared it anyway. Every overdue Task now carries the full decision
// set, and completion writes a durable record (see lib/taskState.ts), so
// the Task actually leaves this list.
//
// Nothing here silently rewrites history: a late completion keeps
// originalDeadline and records the delay, and やめる is a recorded
// DROPPED decision rather than a delete.
export default function OverdueInbox({ tasks, today }: { tasks: Task[]; today: string }) {
  const {
    taskStartedAt,
    deadlineOverrides,
    dispositions,
    completeTask,
    setTaskDisposition,
    setDeadlineOverride,
    recordCarryover,
  } = useTodayExecution();

  const [completingTask, setCompletingTask] = useState<Task | null>(null);
  const [reschedulingTask, setReschedulingTask] = useState<Task | null>(null);
  const { reschedule, currentBlockFor } = useReschedule();
  const [dateOpenTaskId, setDateOpenTaskId] = useState<string | null>(null);
  const [dateValue, setDateValue] = useState("");

  function complete(task: Task, metDefinitionOfDone: boolean) {
    completeTask(
      buildCompletionRecord(task, {
        today,
        startedIso: taskStartedAt.get(task.id),
        metDefinitionOfDone,
        deadlineOverrides,
      })
    );
    setCompletingTask(null);
  }

  // "今日やる" / "別日に移す" re-place the Task's work date without touching
  // its deadline — the deadline stays the (missed) commitment it was.
  function moveWorkDate(task: Task, date: string) {
    recordCarryover(
      effectiveDeadline(task, { deadlineOverrides }) ?? today,
      task.id,
      date === today ? "MOVED_TODAY" : "RESCHEDULED",
      date
    );
    closeDatePicker();
  }

  function closeDatePicker() {
    setDateOpenTaskId(null);
    setDateValue("");
  }

  function block(task: Task) {
    setTaskDisposition(
      {
        taskId: task.id,
        disposition: "BLOCKED",
        decidedOnDate: today,
        decidedAt: new Date().toISOString(),
        note: null,
      },
      task.id
    );
    setCompletingTask(null);
  }

  function drop(task: Task) {
    setTaskDisposition(
      {
        taskId: task.id,
        disposition: "DROPPED",
        decidedOnDate: today,
        decidedAt: new Date().toISOString(),
        note: null,
      },
      task.id
    );
    setCompletingTask(null);
  }

  if (tasks.length === 0) return null;

  return (
    <div className="rounded-2xl bg-white px-4 py-3 shadow-sm">
      <p className="text-xs font-bold text-danger">
        ⚠ 期限超過 <span className="text-stone-800">{tasks.length}件</span>・行き先を決める
      </p>
      <ul className="mt-2 flex flex-col gap-2">
        {tasks.map((t) => {
          const deadline = effectiveDeadline(t, { deadlineOverrides });
          const daysLate = deadline ? -daysBetween(today, deadline) : null;
          // A blocked Task is still overdue — it stays in this list, but it
          // has been triaged, so it says so instead of looking untouched.
          const blocked = dispositions[t.id]?.disposition === "BLOCKED";
          return (
            <li key={t.id} className="rounded-xl bg-danger-soft/50 px-3 py-2.5">
              <div className="flex items-baseline justify-between gap-2">
                <p className="truncate text-[13px] font-bold text-stone-700">{t.title}</p>
                <span className="shrink-0 text-[10px] font-bold text-danger">
                  期限 {formatMd(deadline)}
                  {daysLate !== null && daysLate > 0 ? `・${daysLate}日超過` : ""}
                </span>
              </div>
              {blocked && (
                <p className="mt-1 inline-block rounded-full bg-stone-800 px-2 py-0.5 text-[10px] font-bold text-white">
                  Blocked（進められない）として記録済み
                </p>
              )}
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setCompletingTask(t)}
                  className="rounded-full bg-accent px-3 py-1 text-[11px] font-bold text-white"
                >
                  完了
                </button>
                <button
                  type="button"
                  onClick={() => moveWorkDate(t, today)}
                  className="rounded-full bg-stone-100 px-3 py-1 text-[11px] font-bold text-stone-600"
                >
                  今日やる
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDateOpenTaskId(dateOpenTaskId === t.id ? null : t.id);
                    setDateValue("");
                  }}
                  className="rounded-full bg-stone-100 px-3 py-1 text-[11px] font-bold text-stone-600"
                >
                  日付を指定
                </button>
                <button
                  type="button"
                  onClick={() => (blocked ? setTaskDisposition(null, t.id) : block(t))}
                  className={`rounded-full px-3 py-1 text-[11px] font-bold ${
                    blocked ? "bg-stone-800 text-white" : "bg-stone-100 text-stone-500"
                  }`}
                >
                  {blocked ? "Blocked解除" : "Blocked"}
                </button>
                <button
                  type="button"
                  onClick={() => drop(t)}
                  className="rounded-full bg-stone-100 px-3 py-1 text-[11px] font-bold text-stone-400"
                >
                  やめる
                </button>
              </div>

              {dateOpenTaskId === t.id && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <input
                    type="date"
                    value={dateValue}
                    onChange={(e) => setDateValue(e.target.value)}
                    className="rounded-lg border border-stone-200 px-2 py-1 text-[12px] text-stone-700"
                  />
                  <button
                    type="button"
                    disabled={!dateValue}
                    onClick={() => moveWorkDate(t, dateValue)}
                    className={`rounded-full px-3 py-1 text-[11px] font-bold ${
                      dateValue ? "bg-accent text-white" : "bg-stone-100 text-stone-300"
                    }`}
                  >
                    この日にやる
                  </button>
                  <button
                    type="button"
                    disabled={!dateValue}
                    onClick={() => {
                      setDeadlineOverride(t.id, dateValue);
                      closeDatePicker();
                    }}
                    className={`rounded-full px-3 py-1 text-[11px] font-bold ${
                      dateValue ? "bg-stone-800 text-white" : "bg-stone-100 text-stone-300"
                    }`}
                  >
                    期限を再設定
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[10px] leading-relaxed text-stone-400">
        期限超過は状態ではなく「期限 &lt; 今日 かつ 未完了」という計算結果です。完了すればこの一覧から消えますが、元の期限と遅延日数は実績として残ります。
      </p>

      {reschedulingTask && (
        <RescheduleDialog
          task={reschedulingTask}
          currentBlock={currentBlockFor(reschedulingTask)}
          today={today}
          effectiveDeadline={effectiveDeadline(reschedulingTask, { deadlineOverrides })}
          onCancel={() => setReschedulingTask(null)}
          onConfirm={(args) => {
            reschedule(reschedulingTask, { ...args, reason: "期限超過Taskを別日へ移動" });
            setReschedulingTask(null);
          }}
        />
      )}

      {completingTask && (
        <TaskCompleteDialog
          task={completingTask}
          deadlineAtCompletion={effectiveDeadline(completingTask, { deadlineOverrides })}
          today={today}
          onCompleteMetDoD={() => complete(completingTask, true)}
          onCompleteNoDoD={() => complete(completingTask, false)}
          onRequestReschedule={() => {
            setReschedulingTask(completingTask);
            setCompletingTask(null);
          }}
          onBlock={() => block(completingTask)}
          onDrop={() => drop(completingTask)}
          onCancel={() => setCompletingTask(null)}
        />
      )}
    </div>
  );
}
