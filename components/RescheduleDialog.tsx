"use client";

import { useState } from "react";
import { addDaysToYmd, formatMd } from "@/lib/date";
import { deadlineRisk } from "@/lib/replan";
import type { Task, TimeBlock } from "@/lib/types";

// 予定を変更 (2026-09-08, §10/§11).
//
// Moving work never ends at a date. An ACTIVE Task is a commitment to a
// date AND a time — leaving the time open is how "今日やるのに時間未定" came
// back last time — so start/end are required before this can be confirmed.
//
// If the new date lands past the deadline, that is said plainly and the user
// chooses what gives: find another time, move the deadline, or accept it and
// go into Replan. The deadline is never moved on the user's behalf.
type Choice = "TODAY_OTHER" | "TOMORROW" | "PICK";

export default function RescheduleDialog({
  task,
  currentBlock,
  today,
  effectiveDeadline,
  onCancel,
  onConfirm,
}: {
  task: Task;
  currentBlock: TimeBlock | null;
  today: string;
  effectiveDeadline: string | null;
  onCancel: () => void;
  onConfirm: (args: {
    date: string;
    startTime: string;
    endTime: string;
    acceptDeadlineMiss: boolean;
    newDeadline: string | null;
  }) => void;
}) {
  const [choice, setChoice] = useState<Choice>("TOMORROW");
  const [pickedDate, setPickedDate] = useState("");
  const [startTime, setStartTime] = useState(currentBlock?.startTime ?? "");
  const [endTime, setEndTime] = useState(currentBlock?.endTime ?? "");
  const [moveDeadline, setMoveDeadline] = useState(false);

  const date =
    choice === "TODAY_OTHER" ? today : choice === "TOMORROW" ? addDaysToYmd(today, 1) : pickedDate;

  const timesValid = startTime !== "" && endTime !== "" && startTime < endTime;
  const dateValid = date !== "";
  const risk = dateValid ? deadlineRisk(task, date, effectiveDeadline) : null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center lg:items-center">
      <button type="button" aria-label="閉じる" onClick={onCancel} className="absolute inset-0 bg-stone-900/50" />
      <div className="relative w-full max-w-[430px] rounded-t-3xl bg-white px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5 shadow-2xl lg:rounded-3xl">
        <p className="text-[11px] font-black tracking-widest text-stone-400">予定を変更</p>
        <p className="mt-1 text-[15px] font-black leading-snug text-stone-800">{task.title}</p>
        {currentBlock && (
          <p className="mt-1 text-[11px] font-bold text-stone-400">
            現在 {formatMd(currentBlock.date)} {currentBlock.startTime}〜{currentBlock.endTime}
          </p>
        )}

        <div className="mt-3 flex flex-wrap gap-1.5">
          {(
            [
              ["TODAY_OTHER", "今日の別の時間"],
              ["TOMORROW", "明日"],
              ["PICK", "日付を指定"],
            ] as [Choice, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setChoice(value)}
              className={`rounded-full px-3 py-1.5 text-[12px] font-bold ${
                choice === value ? "bg-stone-800 text-white" : "bg-stone-100 text-stone-500"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {choice === "PICK" && (
          <input
            type="date"
            value={pickedDate}
            onChange={(e) => setPickedDate(e.target.value)}
            className="mt-2 w-full rounded-lg border border-stone-200 px-2.5 py-2 text-[13px] text-stone-700"
          />
        )}

        {/* §10: date alone is not enough for an ACTIVE Task. */}
        <p className="mt-3 text-[11px] font-bold text-stone-500">何時にやるか（必須）</p>
        <div className="mt-1 flex items-center gap-1.5">
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="rounded-lg border border-stone-200 px-2 py-1.5 text-[13px] text-stone-700"
          />
          <span className="text-[12px] text-stone-400">〜</span>
          <input
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className="rounded-lg border border-stone-200 px-2 py-1.5 text-[13px] text-stone-700"
          />
        </div>
        {!timesValid && (startTime !== "" || endTime !== "") && (
          <p className="mt-1 text-[10px] font-bold text-danger">開始と終了を、終了が後になるように入れてください</p>
        )}

        {risk && (
          <div className="mt-3 rounded-2xl bg-danger-soft px-3.5 py-3">
            <p className="text-[12px] font-bold text-danger">この変更では期限に間に合いません</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-stone-600">
              期限 {formatMd(risk.deadline)} に対して {risk.overshootDays}日 後ろになります。
            </p>
            <label className="mt-2 flex items-start gap-2 text-[11px] leading-relaxed text-stone-700">
              <input
                type="checkbox"
                checked={moveDeadline}
                onChange={(e) => setMoveDeadline(e.target.checked)}
                className="mt-0.5"
              />
              期限も {formatMd(date)} へ動かす（チェックしなければ期限はそのまま、再計画が必要として記録します）
            </label>
          </div>
        )}

        <div className="mt-4 flex flex-col gap-1.5">
          <button
            type="button"
            disabled={!dateValid || !timesValid}
            onClick={() =>
              onConfirm({
                date,
                startTime,
                endTime,
                acceptDeadlineMiss: risk !== null && !moveDeadline,
                newDeadline: risk !== null && moveDeadline ? date : null,
              })
            }
            className={`rounded-full px-4 py-2.5 text-[13px] font-bold ${
              dateValid && timesValid ? "bg-accent text-white" : "bg-stone-100 text-stone-300"
            }`}
          >
            {risk && !moveDeadline ? "このまま変更し、再計画へ回す" : "この時間に変更する"}
          </button>
          <button type="button" onClick={onCancel} className="rounded-full px-4 py-2 text-[12px] font-bold text-stone-400">
            キャンセル
          </button>
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-stone-400">
          元の予定は消さずSUPERSEDEDとして残り、新しい予定がACTIVEになります。Google
          Calendarへの反映は別途必要です（このアプリからの書き込みは未実装）。
        </p>
      </div>
    </div>
  );
}
