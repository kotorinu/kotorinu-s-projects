"use client";

import { useState } from "react";
import { computeVariance } from "@/lib/execution";
import type { Task } from "@/lib/types";

// 実績時間の修正 (2026-09-09, §28〜§32).
//
// これまでManualActualEntryはTask Detailの下の方にあり、見つけるには開いて
// スクロールする必要があった。計測を直せないと、PDCAの入力そのものが濁る。
//
// 大事なのは、Timerが測った生の値を消さないこと (§31):
//   計測 52分（Timerの実測 = rawTimerMinutes）
//   実績 60分（本人の補正 = manualActualOverride）
// 両方を持って、下流はすべて「実績」を使う。52分を上書き削除しない。

const PRESETS = [15, 30, 45, 60, 90, 120, 180];

export default function ActualMinutesDialog({
  task,
  /** Timerが実際に測った分数。補正しても消さない。 */
  timerMinutes,
  /** いま採用されている実績。未入力なら null。 */
  currentActual,
  onSave,
  onClear,
  onClose,
}: {
  task: Task;
  timerMinutes: number | null;
  currentActual: number | null;
  onSave: (minutes: number) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState<string>(currentActual !== null ? String(currentActual) : "");
  const parsed = Number.parseInt(value, 10);
  const valid = Number.isFinite(parsed) && parsed > 0 && parsed <= 24 * 60;
  const preview = valid ? computeVariance(task.estimateMinutes, parsed) : null;
  const corrected = valid && timerMinutes !== null && parsed !== timerMinutes;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center lg:items-center">
      <button
        type="button"
        aria-label="閉じる"
        onClick={onClose}
        className="absolute inset-0 bg-stone-900/45"
      />
      <div className="relative w-full max-w-[430px] rounded-t-3xl bg-white p-5 shadow-2xl lg:rounded-3xl">
        <p className="text-[11px] font-bold text-stone-400">実績時間</p>
        <p className="mt-0.5 line-clamp-2 text-[15px] font-black leading-snug text-stone-900">{task.title}</p>

        <dl className="mt-3 grid grid-cols-[4rem_1fr] gap-x-3 gap-y-1 text-[12px]">
          <dt className="text-stone-400">予定</dt>
          <dd className="tabular-nums font-bold text-stone-700">
            {task.estimateMinutes !== null ? `${task.estimateMinutes}分` : "未設定"}
          </dd>
          {timerMinutes !== null && (
            <>
              <dt className="text-stone-400">計測</dt>
              <dd className="tabular-nums font-bold text-stone-700">{timerMinutes}分</dd>
            </>
          )}
        </dl>

        <div className="mt-3">
          <p className="mb-1.5 text-[11px] font-bold text-stone-500">実際は何分かかりましたか？</p>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setValue(String(m))}
                className={`rounded-full px-3 py-1.5 text-[12px] font-bold ${
                  parsed === m ? "bg-accent text-white" : "bg-stone-100 text-stone-600"
                }`}
              >
                {m}分
              </button>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={1440}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="自由入力"
              className="w-28 rounded-lg border border-stone-200 px-2.5 py-1.5 text-[13px] tabular-nums text-stone-800"
            />
            <span className="text-[12px] text-stone-400">分</span>
          </div>
        </div>

        {preview && preview.varianceMinutes !== null && (
          <div className="mt-3 rounded-xl bg-stone-50 px-3 py-2.5">
            <p className="text-[12px] tabular-nums text-stone-700">
              予定 {task.estimateMinutes}分 → 実績 {parsed}分
            </p>
            <p className="mt-0.5 text-[13px] font-black tabular-nums text-stone-800">
              差 {preview.varianceMinutes >= 0 ? "+" : ""}
              {preview.varianceMinutes}分
              {preview.variancePercent !== null &&
                ` (${preview.variancePercent >= 0 ? "+" : ""}${preview.variancePercent}%)`}
            </p>
            {corrected && (
              <p className="mt-1 text-[10px] leading-relaxed text-stone-400">
                計測 {timerMinutes}分はそのまま残ります。実績は補正後の {parsed}分 として扱います。
              </p>
            )}
          </div>
        )}

        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            disabled={!valid}
            onClick={() => valid && onSave(parsed)}
            className="flex-1 rounded-full bg-accent px-4 py-2.5 text-[13px] font-bold text-white disabled:bg-stone-200 disabled:text-stone-400"
          >
            保存
          </button>
          <button type="button" onClick={onClose} className="rounded-full px-3 py-2.5 text-[12px] font-bold text-stone-400">
            キャンセル
          </button>
          {currentActual !== null && (
            <button
              type="button"
              onClick={onClear}
              className="rounded-full px-3 py-2.5 text-[12px] font-bold text-stone-400"
            >
              補正を消す
            </button>
          )}
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-stone-400">
          保存すると、完了記録・今日の集計・PDCAの実績がすべて同じ値になります。
        </p>
      </div>
    </div>
  );
}
