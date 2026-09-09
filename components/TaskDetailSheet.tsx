"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { goals, monthEndStates, outcomes, tasks as allTasks, workPrinciples } from "@/lib/dummy-data";
import { formatMd, monthKeyOf } from "@/lib/date";
import { computeGoalProgress } from "@/lib/progress";
import { capabilityAction, capabilityOwnerLabel, deliveryStatusLabel } from "@/lib/capability";
import { computeVariance, VARIANCE_REASONS, varianceReasonLabel } from "@/lib/execution";
import { resolveSeries } from "@/lib/taskSeries";
import { useTodayExecution } from "@/lib/todayExecutionStore";
import { WORK_CONTEXT_LABEL, WORK_CONTEXT_PRINCIPLES, principlesForContext } from "@/lib/workPrinciples";
import ProgressBar from "@/components/ProgressBar";
import OutcomeDetailSheet from "@/components/OutcomeDetailSheet";
import TaskOrganizeMenu from "@/components/TaskOrganizeMenu";
import ManualActualEntry from "@/components/ManualActualEntry";
import RescheduleDialog from "@/components/RescheduleDialog";
import { CALENDAR_SYNC_HINT, CALENDAR_SYNC_LABEL, calendarSyncState } from "@/lib/calendarSync";
import { liveTimeBlocks, runbookFor } from "@/lib/livePlan";
import { buildReplanFlag, isPostponement } from "@/lib/replan";
import { effectiveDeadline } from "@/lib/taskState";
import { suggestEstimate } from "@/lib/estimateCalibration";
import { shouldAskVarianceReason } from "@/lib/estimateCalibration";
import type { Task, VarianceReason } from "@/lib/types";

