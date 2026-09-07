"use client";

import { useState } from "react";
import { formatMd } from "@/lib/date";
import type { Task } from "@/lib/types";

// Completion confirmation (2026-09-06 Execution Management round).
//
// Two deliberately different outcomes:
//  - 達成基準を満たして完了 → a real completion (DONE).
//  - 未達のまま終了       → NOT done. The Task goes to a re-plan / Blocked /
//                           やめる decision instead, so "I stopped working on
//                           it" is never silently recorded as "finished".
//
// The DoD is shown before completing so "やったかどうか判断できない" has an
// explicit answer at the moment of completion, not a vague memory later.
export default function TaskCompleteDialog({
  task,
  deadlineAtCompletion,
  today,
  onCompleteMetDoD,
  onCompleteNoDoD,
  onReschedule,
  onBlock,
  onDrop,
  onCancel,
}: {
  task: Task;
  deadlineAtCompletion: string | null;
  today: string;
  /** DoD existed and the user confirmed it. */
  onCompleteMetDoD: () => void;
  /** Task has no DoD to confirm — completed without a bar to check. */
  onCompleteNoDoD: () => void;
  onReschedule: (date: string) => void;
  onBlock: () => void;
  onDrop: () => void;
  onCancel: () => void;
}) {
  const [unmetOpen, setUnmetOpen] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const hasDoD = task.definitionOfDone.length > 0;
  const late =
    deadlineAtCompletion !== null && deadlineAtCompletion < today ? deadlineAtCompletion : null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center lg:items-center">
      <button type="button" aria-label="閉じる" onClick={onCancel} className="absolute inset-0 bg-stone-900/45" />

      <div className="relative w-full max-w-[430px] rounded-t-3xl bg-white p-5 shadow-2xl lg:rounded-3xl">
        <p className="text-[11px] font-black tracking-wide text-stone-400">完了しますか？</p>
        <p className="mt-1 text-[15px] font-black leading-snug text-stone-900">{task.title}</p>

        {late && (
          <p className="mt-2 rounded-xl bg-stone-100 px-3 py-2 text-[11px] font-bold text-stone-600">
            期限 {formatMd(late)} を過ぎています。完了しても「期限内に完了」にはせず、遅延日数を実績として記録します。
          </p>
        )}

        {hasDoD ? (
          <div className="mt-3 rounded-2xl bg-stone-50 px-3.5 py-3">
            <h3 className="mb-1 text-[11px] font-black tracking-wide text-stone-400">■ 達成基準</h3>
            <ul className="flex flex-col gap-1">
              {task.definitionOfDone.map((d, i) => (
                <li key={i} className="flex items-start gap-1.5 text-[13px] leading-relaxed text-stone-700">
                  <span className="mt-0.5 text-accent-dark">✓</span>
                  {d}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="mt-3 rounded-2xl bg-stone-50 px-3.5 py-3 text-[12px] leading-relaxed text-stone-500">
            このTaskには達成基準が設定されていません。完了はできますが、「基準を満たした」という記録は残りません。
          </p>
        )}

        {!unmetOpen ? (
          <div className="mt-4 flex flex-col gap-2">
            <button
              type="button"
              onClick={hasDoD ? onCompleteMetDoD : onCompleteNoDoD}
              className="w-full rounded-full bg-accent py-2.5 text-[13px] font-bold text-white active:scale-[0.98]"
            >
              {hasDoD ? "達成基準を満たして完了" : "完了にする"}
            </button>
            <button
              type="button"
              onClick={() => setUnmetOpen(true)}
              className="w-full rounded-full bg-stone-100 py-2.5 text-[13px] font-bold text-stone-600"
            >
              未達のまま終了…
            </button>
            <button type="button" onClick={onCancel} className="w-full py-1 text-[12px] font-bold text-stone-400">
              キャンセル
            </button>
          </div>
        ) : (
          <div className="mt-4">
            <p className="mb-2 text-[11px] font-bold text-stone-500">
              未達のまま完了にはしません。次の扱いを選んでください。
            </p>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={rescheduleDate}
                  min={today}
                  onChange={(e) => setRescheduleDate(e.target.value)}
                  className="min-w-0 flex-1 rounded-lg border border-stone-200 px-2 py-1.5 text-[12px] text-stone-700"
                />
                <button
                  type="button"
                  disabled={!rescheduleDate}
                  onClick={() => onReschedule(rescheduleDate)}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-[12px] font-bold ${
                    rescheduleDate ? "bg-accent text-white" : "bg-stone-100 text-stone-300"
                  }`}
                >
                  この日にやる
                </button>
              </div>
              <button
                type="button"
                onClick={onBlock}
                className="w-full rounded-full bg-stone-100 py-2 text-[13px] font-bold text-stone-600"
              >
                Blocked（進められない）
              </button>
              <button
                type="button"
                onClick={onDrop}
                className="w-full rounded-full bg-stone-100 py-2 text-[13px] font-bold text-stone-500"
              >
                今回はやめる
              </button>
              <button
                type="button"
                onClick={() => setUnmetOpen(false)}
                className="w-full py-1 text-[12px] font-bold text-stone-400"
              >
                戻る
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
