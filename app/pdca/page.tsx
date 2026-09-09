"use client";

import { useMemo, useState } from "react";
import { tasks as allTasks } from "@/lib/dummy-data";
import { addDaysToYmd, formatMd } from "@/lib/date";
import { varianceReasonLabel } from "@/lib/execution";
import {
  CONFIDENCE_HINT,
  CONFIDENCE_LABEL,
  buildDailyReview,
  buildWeeklyReview,
  proposeCalendarDuration,
  type CheckItem,
  type EstimateProposal,
} from "@/lib/pdca";
import { useTodayExecution } from "@/lib/todayExecutionStore";

// PDCA (2026-09-09, §33〜§50).
//
// 計測の目的はデータを見ることではなく、次の計画を良くすること。だから画面は
// 分析Dashboardにしない。聞くのは2つだけ:
//
//   今回どうだった？  →  次回どう変える？
//
// グラフは要らない。必要になったら足す。

type Tab = "TODAY" | "WEEK";

export default function PdcaPage() {
  const { currentDate: today, completions, varianceReasonByTaskId } = useTodayExecution();
  const [tab, setTab] = useState<Tab>("TODAY");

  const daily = useMemo(
    () =>
      buildDailyReview({
        date: today,
        tasks: allTasks,
        completions,
        varianceReasons: varianceReasonByTaskId,
        allTasks,
      }),
    [today, completions, varianceReasonByTaskId]
  );

  const weekFrom = useMemo(() => addDaysToYmd(today, -6), [today]);
  const weekly = useMemo(
    () => buildWeeklyReview(weekFrom, today, allTasks, completions, varianceReasonByTaskId),
    [weekFrom, today, completions, varianceReasonByTaskId]
  );

  return (
    <div className="flex flex-col pb-8">
      <header className="sticky top-0 z-10 bg-gradient-to-b from-background via-background to-transparent px-5 pb-2 pt-6">
        <p className="text-xs font-bold tracking-widest text-accent-dark">AI WORK OS</p>
        <h1 className="mt-0.5 text-[26px] font-black tracking-tight">PDCA</h1>
        <p className="mt-0.5 text-xs font-medium text-stone-400">今回どうだった？ 次回どう変える？</p>
      </header>

      <div className="mt-2 flex gap-1.5 px-5">
        <TabButton active={tab === "TODAY"} onClick={() => setTab("TODAY")} label="今日" />
        <TabButton
          active={tab === "WEEK"}
          onClick={() => setTab("WEEK")}
          label={`直近7日（${formatMd(weekFrom)}〜${formatMd(today)}）`}
        />
      </div>

      {tab === "TODAY" ? (
        <div className="mt-3 flex flex-col gap-3 px-5 lg:max-w-[820px]">
          {/* §35: 数字が無いなら作らない。 */}
          <section className="rounded-2xl border border-stone-150 bg-white px-4 py-3.5">
            <p className="text-[11px] font-bold text-stone-400">今日のPlan vs Actual</p>
            {daily.plannedMinutes === null && daily.actualMinutes === null ? (
              <p className="mt-1.5 text-[12px] leading-relaxed text-stone-400">
                今日はまだ実績がありません。Taskを完了して実績を入れると、ここに出ます。
              </p>
            ) : (
              <div className="mt-1.5 flex items-baseline gap-4">
                <Figure label="予定" minutes={daily.plannedMinutes} />
                <Figure label="実績" minutes={daily.actualMinutes} />
                <Figure label="差" minutes={daily.varianceMinutes} signed />
              </div>
            )}
            <p className="mt-1.5 text-[10px] text-stone-400">
              完了 {daily.completed}件
              {daily.missingActual > 0 && ` ・実績未入力 ${daily.missingActual}件`}
            </p>
          </section>

          {/* §36: 全Taskを並べない。ズレたものだけ。 */}
          <ReviewList
            title="予定より時間がかかった"
            emptyText="大きくはみ出したTaskはありません。"
            items={daily.over}
          />
          <ReviewList
            title="予定より早かった"
            emptyText="大きく余ったTaskはありません。"
            items={daily.under}
          />

          {daily.over.length === 0 && daily.under.length === 0 && daily.completed > 0 && (
            <p className="rounded-xl bg-stone-50 px-3 py-2.5 text-[11px] leading-relaxed text-stone-500">
              見積りと実績の差が {"15分"}未満・{"20%"}未満に収まっています。この見積りは当たっているので、
              変える必要はありません。
            </p>
          )}
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-3 px-5 lg:max-w-[820px]">
          <section className="rounded-2xl border border-stone-150 bg-white px-4 py-3.5">
            <p className="text-[11px] font-bold text-stone-400">直近7日</p>
            <p className="mt-1 text-[12px] text-stone-600">
              完了 {weekly.completed}件・実績あり {weekly.withActual}件
            </p>
            {weekly.withActual === 0 && (
              <p className="mt-1 text-[11px] leading-relaxed text-stone-400">
                実績が1件も入っていないので、見積り誤差はまだ計算できません。
              </p>
            )}
          </section>

          {weekly.groups.length > 0 && (
            <section className="rounded-2xl border border-stone-150 bg-white px-4 py-3.5">
              <p className="text-[11px] font-bold text-stone-400">繰り返しズレているもの</p>
              <ul className="mt-1.5 flex flex-col gap-2">
                {weekly.groups.map((g) => (
                  <li key={g.groupKey} className="rounded-xl bg-stone-50 px-3 py-2.5">
                    <p className="text-[12px] font-bold text-stone-800">{g.groupLabel}</p>
                    <p className="mt-0.5 text-[11px] tabular-nums text-stone-600">
                      実績 {g.samples.join(" / ")}分
                      {g.averageDriftMinutes !== null && (
                        <span className={g.averageDriftMinutes > 0 ? "ml-2 font-bold text-amber-700" : "ml-2 font-bold text-stone-500"}>
                          平均 {g.averageDriftMinutes >= 0 ? "+" : ""}
                          {g.averageDriftMinutes}分
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-[11px] font-bold text-accent-dark">
                      次回候補 {g.suggestedMinutes}分・{CONFIDENCE_LABEL[g.confidence]}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {weekly.reasons.length > 0 && (
            <section className="rounded-2xl border border-stone-150 bg-white px-4 py-3.5">
              <p className="text-[11px] font-bold text-stone-400">ズレた理由</p>
              <ul className="mt-1.5 flex flex-col gap-1">
                {weekly.reasons.map((r) => (
                  <li key={r.reason} className="flex items-baseline gap-2 text-[12px]">
                    <span className="text-stone-700">{varianceReasonLabel[r.reason]}</span>
                    <span className="tabular-nums font-bold text-stone-400">{r.count}件</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      <p className="mx-5 mt-4 text-[10px] leading-relaxed text-stone-400 lg:max-w-[820px]">
        次回見積りを採用しても、過去のTaskの「予定」は書き換えません。当時どう見積もって、
        実際どうだったかは記録として残ります。
      </p>
    </div>
  );
}

function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-[12px] font-bold ${
        active ? "bg-accent text-white" : "bg-stone-100 text-stone-500"
      }`}
    >
      {label}
    </button>
  );
}

function Figure({ label, minutes, signed = false }: { label: string; minutes: number | null; signed?: boolean }) {
  return (
    <div>
      <p className="text-[10px] font-bold text-stone-400">{label}</p>
      <p className="text-[19px] font-black tabular-nums text-stone-800">
        {minutes === null ? "—" : `${signed && minutes >= 0 ? "+" : ""}${minutes}分`}
      </p>
    </div>
  );
}

function ReviewList({
  title,
  items,
  emptyText,
}: {
  title: string;
  items: CheckItem[];
  emptyText: string;
}) {
  if (items.length === 0) {
    return (
      <section className="rounded-2xl border border-stone-150 bg-white px-4 py-3">
        <p className="text-[11px] font-bold text-stone-400">{title}</p>
        <p className="mt-1 text-[11px] text-stone-400">{emptyText}</p>
      </section>
    );
  }
  return (
    <section className="rounded-2xl border border-stone-150 bg-white px-4 py-3.5">
      <p className="text-[11px] font-bold text-stone-400">
        {title} <span className="tabular-nums">{items.length}件</span>
      </p>
      <ul className="mt-1.5 flex flex-col gap-2">
        {items.map((item) => (
          <CheckCard key={item.task.id} item={item} />
        ))}
      </ul>
    </section>
  );
}

/** §49: 分析で終わらせない。Fact → Cause → Learning → Next → Calendar まで。 */
function CheckCard({ item }: { item: CheckItem }) {
  const { setNextEstimate, nextEstimates } = useTodayExecution();
  const adopted = nextEstimates[item.task.id] ?? null;
  const proposal: EstimateProposal | null = item.proposal;
  const calendarProposal =
    proposal !== null ? proposeCalendarDuration(item.estimateMinutes, proposal) : null;

  return (
    <li className="rounded-xl border border-stone-150 px-3 py-2.5">
      <p className="line-clamp-2 text-[13px] font-bold leading-snug text-stone-800">{item.task.title}</p>

      <div className="mt-1.5 flex items-baseline gap-3 text-[12px] tabular-nums">
        <span className="text-stone-500">
          予定 <span className="font-bold text-stone-700">{item.estimateMinutes}分</span>
        </span>
        <span className="text-stone-500">
          実績 <span className="font-bold text-stone-700">{item.actualMinutes}分</span>
        </span>
        <span className={`font-black ${(item.varianceMinutes ?? 0) > 0 ? "text-amber-700" : "text-stone-500"}`}>
          {(item.varianceMinutes ?? 0) >= 0 ? "+" : ""}
          {item.varianceMinutes}分
          {item.variancePercent !== null && ` / ${item.variancePercent >= 0 ? "+" : ""}${item.variancePercent}%`}
        </span>
      </div>

      {item.reason && (
        <p className="mt-1 text-[11px] text-stone-500">理由　{varianceReasonLabel[item.reason]}</p>
      )}

      {proposal === null ? (
        <p className="mt-1.5 text-[10px] leading-relaxed text-stone-400">
          このTaskには繰り返しの単位がないので、次回見積りの候補は出しません。
          似ているだけのTaskを平均しても、当たる見積りにはなりません。
        </p>
      ) : (
        <div className="mt-2 rounded-lg bg-accent-soft px-2.5 py-2">
          <p className="text-[11px] font-bold text-accent-dark">
            次回候補 {proposal.suggestedMinutes}分・{CONFIDENCE_LABEL[proposal.confidence]}
          </p>
          <p className="mt-0.5 text-[10px] tabular-nums text-stone-500">
            {proposal.groupLabel}の実績 {proposal.samples.join(" / ")}分
          </p>
          <p className="mt-0.5 text-[10px] leading-relaxed text-stone-500">
            {CONFIDENCE_HINT[proposal.confidence]}
          </p>
          {adopted === proposal.suggestedMinutes ? (
            <p className="mt-1.5 text-[11px] font-bold text-accent-dark">
              ✓ 次回見積 {adopted}分 として採用済み
            </p>
          ) : (
            <button
              type="button"
              onClick={() => setNextEstimate(item.task.id, proposal.suggestedMinutes)}
              className="mt-1.5 rounded-full bg-accent px-3 py-1 text-[11px] font-bold text-white"
            >
              次回見積に採用
            </button>
          )}
          {calendarProposal && adopted === proposal.suggestedMinutes && (
            <p className="mt-1.5 rounded bg-white/70 px-2 py-1 text-[10px] leading-relaxed text-stone-600">
              {calendarProposal.label}（{calendarProposal.state}）。
              このアプリはCalendarへ書き込めないので、まだ変わっていません。反映後、次のCalendar取得で確認できます。
            </p>
          )}
        </div>
      )}
    </li>
  );
}
