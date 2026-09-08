"use client";

import { useMemo, useState } from "react";
import {
  DIFF_TYPE_HINT,
  DIFF_TYPE_LABEL,
  calendarActionItems,
  calendarDiff,
  type CalendarDiffItem,
  type CalendarDiffType,
} from "@/lib/calendarDiff";
import { calendarSnapshot } from "@/lib/calendarSnapshot";
import { PLAN_ISSUE_LABEL, validatePlan, type PlanIssue } from "@/lib/planValidator";
import type { Clock } from "@/lib/clock";
import type { TaskStateOverlays } from "@/lib/taskState";
import type { Task, TimeBlock } from "@/lib/types";

// 計画の健全性を1か所で見るパネル (2026-09-09, §17/§21/§22/§23).
//
// 分けて置くと結局どちらも見なくなるので、「OSの中で矛盾していないか」と
// 「Calendarと食い違っていないか」を同じ場所に出す。どちらも0なら小さく
// 畳まれ、1件でもあれば開いた状態で出る。

const DIFF_TONE: Record<CalendarDiffType, { bg: string; text: string }> = {
  UPDATE: { bg: "bg-amber-100", text: "text-amber-900" },
  DELETE: { bg: "bg-rose-100", text: "text-rose-900" },
  CREATE: { bg: "bg-sky-100", text: "text-sky-900" },
  UNKNOWN: { bg: "bg-stone-150", text: "text-stone-600" },
  MATCHED: { bg: "bg-emerald-100", text: "text-emerald-900" },
};

function formatReadAt(iso: string): string {
  const [date] = iso.split("T");
  const [, m, d] = date.split("-");
  return `${Number(m)}/${Number(d)}`;
}

export default function PlanIntegrityPanel({
  tasks,
  planBlocks,
  supersededBlocks,
  overlays,
  clock,
}: {
  tasks: Task[];
  planBlocks: TimeBlock[];
  supersededBlocks: TimeBlock[];
  overlays: TaskStateOverlays;
  clock: Clock;
}) {
  const issues = useMemo(
    () => validatePlan(tasks, planBlocks, overlays, clock),
    [tasks, planBlocks, overlays, clock]
  );
  const diff = useMemo(
    () => calendarDiff({ planBlocks, supersededBlocks, from: clock.today }),
    [planBlocks, supersededBlocks, clock.today]
  );
  const actions = useMemo(() => calendarActionItems(diff), [diff]);
  const matched = diff.length - actions.length;

  const clean = issues.length === 0 && actions.length === 0;
  const [open, setOpen] = useState(!clean);

  return (
    <section className="mx-5 mt-2 rounded-xl border border-stone-150 bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${
            issues.length > 0 ? "bg-danger" : actions.length > 0 ? "bg-amber-500" : "bg-emerald-500"
          }`}
        />
        <span className="text-[12px] font-bold text-stone-700">計画の整合性</span>
        <span className="text-[11px] text-stone-500">
          {issues.length > 0 && `矛盾${issues.length}件・`}
          {actions.length > 0 ? `Calendar差分${actions.length}件` : "Calendar一致"}
        </span>
        <span className="ml-auto text-[11px] text-stone-400">{open ? "閉じる" : "開く"}</span>
      </button>

      {open && (
        <div className="border-t border-stone-150 px-3 py-2.5">
          {/* --- §17 OS内部の矛盾 --- */}
          <h3 className="text-[11px] font-bold text-stone-500">OS内の矛盾</h3>
          {issues.length === 0 ? (
            <p className="mt-1 text-[11px] text-stone-500">
              矛盾はありません。ACTIVEなTaskはすべて時間が決まっていて、置き換え済みの予定は残っていません。
            </p>
          ) : (
            <ul className="mt-1 flex flex-col gap-1.5">
              {issues.map((issue: PlanIssue, i) => (
                <li key={`${issue.code}-${issue.taskId}-${i}`} className="rounded-lg bg-rose-50 px-2.5 py-1.5">
                  <p className="text-[11px] font-bold text-rose-900">{PLAN_ISSUE_LABEL[issue.code]}</p>
                  <p className="mt-0.5 text-[11px] leading-snug text-stone-700">{issue.taskTitle}</p>
                  <p className="mt-0.5 text-[10px] leading-snug text-stone-500">{issue.detail}</p>
                </li>
              ))}
            </ul>
          )}

          {/* --- §21〜§23 Calendarとの差分 --- */}
          <h3 className="mt-3 text-[11px] font-bold text-stone-500">Google Calendarとの差分</h3>
          <p className="mt-0.5 text-[10px] leading-snug text-stone-400">
            {formatReadAt(calendarSnapshot.readAt)}時点で読み込んだ {calendarSnapshot.coverageStart}〜
            {calendarSnapshot.coverageEnd} の範囲と、今日以降の予定との比較。
            {matched > 0 && ` 一致 ${matched}件。`}
            この範囲外はUNKNOWNとして扱い、一致とは判定しません。
          </p>
          {actions.length === 0 ? (
            <p className="mt-1 text-[11px] text-stone-500">対応が必要な差分はありません。</p>
          ) : (
            <ul className="mt-1.5 flex flex-col gap-1.5">
              {actions.map((item: CalendarDiffItem, i) => {
                const tone = DIFF_TONE[item.type];
                return (
                  <li
                    key={`${item.type}-${item.blockId ?? item.eventId}-${i}`}
                    className="rounded-lg border border-stone-150 px-2.5 py-1.5"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${tone.bg} ${tone.text}`}>
                        {DIFF_TYPE_LABEL[item.type]}
                      </span>
                      <span className="line-clamp-1 text-[11px] font-bold text-stone-800">{item.title}</span>
                    </div>
                    <dl className="mt-1 grid grid-cols-[3.5rem_1fr] gap-x-2 gap-y-0.5 text-[10px]">
                      <dt className="text-stone-400">OS予定</dt>
                      <dd className="text-stone-700">{item.osWhen ?? "なし"}</dd>
                      <dt className="text-stone-400">Calendar</dt>
                      <dd className="text-stone-700">{item.calendarWhen ?? "なし"}</dd>
                      <dt className="text-stone-400">やること</dt>
                      <dd className="text-stone-700">{item.action}</dd>
                    </dl>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[10px] leading-relaxed text-amber-800">
            このアプリからGoogle Calendarへ書き込む機能は未実装です（OAuthサーバもトークン保管先もありません）。
            上の差分は手動、またはCalendar接続のあるセッションから反映してください。
          </p>
          <p className="mt-1 text-[10px] leading-relaxed text-stone-400">
            {DIFF_TYPE_HINT.UNKNOWN}
          </p>
        </div>
      )}
    </section>
  );
}
