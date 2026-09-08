"use client";

import { useState } from "react";
import { computeVariance } from "@/lib/execution";
import type { Task } from "@/lib/types";

// 実績時間の手動入力 (2026-09-08).
//
// The timer only records a span if 開始 was pressed and 完了 was pressed, and
// the user forgets — which means the estimate-vs-actual data the whole
// improvement loop depends on quietly stops accumulating. This lets the real
// figure be typed in afterwards.
//
// A typed value is still a real measurement (the user knows how long it took);
// what it is NOT is a timer reading, so it is recorded as manual and shown as
// such. Nothing is guessed on the user's behalf: no default, no "roughly the
// estimate", and leaving it blank stays blank.
const PRESETS = [15, 30, 45, 60, 90, 120, 150, 180];

export default function ManualActualEntry({
  task,
  actualMinutes,
  isManual,
  onSave,
  onClear,
}: {
  task: Task;
  actualMinutes: number | null;
  isManual: boolean;
  onSave: (minutes: number) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");

  const parsed = Number.parseInt(value, 10);
  const valid = Number.isFinite(parsed) && parsed > 0 && parsed <= 24 * 60;
  const preview = valid ? computeVariance(task.estimateMinutes, parsed) : null;

  function save(minutes: number) {
    onSave(minutes);
    setValue("");
    setOpen(false);
  }

  return (
    <div className="mt-2">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-full bg-stone-100 px-3 py-1.5 text-[11px] font-bold text-stone-600"
        >
          {actualMinutes === null ? "実績時間を手入力する" : "実績時間を修正する"}
        </button>
      ) : (
        <div className="rounded-2xl bg-stone-50 px-3.5 py-3">
          <p className="text-[11px] font-bold text-stone-500">実際にかかった時間（分）</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {PRESETS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => save(m)}
                className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-stone-600 shadow-sm"
              >
                {m}分
              </button>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-1.5">
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={1440}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="分"
              className="w-20 rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-[13px] text-stone-700"
            />
            <button
              type="button"
              disabled={!valid}
              onClick={() => save(parsed)}
              className={`rounded-full px-3 py-1.5 text-[11px] font-bold ${
                valid ? "bg-accent text-white" : "bg-stone-100 text-stone-300"
              }`}
            >
              記録する
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setValue("");
              }}
              className="rounded-full px-3 py-1.5 text-[11px] font-bold text-stone-400"
            >
              キャンセル
            </button>
          </div>
          {preview?.varianceMinutes !== null && preview !== null && task.estimateMinutes !== null && (
            <p className="mt-1.5 text-[10px] font-bold text-stone-400">
              見積 {task.estimateMinutes}分 → 差分 {preview.varianceMinutes > 0 ? "+" : ""}
              {preview.varianceMinutes}分
            </p>
          )}
          {actualMinutes !== null && (
            <button
              type="button"
              onClick={() => {
                onClear();
                setOpen(false);
              }}
              className="mt-2 text-[10px] font-bold text-stone-400 underline"
            >
              記録を取り消す
            </button>
          )}
        </div>
      )}
      {actualMinutes !== null && isManual && (
        <p className="mt-1 text-[10px] font-bold text-stone-400">実績 {actualMinutes}分（手入力）</p>
      )}
    </div>
  );
}
