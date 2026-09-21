"use client";

import { useState } from "react";
import StudioDialog from "./StudioDialog";
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
    <StudioDialog title="日時を決める" onClose={onCancel}>
        <p className="text-[14px] font-black tracking-widest text-stone-400">予定を変更</p>
        <p className="mt-1 text-[15px] font-black leading-snug text-stone-800">{task.title}</p>
        {currentBlock && (
          <p className="mt-1 text-[14px] font-bold text-stone-400">
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
              className={`rounded-xl px-3 min-h-11 py-1.5 text-sm font-bold ${
                choice === value ? "bg-stone-800 text-white" : "bg-stone-100 text-stone-500"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {choice === "PICK" && (
          <input
            type="date" aria-label="作業する日"
            value={pickedDate}
            onChange={(e) => setPickedDate(e.target.value)}
            className="mt-2 w-full rounded-lg border border-stone-200 px-2.5 py-2 text-[13px] text-stone-700"
          />
        )}

        {/* §10: date alone is not enough for an ACTIVE Task. */}
        <p className="mt-3 text-[14px] font-bold text-stone-500">何時にやるか（必須）</p>
        <div className="mt-1 flex items-center gap-1.5">
          <input
            type="time" aria-label="開始時刻"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            onInput={(e) => setStartTime(e.currentTarget.value)}
            className="rounded-lg border border-stone-200 px-2 min-h-11 py-1.5 text-[13px] text-stone-700"
          />
          <span className="text-sm text-stone-400">〜</span>
          <input
            type="time" aria-label="終了時刻"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            onInput={(e) => setEndTime(e.currentTarget.value)}
            className="rounded-lg border border-stone-200 px-2 min-h-11 py-1.5 text-[13px] text-stone-700"
          />
        </div>
        {!timesValid && (startTime !== "" || endTime !== "") && (
          <p className="mt-1 text-[14px] font-bold text-danger">開始と終了を、終了が後になるように入れてください</p>
        )}

        {risk && (
          <div className="mt-3 rounded-2xl bg-danger-soft px-3.5 py-3">
            <p className="text-sm font-bold text-danger">この変更では期限に間に合いません</p>
            <p className="mt-0.5 text-[14px] leading-relaxed text-stone-600">
              期限 {formatMd(risk.deadline)} に対して {risk.overshootDays}日 後ろになります。
            </p>
            <label className="mt-2 flex items-start gap-2 text-[14px] leading-relaxed text-stone-700">
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
            className={`rounded-xl px-4 min-h-11 py-2.5 text-[13px] font-bold ${
              dateValid && timesValid ? "bg-accent text-white" : "bg-stone-100 text-stone-300"
            }`}
          >
            {risk && !moveDeadline ? "このまま変更し、再計画へ回す" : "この時間に変更する"}
          </button>
          <button type="button" onClick={onCancel} className="rounded-xl px-4 py-2 text-sm font-bold text-stone-400">
            キャンセル
          </button>
        </div>
        <p className="mt-2 text-[14px] leading-relaxed text-stone-400">
          変更前の予定も履歴に残ります。Google
          Calendarへの反映は別途必要です（このアプリからの書き込みは未実装）。
        </p>
    </StudioDialog>
  );
}
