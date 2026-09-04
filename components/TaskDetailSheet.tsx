"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { goals, monthEndStates, tasks as allTasks } from "@/lib/dummy-data";
import { formatMd, monthKeyOf } from "@/lib/date";
import { computeGoalProgress } from "@/lib/progress";
import { capabilityAction, capabilityOwnerLabel } from "@/lib/capability";
import ProgressBar from "@/components/ProgressBar";
import type { Task } from "@/lib/types";

export default function TaskDetailSheet({ task, onClose }: { task: Task; onClose: () => void }) {
  const [checkedSteps, setCheckedSteps] = useState<Set<number>>(new Set());
  const [requested, setRequested] = useState(false);

  useEffect(() => {
    const mainEl = document.querySelector("main");
    const prev = mainEl?.style.overflow;
    if (mainEl) mainEl.style.overflow = "hidden";
    return () => {
      if (mainEl) mainEl.style.overflow = prev ?? "";
    };
  }, []);

  const goal = task.goalId ? goals.find((g) => g.id === task.goalId) ?? null : null;
  const goalProgress = goal ? computeGoalProgress(allTasks, goal.id) : null;
  const areaOutcome = !goal
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
    <div className="fixed inset-0 z-40 flex items-end justify-center">
      <button
        type="button"
        aria-label="閉じる"
        onClick={onClose}
        className="absolute inset-0 bg-stone-900/45"
      />

      <div className="relative flex max-h-[85dvh] w-full max-w-[430px] flex-col rounded-t-3xl bg-white shadow-2xl">
        <div className="flex shrink-0 justify-center pt-2.5">
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
          </Section>

          <Section title="なぜやる？">
            <p className="text-[13px] leading-relaxed text-stone-700">{task.why}</p>
          </Section>

          {(goal || areaOutcome) && (
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

          <Section title="予定・実績">
            <dl className="flex flex-col gap-1.5 text-[13px]">
              <Row label="予定時間" value={`${task.estimateMinutes}分`} />
              <Row label="期限" value={formatMd(task.deadline)} />
              <Row label="担当" value={capabilityOwnerLabel(task.aiCapability)} />
              {task.actualMinutes !== null && (
                <Row label="実績" value={`${task.estimateMinutes}分 → ${task.actualMinutes}分`} />
              )}
              {task.overrunReason && <Row label="理由" value={task.overrunReason} />}
              {task.nextImprovement && <Row label="次回改善" value={task.nextImprovement} />}
            </dl>
          </Section>
        </div>
      </div>
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
