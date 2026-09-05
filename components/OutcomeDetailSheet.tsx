"use client";

import { useEffect } from "react";
import Link from "next/link";
import { fixedCalendarEvents, recurringRules, tasks, weeklyReadings } from "@/lib/dummy-data";
import { confidenceLabel, planningConstraintLabel } from "@/lib/calendar";
import { formatMd } from "@/lib/date";
import { computeProgress } from "@/lib/progress";
import ProgressBar from "@/components/ProgressBar";
import type { Outcome } from "@/lib/types";

const statusLabel: Record<Outcome["status"], string> = {
  ACTIVE: "進行中",
  PROVISIONAL: "仮説",
  COMPLETE: "達成",
};

export default function OutcomeDetailSheet({ outcome, onClose }: { outcome: Outcome; onClose: () => void }) {
  useEffect(() => {
    const mainEl = document.querySelector("main");
    const prev = mainEl?.style.overflow;
    if (mainEl) mainEl.style.overflow = "hidden";
    return () => {
      if (mainEl) mainEl.style.overflow = prev ?? "";
    };
  }, []);

  const linkedRules = recurringRules.filter((r) => r.outcomeId === outcome.id);
  const linkedTasks = tasks.filter((t) => t.outcomeId === outcome.id);
  const linkedReadings = weeklyReadings.filter((r) => r.outcomeId === outcome.id);
  const linkedFixedEvents = fixedCalendarEvents.filter((e) => e.relatedOutcomeId === outcome.id);
  const taskProgress = computeProgress(linkedTasks);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button type="button" aria-label="閉じる" onClick={onClose} className="absolute inset-0 bg-stone-900/45" />

      <div className="relative flex max-h-[85dvh] w-full max-w-[430px] flex-col rounded-t-3xl bg-white shadow-2xl">
        <div className="flex shrink-0 justify-center pt-2.5">
          <span className="h-1 w-9 rounded-full bg-stone-200" />
        </div>

        <div className="shrink-0 px-5 pb-3 pt-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[17px] font-black leading-snug text-stone-900">{outcome.title}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] font-bold text-stone-500">
                <span className="rounded-full bg-stone-100 px-2 py-0.5 text-stone-600">{outcome.area}</span>
                <span className="rounded-full bg-accent-soft px-2 py-0.5 text-accent-dark">
                  {statusLabel[outcome.status]}
                </span>
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

          {linkedTasks.length > 0 && (
            <div className="mt-3 rounded-2xl bg-stone-50 px-3.5 py-3">
              <div className="flex items-baseline justify-between">
                <h3 className="text-[11px] font-black tracking-wide text-stone-400">■ Task Progress</h3>
                <span className="tabular-nums text-[11px] font-bold text-stone-500">
                  {taskProgress.done}/{taskProgress.total} 完了
                </span>
              </div>
              <div className="mt-1.5">
                <ProgressBar pct={taskProgress.pct} size="sm" />
              </div>
              <p className="mt-1.5 text-[10px] text-stone-400">
                タスクを終えることと、下の達成条件を満たすことは別です。100%＝達成ではありません。
              </p>
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-[max(2rem,env(safe-area-inset-bottom))]">
          <Section title="目指す状態">
            <p className="text-[13px] leading-relaxed text-stone-700">{outcome.desiredState}</p>
            {outcome.id === "o-riala-ai-ops" && (
              <Link href="/riala-master" className="mt-2 inline-block text-[12px] font-bold text-accent-dark">
                ＞ RIALA運営を見る
              </Link>
            )}
          </Section>

          <Section title="なぜ？">
            <p className="text-[13px] leading-relaxed text-stone-700">{outcome.why}</p>
          </Section>

          <Section title="達成条件（Achievement Progress）">
            <ul className="flex flex-col gap-1.5">
              {outcome.achievementCriteria.map((c, i) => (
                <li key={i} className="flex items-start gap-1.5 text-[13px] leading-relaxed text-stone-700">
                  <span className="mt-0.5 text-stone-300">□</span>
                  {c}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[10px] text-stone-400">
              達成度の自動判定はPhase1では未実装です（自己申告・実績記録は将来追加）
            </p>
          </Section>

          {linkedRules.length > 0 && (
            <Section title="Recurring Rules">
              <ul className="flex flex-col gap-1.5">
                {linkedRules.map((r) => (
                  <li key={r.id} className="rounded-xl bg-stone-50 px-3 py-2.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-[12px] font-bold text-stone-700">{r.title}</p>
                      <span className="shrink-0 text-[11px] font-bold text-accent-dark">
                        {r.streakDays > 0 ? `${r.streakDays}日連続` : "継続前"}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {linkedFixedEvents.length > 0 && (
            <Section title="固定予定（Planning Constraint）">
              <ul className="flex flex-col gap-1.5">
                {linkedFixedEvents.map((e) => {
                  const constraintLabel = planningConstraintLabel(e.planningConstraint);
                  const dateLabel =
                    e.startDate === e.endDate ? formatMd(e.startDate) : `${formatMd(e.startDate)}〜${formatMd(e.endDate)}`;
                  return (
                    <li key={e.id} className="rounded-xl bg-stone-50 px-3 py-2.5">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="text-[12px] font-bold text-stone-700">{e.title}</p>
                        <span className="shrink-0 text-[11px] font-bold text-stone-400">{dateLabel}</span>
                      </div>
                      {constraintLabel && (
                        <span className="mt-1 inline-block rounded-full bg-stone-800 px-2 py-0.5 text-[10px] font-bold text-white">
                          {constraintLabel}
                        </span>
                      )}
                      {e.notes && <p className="mt-1.5 text-[11px] leading-relaxed text-stone-500">{e.notes}</p>}
                    </li>
                  );
                })}
              </ul>
              <p className="mt-2 text-[10px] text-stone-400">
                この期間は通常と同じ実行量を前提にしない。詳細はTASK MAP最下部の「固定予定」参照。
              </p>
            </Section>
          )}

          {linkedReadings.length > 0 && (
            <Section title="Weekly Reading（毎週1冊）">
              <ul className="flex flex-col gap-1.5">
                {linkedReadings.map((r) => (
                  <li key={r.id} className="rounded-xl bg-stone-50 px-3 py-2.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-[12px] font-bold text-stone-700">{r.bookTitle}</p>
                      <span className="shrink-0 text-[10px] font-bold text-stone-400">
                        {r.targetDate ?? "読了予定日未確認"}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[10px] text-stone-400">
                Google Calendarに登録された書籍として{confidenceLabel("CONFIRMED_WEEKLY_READING")}扱い。上記は本人が挙げた例で、他にもCalendar上に予定がある可能性あり。
              </p>
            </Section>
          )}

          {linkedTasks.length > 0 && (
            <Section title="関連Task">
              <ul className="flex flex-col gap-1.5">
                {linkedTasks.map((t) => (
                  <li key={t.id} className="rounded-xl bg-stone-50 px-3 py-2.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <p
                        className={`text-[12px] font-bold text-stone-700 ${
                          t.status === "完了" ? "text-stone-400 line-through" : ""
                        }`}
                      >
                        {t.title}
                      </p>
                      <span className="shrink-0 text-[11px] font-bold text-stone-400">{t.status}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </Section>
          )}
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