// Module scope so the React Compiler purity rule sees these as calls into a
// helper rather than impure work in the component body — they only ever run
// from an event handler.
function newBlockId(taskId: string): string {
  return `tbo-${taskId}-${Date.now()}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

const outputTypeLabel: Record<NonNullable<Task["outputType"]>, string> = {
  MESSAGE_DRAFT: "メッセージ下書き",
  EVENT_REMINDER: "イベントリマインド",
  MEMBER_STATUS_LIST: "メンバー状況一覧",
  OPERATION_DOC: "運営ドキュメント",
  OTHER: "その他",
};

export default function TaskDetailSheet({
  task,
  onClose,
  actualMinutes = null,
  started = false,
  varianceReason = null,
  onSetVarianceReason,
  onNavigateToTask,
}: {
  task: Task;
  onClose: () => void;
  // Session-only Estimate vs Actual state (PRD.md §25/§29) — only the TODAY
  // page tracks this (no DB yet), so these are optional; TASK MAP opens this
  // same sheet without them and simply shows no execution-tracking section.
  actualMinutes?: number | null;
  started?: boolean;
  varianceReason?: VarianceReason | null;
  onSetVarianceReason?: (reason: VarianceReason) => void;
  // Task Series (2026-09-06): lets Previous/Next inside the sheet hand
  // control back to the parent (which owns `selectedTask` and this Task's
  // session-scoped actual/variance state) rather than the sheet trying to
  // manage a second Task's identity internally — keeps Estimate vs Actual
  // correctly correlated to whichever Task is actually showing.
  onNavigateToTask?: (taskId: string) => void;
}) {
  const [checkedSteps, setCheckedSteps] = useState<Set<number>>(new Set());
  const [requested, setRequested] = useState(false);
  const [outcomeSheetOpen, setOutcomeSheetOpen] = useState(false);

  useEffect(() => {
    const mainEl = document.querySelector("main");
    const prev = mainEl?.style.overflow;
    if (mainEl) mainEl.style.overflow = "hidden";
    return () => {
      if (mainEl) mainEl.style.overflow = prev ?? "";
    };
  }, []);

  const {
    currentDate: today,
    calendarSyncOverrides,
    setCalendarSyncEnabled,
    taskActualMinutes,
    manualActualTaskIds,
    setManualActualMinutes,
    timeBlockOverrides,
    supersededBlockIds,
    deadlineOverrides,
    completions,
    rescheduleTimeBlock,
    setDeadlineOverride,
    raiseReplan,
    replanFlags,
    clearReplan,
  } = useTodayExecution();
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  // The timed value from the page, when there is one; otherwise whatever is
  // stored (including a hand-typed figure) so this sheet works from TASK MAP
  // and Area Home too, not only from TODAY.
  const shownActualMinutes = actualMinutes ?? taskActualMinutes.get(task.id) ?? null;
  const planBlocks = liveTimeBlocks({ timeBlockOverrides, supersededBlockIds });
  const linkedTimeBlocks = planBlocks
    .filter((tb) => tb.taskId === task.id)
    .sort((a, b) => (a.date + a.startTime < b.date + b.startTime ? -1 : 1));
  // The block being worked next — what "予定を変更" moves, and where a
  // Session Runbook comes from.
  const nextBlock = linkedTimeBlocks.find((tb) => tb.date >= today) ?? linkedTimeBlocks[0] ?? null;
  const runbook = nextBlock ? runbookFor(nextBlock) : null;
  const taskDeadline = effectiveDeadline(task, { deadlineOverrides });
  const replanFlag = replanFlags[task.id] ?? null;
  const estimateSuggestion = suggestEstimate(task, allTasks, completions);

  function applyReschedule(args: {
    date: string;
    startTime: string;
    endTime: string;
    acceptDeadlineMiss: boolean;
    newDeadline: string | null;
  }) {
    const replaced = nextBlock;
    rescheduleTimeBlock(
      {
        id: newBlockId(task.id),
        taskId: task.id,
        label: task.title,
        date: args.date,
        startTime: args.startTime,
        endTime: args.endTime,
        createdOnDate: today,
        createdAt: nowIso(),
        replacesBlockId: replaced?.id ?? null,
        reason: "本人が予定を変更",
      },
      replaced?.id ?? null
    );
    // The deadline only moves when the user explicitly says so (§11).
    if (args.newDeadline) setDeadlineOverride(task.id, args.newDeadline);
    if (args.acceptDeadlineMiss) {
      raiseReplan(
        buildReplanFlag(
          task.id,
          "DEADLINE_AT_RISK",
          `${args.date} へ移動したため、期限 ${taskDeadline ?? "-"} に間に合わない見込み`,
          today
        )
      );
    } else if (isPostponement(replaced, args.date)) {
      raiseReplan(
        buildReplanFlag(task.id, "POSTPONED", `${replaced!.date} から ${args.date} へ移動`, today)
      );
    }
    setRescheduleOpen(false);
  }
  const series = resolveSeries(task, allTasks);

  const goal = task.goalId ? goals.find((g) => g.id === task.goalId) ?? null : null;
  const goalProgress = goal ? computeGoalProgress(allTasks, goal.id) : null;
  const outcome = task.outcomeId ? outcomes.find((o) => o.id === task.outcomeId) ?? null : null;
  const areaOutcome =
    !goal && !outcome
      ? monthEndStates.find((s) => s.area === task.area && s.monthKey === monthKeyOf(0)) ?? null
      : null;

  const action = capabilityAction(task.aiCapability);

  function toggleStep(i: number) {
    setCheckedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center lg:items-stretch lg:justify-end">
      <button
        type="button"
        aria-label="閉じる"
        onClick={onClose}
        className="absolute inset-0 bg-stone-900/45"
      />

      {/* Desktop Task Detail (2026-09-06): a bottom sheet doesn't make sense
          on a wide screen — from lg up this becomes a full-height right
          side panel instead, never the mobile sheet stretched wide. */}
      <div className="relative flex max-h-[85dvh] w-full max-w-[430px] flex-col rounded-t-3xl bg-white shadow-2xl lg:max-h-none lg:h-full lg:w-[480px] lg:max-w-[480px] lg:rounded-none lg:rounded-l-3xl">
        <div className="flex shrink-0 justify-center pt-2.5 lg:hidden">
          <span className="h-1 w-9 rounded-full bg-stone-200" />
        </div>

        <div className="shrink-0 px-5 pb-3 pt-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[17px] font-black leading-snug text-stone-900">{task.title}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] font-bold text-stone-500">
                <span className="rounded-full bg-stone-100 px-2 py-0.5 text-stone-600">{task.area}</span>
                <span>期限 {formatMd(task.deadline)}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="閉じる"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-stone-100 text-sm text-stone-400"
            >
              ✕
            </button>
          </div>

          <div className="mt-3 rounded-2xl bg-stone-50 px-3.5 py-3">
            <h3 className="mb-1 text-[11px] font-black tracking-wide text-stone-400">■ 完了基準</h3>
            <ul className="flex flex-col gap-1">
              {task.definitionOfDone.map((d, i) => (
                <li key={i} className="flex items-start gap-1.5 text-[13px] leading-relaxed text-stone-700">
                  <span className="mt-0.5 text-accent-dark">✓</span>
                  {d}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-[max(2rem,env(safe-area-inset-bottom))]">
          <Section title="何をする？">
            <p className="text-[13px] leading-relaxed text-stone-700">{task.description}</p>
            {task.blockedOnInfo && (
              <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800">
                ⚠ 情報待ち：{task.blockedOnInfo}
              </p>
            )}
          </Section>

          {/* §13: a single "〜するため" sentence just restates the title. An
              ACTIVE Task explains the parent Outcome, what is currently
              missing, and why it has to happen now. */}
          <Section title="なぜ今やるのか">
            {task.whyBreakdown ? (
              <div className="flex flex-col gap-2">
                <WhyPart label="この先にあるOutcome" body={task.whyBreakdown.parentOutcome} />
                <WhyPart label="いま足りていないこと" body={task.whyBreakdown.currentGap} />
                <WhyPart label="なぜ今なのか" body={task.whyBreakdown.whyNow} tone="accent" />
              </div>
            ) : (
              <>
                <p className="text-[13px] leading-relaxed text-stone-700">{task.why}</p>
                <p className="mt-1.5 text-[10px] text-stone-400">
                  このTaskはまだ Outcome / 現在のGap / なぜ今 に分解されていません
                </p>
              </>
            )}
          </Section>

          {task.workContext && (
            <Section title="今回使う仕事の型">
              <p className="mb-1.5 text-[10px] font-bold text-stone-400">
                {WORK_CONTEXT_LABEL[task.workContext]}
              </p>
              <ul className="flex flex-col gap-1.5">
                {principlesForContext(workPrinciples, task.workContext).map((p) => (
                  <li key={p.id} className="rounded-xl bg-stone-50 px-3 py-2.5">
                    <p className="text-[12px] font-bold text-stone-700">{p.title}</p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-stone-500">{p.summary}</p>
                    {p.examples.length > 0 && (
                      <p className="mt-1 text-[10px] text-stone-400">例：{p.examples[0]}</p>
                    )}
                  </li>
                ))}
                {WORK_CONTEXT_PRINCIPLES[task.workContext].usesHelpNeed && (
                  <li className="rounded-xl bg-stone-50 px-3 py-2.5">
                    <p className="text-[12px] font-bold text-stone-700">Help Need Workflow</p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-stone-500">
                      相談前に、目的・現状・分かっていること／いないこと・欲しい回答を整理してから相談する
                    </p>
                  </li>
                )}
              </ul>
            </Section>
          )}

          {task.linkedSalesMaster && (
            <Section title="営業Master">
              <Link href="/sales-master" className="text-[12px] font-bold text-accent-dark">
                ＞ 営業Masterを見る
              </Link>
            </Section>
          )}

          {(goal || outcome || areaOutcome) && (
            <Section title="上位成果">
              {goal && goalProgress ? (
                <div>
                  <p className="text-[13px] font-bold text-stone-700">{goal.title}</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-stone-600">{goal.desiredState}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <ProgressBar pct={goalProgress.pct} size="sm" />
                    <span className="tabular-nums shrink-0 text-[11px] font-bold text-stone-500">
                      {goalProgress.done}/{goalProgress.total}
                    </span>
                  </div>
                  <Link
                    href={`/goals?focus=${goal.id}`}
                    className="mt-2 inline-block text-[12px] font-bold text-accent-dark"
                  >
                    ＞ 上位Goalを見る
                  </Link>
                </div>
              ) : outcome ? (
                <div>
                  <p className="text-[13px] font-bold text-stone-700">{outcome.title}</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-stone-600">{outcome.desiredState}</p>
                  <button
                    type="button"
                    onClick={() => setOutcomeSheetOpen(true)}
                    className="mt-2 text-[12px] font-bold text-accent-dark"
                  >
                    ＞ 上位Outcomeを見る
                  </button>
                </div>
              ) : (
                areaOutcome && (
                  <p className="text-[13px] leading-relaxed text-stone-700">
                    <span className="font-bold text-stone-500">{areaOutcome.area}の今月末目標　</span>
                    {areaOutcome.state}
                  </p>
                )
              )}
            </Section>
          )}

          {task.sourceLinks.length > 0 && (
            <Section title="参照元・作業する場所">
              <ul className="flex flex-col gap-1.5">
                {task.sourceLinks.map((src) => (
                  <li key={src.label}>
                    {src.url ? (
                      <a
                        href={src.url}
                        target={src.url.startsWith("/") ? undefined : "_blank"}
                        rel={src.url.startsWith("/") ? undefined : "noopener noreferrer"}
                        className="block rounded-xl bg-stone-50 px-3 py-2.5"
                      >
                        <p className="text-[12px] font-bold text-accent-dark">
                          {src.label}
                          {!src.url.startsWith("/") && " ↗"}
                        </p>
                        <p className="mt-0.5 text-[11px] leading-relaxed text-stone-500">{src.purpose}</p>
                      </a>
                    ) : (
                      <div className="rounded-xl bg-stone-50 px-3 py-2.5">
                        <p className="text-[12px] font-bold text-stone-600">{src.label}</p>
                        <p className="mt-0.5 text-[11px] leading-relaxed text-stone-500">{src.purpose}</p>
                        <p className="mt-0.5 text-[10px] font-bold text-stone-400">リンク未確認</p>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <Section title="具体手順">
            <p className="mb-1.5 text-[10px] font-medium text-stone-400">
              作業の進み具合の目安です（完了判定は上の「完了基準」で行います）
            </p>
            <ul className="flex flex-col gap-1.5">
              {task.steps.map((step, i) => {
                const checked = checkedSteps.has(i);
                return (
                  <li key={i}>
                    <button
                      type="button"
                      onClick={() => toggleStep(i)}
                      className="flex w-full items-start gap-2 text-left"
                    >
                      <span
                        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded text-[8px] ${
                          checked ? "bg-stone-400 text-white" : "border border-stone-300 text-transparent"
                        }`}
                      >
                        ✓
                      </span>
                      <span className={`text-[13px] leading-relaxed ${checked ? "text-stone-300 line-through" : "text-stone-700"}`}>
                        {i + 1}. {step}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Section>

          <Section title={task.aiCapability === "BLOCKED" ? "AI実行" : "AIができること"}>
            {task.aiCapability === "HUMAN" && (
              <p className="text-[13px] text-stone-500">🧑 このタスクは人間が実行します</p>
            )}

            {task.aiCapability === "BLOCKED" && (
              <div className="rounded-2xl bg-danger-soft px-3.5 py-3">
                <p className="text-[13px] font-bold text-danger">⚠ AI実行には情報が不足しています</p>
                <p className="mt-1.5 text-[11px] font-bold text-stone-500">不足：</p>
                <ul className="mt-0.5 flex flex-col gap-0.5">
                  {(task.blockedOn ?? []).map((b) => (
                    <li key={b} className="text-[12px] text-stone-700">
                      ・{b}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {action.buttonLabel && (
              <div className="rounded-2xl bg-accent-soft px-3.5 py-3">
                <p className="text-[13px] font-bold text-accent-dark">🤖 {action.headline}</p>
                <button
                  type="button"
                  disabled={requested}
                  onClick={() => setRequested(true)}
                  className={`mt-2.5 w-full rounded-full py-2 text-[13px] font-bold transition-colors ${
                    requested ? "bg-white text-stone-400" : "bg-accent text-white active:scale-[0.98]"
                  }`}
                >
                  {requested ? `✓ ${action.runningLabel}` : action.buttonLabel}
                </button>
                {requested && (
                  <p className="mt-1.5 text-center text-[10px] text-stone-400">Phase1ではモック動作です</p>
                )}
              </div>
            )}
          </Section>

          {task.outputType && (
            <Section title="納品情報">
              <dl className="flex flex-col gap-1.5 text-[13px]">
                <Row label="成果物の種類" value={outputTypeLabel[task.outputType]} />
                <Row label="保存先" value={task.outputDestination ?? "未設定"} />
                <Row label="送信先" value={task.deliveryChannel ?? "未設定"} />
                {task.deliveryStatus && (
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-stone-500">状態</dt>
                    <dd>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                          deliveryStatusLabel(task.deliveryStatus).tone === "accent"
                            ? "bg-accent-soft text-accent-dark"
                            : deliveryStatusLabel(task.deliveryStatus).tone === "warning"
                              ? "bg-danger-soft text-danger"
                              : "bg-stone-100 text-stone-500"
                        }`}
                      >
                        {deliveryStatusLabel(task.deliveryStatus).label}
                      </span>
                    </dd>
                  </div>
                )}
              </dl>
              {task.automationCandidate && (
                <p className="mt-2 text-[10px] text-stone-400">
                  🔁 将来の自動化候補（Phase1では実行しません）
                </p>
              )}
            </Section>
          )}

          <Section title="予定・実績">
            <dl className="flex flex-col gap-1.5 text-[13px]">
              <Row label="予定時間" value={task.estimateMinutes !== null ? `${task.estimateMinutes}分` : "未設定"} />
              {/* §53: 期限と実行予定は別概念。違っていること自体はエラーでは
                  ない——9/8が期限のTaskを9/9に実行するのは、遅れてはいるが
                  計画としては正しい。並べて出し、片方をもう片方の間違いとして
                  見せない。 */}
              <Row label="期限" value={formatMd(task.deadline)} />
              <Row
                label="実行予定"
                value={
                  nextBlock
                    ? `${formatMd(nextBlock.date)} ${nextBlock.startTime}〜${nextBlock.endTime}`
                    : "未定"
                }
              />
              <Row label="担当" value={capabilityOwnerLabel(task.aiCapability)} />
              {started && shownActualMinutes === null && <Row label="状態" value="実行中" />}
              {shownActualMinutes !== null &&
                (() => {
                  const { varianceMinutes } = computeVariance(task.estimateMinutes, shownActualMinutes);
                  return (
                    <Row
                      label="実績"
                      value={`${task.estimateMinutes !== null ? `${task.estimateMinutes}分` : "未設定"} → ${shownActualMinutes}分${
                        varianceMinutes !== null ? `（${varianceMinutes >= 0 ? "+" : ""}${varianceMinutes}分）` : ""
                      }`}
                    />
                  );
                })()}
              {task.overrunReason && <Row label="理由" value={task.overrunReason} />}
              {task.nextImprovement && <Row label="次回改善" value={task.nextImprovement} />}
            </dl>

            {/* 実績時間の手入力 (2026-09-08): 開始/完了を押し忘れても実績が
                貯まるようにする。押し忘れると見積り改善のデータが止まる。 */}
            {estimateSuggestion && (
              <div className="mt-2 rounded-2xl bg-stone-50 px-3.5 py-3">
                <p className="text-[11px] font-bold text-stone-500">次回の見積り候補</p>
                <p className="mt-0.5 text-[13px] font-black text-stone-800">
                  {estimateSuggestion.suggestedMinutes}分
                  <span className="ml-1.5 text-[10px] font-bold text-stone-400">
                    （{estimateSuggestion.basis}の実績 {estimateSuggestion.samples.join(" / ")}分）
                  </span>
                </p>
                <p className="mt-1 text-[10px] leading-relaxed text-stone-400">
                  提案です。自動では変更しません。
                </p>
              </div>
            )}

            <ManualActualEntry
              task={task}
              actualMinutes={shownActualMinutes}
              isManual={manualActualTaskIds.has(task.id)}
              onSave={(m) => setManualActualMinutes(task.id, m)}
              onClear={() => setManualActualMinutes(task.id, null)}
            />

            {/* §15: only ask when the gap is 20%+ or 15min+. Asking every
                time trains the user to dismiss it. */}
            {shouldAskVarianceReason(task.estimateMinutes, shownActualMinutes) && onSetVarianceReason && (
              <div className="mt-3">
                <p className="mb-1.5 text-[10px] font-bold text-stone-400">なぜ差が出た？（任意）</p>
                <div className="flex flex-wrap gap-1.5">
                  {VARIANCE_REASONS.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => onSetVarianceReason(r)}
                      className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition-colors ${
                        varianceReason === r ? "bg-accent text-white" : "bg-stone-100 text-stone-500"
                      }`}
                    >
                      {varianceReasonLabel[r]}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </Section>

          {series && (
            <Section title="Task Series">
              <p className="mb-1.5 text-[11px] font-bold text-stone-500">
                {series.seriesTitle}　全{series.totalSteps}回中{series.sequenceNumber}回目
              </p>
              <ul className="flex flex-col gap-1.5">
                {series.previous && (
                  <SeriesRow
                    icon="✓"
                    label="前"
                    taskTitle={series.previous.title}
                    onClick={onNavigateToTask ? () => onNavigateToTask(series.previous!.id) : undefined}
                  />
                )}
                <SeriesRow icon="▶" label="現在" taskTitle={series.current.title} current />
                {series.next && (
                  <SeriesRow
                    icon="○"
                    label="次"
                    taskTitle={series.next.title}
                    subLabel={series.next.deadline ? formatMd(series.next.deadline) : null}
                    onClick={onNavigateToTask ? () => onNavigateToTask(series.next!.id) : undefined}
                  />
                )}
              </ul>
              {series.finalDeadline && (
                <p className="mt-2 text-[11px] font-bold text-stone-500">
                  最終期限：<span className="text-stone-700">{formatMd(series.finalDeadline)}</span>
                </p>
              )}
              <p className="mt-1.5 text-[10px] text-stone-400">
                Task Series＝成果を分割した仕事単位。TimeBlock（下）＝その回に使う時間枠で、混同していません
              </p>
            </Section>
          )}

          {linkedTimeBlocks.length > 0 && (
            <Section title="予定（Time Block）">
              <div className="mb-2 flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setRescheduleOpen(true)}
                  className="rounded-full bg-stone-800 px-3 py-1.5 text-[11px] font-bold text-white"
                >
                  予定を変更
                </button>
                {replanFlag && (
                  <button
                    type="button"
                    onClick={() => clearReplan(task.id)}
                    className="rounded-full bg-danger-soft px-3 py-1.5 text-[11px] font-bold text-danger"
                  >
                    再計画済みにする
                  </button>
                )}
              </div>
              {replanFlag && (
                <p className="mb-2 rounded-xl bg-danger-soft px-3 py-2 text-[11px] leading-relaxed text-danger">
                  ⚠ 再計画が必要：{replanFlag.detail}
                </p>
              )}
              <ul className="flex flex-col gap-1.5">
                {linkedTimeBlocks.map((tb) => {
                  const isPast = tb.date < today;
                  const syncEnabled = calendarSyncOverrides[tb.id] ?? tb.calendarSyncEnabled;
                  return (
                    <li
                      key={tb.id}
                      className="rounded-xl bg-stone-50 px-3 py-2 text-[12px]"
                      style={{ opacity: isPast ? 0.55 : 1 }}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-bold text-stone-700">{formatMd(tb.date)}</span>
                        <span className="font-medium text-stone-500">
                          {tb.startTime}〜{tb.endTime}
                        </span>
                      </div>
                      {(() => {
                        // §17: four explicit states. CALENDAR_CONFIRMED needs a
                        // real calendarEventId, so nothing here claims to be
                        // synced when it isn't.
                        const sync = calendarSyncState(tb, { syncEnabled });
                        return (
                          <p
                            className={`mt-1 text-[10px] font-bold ${
                              sync === "CALENDAR_CONFIRMED"
                                ? "text-emerald-600"
                                : sync === "NEEDS_CALENDAR_SYNC"
                                  ? "text-amber-700"
                                  : "text-stone-400"
                            }`}
                            title={CALENDAR_SYNC_HINT[sync]}
                          >
                            {CALENDAR_SYNC_LABEL[sync]}
                          </p>
                        );
                      })()}
                      <div className="mt-1.5 flex items-center justify-between gap-2 border-t border-stone-200/70 pt-1.5">
                        <span className="text-[10px] font-bold text-stone-400">
                          {tb.calendarEventId ? "📅 Google Calendar同期済み" : "Google Calendarへ表示"}
                        </span>
                        <button
                          type="button"
                          onClick={() => setCalendarSyncEnabled(tb.id, !syncEnabled)}
                          className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold transition-colors ${
                            syncEnabled ? "bg-accent text-white" : "bg-stone-200 text-stone-500"
                          }`}
                        >
                          {syncEnabled ? "確定済み" : "確定する"}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-1.5 text-[10px] text-stone-400">
                Task ≠ Time Block：1つのTaskを複数の予定に分けて実行できます。「確定する」はこの予定をGoogle
                Calendarへ載せる対象にする印です（Phase1は実際の自動送信はまだ行わず、確定済みの一覧を人が
                Calendarへ反映します）。
              </p>
            </Section>
          )}

          {runbook && nextBlock && (
            <Section title="この枠の進め方（Session Runbook）">
              <p className="mb-1.5 text-[10px] leading-relaxed text-stone-400">
                {formatMd(nextBlock.date)} {nextBlock.startTime}〜{nextBlock.endTime}
                の進め方です。Calendarには1件のまま——15分ごとの予定は作りません。
              </p>
              <ol className="flex flex-col gap-1.5">
                {runbook.steps.map((step) => (
                  <li key={step.id} className="rounded-xl bg-stone-50 px-3 py-2.5">
                    <p className="tabular-nums text-[11px] font-black text-accent-dark">
                      {step.startTime}〜{step.endTime}
                    </p>
                    <p className="mt-0.5 text-[12px] font-bold text-stone-800">{step.label}</p>
                    <p className="mt-0.5 text-[10px] leading-relaxed text-stone-500">→ {step.outputs}</p>
                  </li>
                ))}
              </ol>
              {runbook.note && <p className="mt-1.5 text-[10px] leading-relaxed text-stone-400">{runbook.note}</p>}
            </Section>
          )}

          <TaskOrganizeMenu task={task} onDone={onClose} />
        </div>
      </div>

      {rescheduleOpen && (
        <RescheduleDialog
          task={task}
          currentBlock={nextBlock}
          today={today}
          effectiveDeadline={taskDeadline}
          onCancel={() => setRescheduleOpen(false)}
          onConfirm={applyReschedule}
        />
      )}

      {outcomeSheetOpen && outcome && (
        <OutcomeDetailSheet outcome={outcome} onClose={() => setOutcomeSheetOpen(false)} />
      )}
    </div>
  );
}

function WhyPart({ label, body, tone = "normal" }: { label: string; body: string; tone?: "normal" | "accent" }) {
  return (
    <div className={`rounded-xl px-3 py-2.5 ${tone === "accent" ? "bg-accent-soft" : "bg-stone-50"}`}>
      <p className={`text-[10px] font-black tracking-wide ${tone === "accent" ? "text-accent-dark" : "text-stone-400"}`}>
        {label}
      </p>
      <p className="mt-0.5 text-[12px] leading-relaxed text-stone-700">{body}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-5 first:mt-4">
      <h3 className="mb-1.5 text-[11px] font-black tracking-wide text-stone-400">■ {title}</h3>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-stone-500">{label}</dt>
      <dd className="text-right font-bold text-stone-700">{value}</dd>
    </div>
  );
}

function SeriesRow({
  icon,
  label,
  taskTitle,
  subLabel,
  current = false,
  onClick,
}: {
  icon: string;
  label: string;
  taskTitle: string;
  subLabel?: string | null;
  current?: boolean;
  onClick?: () => void;
}) {
  const content = (
    <div className={`flex items-start gap-2 rounded-xl px-3 py-2 text-[12px] ${current ? "bg-accent-soft ring-1 ring-accent" : "bg-stone-50"}`}>
      <span className={`mt-0.5 shrink-0 text-[11px] font-bold ${current ? "text-accent-dark" : "text-stone-400"}`}>{icon}</span>
      <div className="min-w-0 flex-1">
        <p className={`text-[10px] font-bold ${current ? "text-accent-dark" : "text-stone-400"}`}>{label}</p>
        <p className={`truncate font-bold ${current ? "text-accent-dark" : "text-stone-700"}`}>{taskTitle}</p>
        {subLabel && <p className="text-[10px] text-stone-400">{subLabel}予定</p>}
      </div>
    </div>
  );
  if (!onClick) return <li>{content}</li>;
  return (
    <li>
      <button type="button" onClick={onClick} className="block w-full text-left">
        {content}
      </button>
    </li>
  );
}
