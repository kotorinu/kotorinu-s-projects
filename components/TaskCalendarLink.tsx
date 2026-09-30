"use client";
import { useState } from "react";
import { addMinutes, googleCalendarCreateUrl } from "@/lib/googleCalendarLink";
import type { Task } from "@/lib/types";

// タスクに「いつやるか」が無いとき、その場で Google Calendar に枠を入れる (2026-10-01)。
// 目標→タスク→Calendar のつながりが切れていたのが、9月に進まなかった原因のひとつ。
export default function TaskCalendarLink({ task, today }: { task: Task; today: string }) {
  const [date, setDate] = useState(task.workDate ?? (task.deadline && task.deadline >= today ? task.deadline : today));
  const [start, setStart] = useState("20:00");
  const length = task.estimateMinutes && task.estimateMinutes <= 240 ? task.estimateMinutes : 60;
  const end = addMinutes(start, length);
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(date) && /^\d{2}:\d{2}$/.test(start) && end <= "24:00";
  const details = [task.description, task.definitionOfDone.length ? "完了条件：" + task.definitionOfDone.join("／") : ""].filter(Boolean).join("\n\n");
  return <section className="rounded-2xl border border-dashed border-[#d8cfe6] p-4">
    <h3 className="text-sm font-semibold">まだCalendarに時間がありません</h3>
    <p className="mt-1 text-[14px] leading-6 text-[#877e94]">いつやるかを決めて、Google Calendarに{length}分の枠を入れましょう。完了条件も予定の説明に入ります。</p>
    <div className="mt-3 flex flex-wrap items-end gap-3 text-sm">
      <label className="flex flex-col gap-1">日付<input type="date" className="rounded-xl border border-[#e4dfeb] p-2" value={date} min={today} onChange={e => setDate(e.target.value)} /></label>
      <label className="flex flex-col gap-1">開始<input type="time" step={900} className="rounded-xl border border-[#e4dfeb] p-2" value={start} onChange={e => setStart(e.target.value)} /></label>
      {valid ? <a className="studio-primary" href={googleCalendarCreateUrl({ title: task.title, date, start, end, details })} target="_blank" rel="noreferrer">Google カレンダーに入れる</a> : <span className="text-amber-800">日付と時刻を確認してください</span>}
    </div>
    <p className="mt-2 text-[13px] leading-6 text-[#877e94]">保存したら、やること画面の「カレンダーの予定からタスクを作る」は不要です（このタスクがすでにあります）。</p>
  </section>;
}
