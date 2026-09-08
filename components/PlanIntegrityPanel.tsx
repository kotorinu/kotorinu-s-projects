"use client";

import { useMemo, useState } from "react";
import {
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
// 「Calendarと食い違っていないか」を同じ場所に出す。
//
// ただし、出せるものを全部出すと画面が埋まって逆に読まれない。so:
//   ERROR と、手を動かせば直る差分（作る・直す・消す）だけが開いた状態で出る。
//   「判定できない」は件数だけ見せて畳んでおく — 情報であって作業ではない。

const TONE: Record<CalendarDiffType, { bg: string; text: string }> = {
  UPDATE: { bg: "bg-amber-100", text: "text-amber-900" },
  DELETE: { bg: "bg-rose-100", text: "text-rose-900" },
  CREATE: { bg: "bg-sky-100", text: "text-sky-900" },
  UNKNOWN: { bg: "bg-stone-150", text: "text-stone-600" },
  MATCHED: { bg: "bg-emerald-100", text: "text-emerald-900" },
};

function formatReadAt(iso: string): string {
  const [, m, d] = iso.split("T")[0].split("-");
  return `${Number(m)}/${Number(d)}`;
}

function DiffRow({ item }: { item: CalendarDiffItem }) {
  const tone = TONE[item.type];
  return (
    <li className="rounded-lg border border-stone-150 px-2.5 py-1.5">
      <div className="flex items-start gap-1.5">
        <span
          className={`shrink-0 whitespace-nowrap rounded px-1.5 py-0.5 text-[9px] font-bold ${tone.bg} ${tone.text}`}
        >
          {DIFF_TYPE_LABEL[item.type]}
        </span>
        <span className="line-clamp-2 text-[11px] font-bold leading-snug text-stone-800">{item.title}</span>
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

  const { actionable, unknown, matched } = useMemo(() => {
    const notMatched = calendarActionItems(diff);
    return {
      actionable: notMatched.filter((i) => i.type !== "UNKNOWN"),
      unknown: notMatched.filter((i) => i.type === "UNKNOWN"),
      matched: diff.length - notMatched.length,
    };
  }, [diff]);

  // 「今すぐ手を動かせば直るもの」があるときだけ開く。
  const needsAttention = issues.length > 0 || actionable.length > 0;
  const [open, setOpen] = useState(needsAttention);
  const [unknownOpen, setUnknownOpen] = useState(false);

  const dot = issues.length > 0 ? "bg-danger" : actionable.length > 0 ? "bg-amber-500" : "bg-emerald-500";
  const headline =
    issues.length > 0
      ? `矛盾${issues.length}件`
      : actionable.length > 0
        ? `Calendarへ反映 ${actionable.length}件`
        : "矛盾なし・Calendar一致";

  return (
    <section className="mx-5 mt-2 rounded-xl border border-stone-150 bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
        <span className="text-[12px] font-bold text-stone-700">計画の整合性</span>
        <span className="text-[11px] text-stone-500">{headline}</span>
        <span className="ml-auto shrink-0 text-[11px] text-stone-400">{open ? "閉じる" : "開く"}</span>
      </button>

      {open && (
        <div className="border-t border-stone-150 px-3 py-2.5">
          <h3 className="text-[11px] font-bold text-stone-500">OS内の矛盾</h3>
          {issues.length === 0 ? (
            <p className="mt-1 text-[11px] leading-snug text-stone-500">
              矛盾はありません。実行するTaskはすべて時間が決まっていて、置き換え済みの予定は残っていません。
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

          <h3 className="mt-3 text-[11px] font-bold text-stone-500">Google Calendarとの差分</h3>
          <p className="mt-0.5 text-[10px] leading-snug text-stone-400">
            {formatReadAt(calendarSnapshot.readAt)}に読み込んだ {calendarSnapshot.coverageStart}〜
            {calendarSnapshot.coverageEnd} と、今日以降の予定の比較。一致 {matched}件。
          </p>

          {actionable.length === 0 ? (
            <p className="mt-1 text-[11px] text-stone-500">Calendarへ反映が必要な予定はありません。</p>
          ) : (
            <>
              <ul className="mt-1.5 flex flex-col gap-1.5">
                {actionable.map((item, i) => (
                  <DiffRow key={`${item.type}-${item.blockId ?? item.eventId}-${i}`} item={item} />
                ))}
              </ul>
              <p className="mt-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[10px] leading-relaxed text-amber-800">
                このアプリからGoogle Calendarへ書き込む機能は未実装です（OAuthサーバもトークン保管先もありません）。
                手動、またはCalendar接続のあるセッションから反映してください。
              </p>
            </>
          )}

          {unknown.length > 0 && (
            <div className="mt-2">
              <button
                type="button"
                onClick={() => setUnknownOpen((v) => !v)}
                className="flex w-full items-center gap-1.5 rounded-lg bg-stone-50 px-2.5 py-1.5 text-left"
              >
                <span className="text-[11px] font-bold text-stone-600">判定できない {unknown.length}件</span>
                <span className="ml-auto text-[10px] text-stone-400">{unknownOpen ? "閉じる" : "見る"}</span>
              </button>
              <p className="mt-1 text-[10px] leading-snug text-stone-400">
                Calendarには予定があるが、OS側に対応するTimeBlockが無いもの。読み込んだ範囲の外も含みます。
                対応するイベントIDが無いものを「一致」とは判定しません。
              </p>
              {unknownOpen && (
                <ul className="mt-1.5 flex flex-col gap-1.5">
                  {unknown.map((item, i) => (
                    <DiffRow key={`unknown-${item.blockId ?? item.eventId}-${i}`} item={item} />
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
