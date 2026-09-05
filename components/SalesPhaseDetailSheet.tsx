"use client";

import { useEffect } from "react";
import { liveSalesFeedback, practitionerFeedback, roleplayFeedback } from "@/lib/dummy-data";
import { feedbackForPhase, masteryStatusLabel } from "@/lib/sales";
import type { SalesPhase } from "@/lib/types";

export default function SalesPhaseDetailSheet({ phase, onClose }: { phase: SalesPhase; onClose: () => void }) {
  useEffect(() => {
    const mainEl = document.querySelector("main");
    const prev = mainEl?.style.overflow;
    if (mainEl) mainEl.style.overflow = "hidden";
    return () => {
      if (mainEl) mainEl.style.overflow = prev ?? "";
    };
  }, []);

  const linkedPractitionerFb = feedbackForPhase(practitionerFeedback, phase.id);
  const linkedRoleplayFb = feedbackForPhase(roleplayFeedback, phase.id);
  const linkedLiveFb = feedbackForPhase(liveSalesFeedback, phase.id);

  const hasBasics = phase.purpose || phase.okState || phase.checkPoints.length > 0;

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center lg:items-stretch lg:justify-end">
      <button type="button" aria-label="閉じる" onClick={onClose} className="absolute inset-0 bg-stone-900/45" />

      <div className="relative flex max-h-[85dvh] w-full max-w-[430px] flex-col rounded-t-3xl bg-white shadow-2xl lg:max-h-none lg:h-full lg:w-[480px] lg:max-w-[480px] lg:rounded-none lg:rounded-l-3xl">
        <div className="flex shrink-0 justify-center pt-2.5 lg:hidden">
          <span className="h-1 w-9 rounded-full bg-stone-200" />
        </div>

        <div className="shrink-0 px-5 pb-3 pt-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-bold text-stone-400">
                PHASE {String(phase.phaseNumber).padStart(2, "0")}
              </p>
              <p className="text-[17px] font-black leading-snug text-stone-900">{phase.title}</p>
              <span className="mt-1 inline-block rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-bold text-accent-dark">
                {masteryStatusLabel(phase.masteryStatus)}
              </span>
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
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-[max(2rem,env(safe-area-inset-bottom))]">
          <Section title="① 基礎">
            {hasBasics ? (
              <div className="flex flex-col gap-2 text-[13px] leading-relaxed text-stone-700">
                {phase.purpose && (
                  <Field label="目的" value={phase.purpose} />
                )}
                {phase.okState && <Field label="OK状態" value={phase.okState} />}
                {phase.checkPoints.length > 0 && <ListField label="確認事項" items={phase.checkPoints} />}
                {phase.sourceQuestions.length > 0 && <ListField label="質問例" items={phase.sourceQuestions} />}
                {phase.ngExamples.length > 0 && <ListField label="NG例" items={phase.ngExamples} />}
              </div>
            ) : (
              <p className="rounded-xl bg-stone-50 px-3 py-2.5 text-[12px] text-stone-400">
                営業フェーズ分解ワークシートの内容がまだ登録されていません。ワークシートを共有いただければ反映します。
              </p>
            )}
          </Section>

          <Section title="② 自分版">
            <div className="flex flex-col gap-2 text-[13px] leading-relaxed text-stone-700">
              {phase.myUnderstanding ? (
                <Field label="自分の理解" value={phase.myUnderstanding} />
              ) : (
                <EmptyNote text="まだ書かれていません" />
              )}
              <ListFieldOrEmpty label="自分の質問" items={phase.myQuestions} />
              <ListFieldOrEmpty label="自分のトーク" items={phase.myTalkExamples} />
              <ListFieldOrEmpty label="次フェーズへのつなぎ" items={phase.myTransitionTalk} />
            </div>
          </Section>

          <Section title="③ 実践者FB">
            {linkedPractitionerFb.length === 0 ? (
              <EmptyNote text="このフェーズに紐づく実践者FBはまだありません" />
            ) : (
              <ul className="flex flex-col gap-2">
                {linkedPractitionerFb.map((fb) => (
                  <li key={fb.id} className="rounded-xl bg-stone-50 px-3 py-2.5">
                    <p className="text-[12px] font-bold text-stone-700">{fb.title}</p>
                    <p className="mt-1 text-[12px] leading-relaxed text-stone-600">{fb.lesson}</p>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="④ 案件固有知識">
            <ListFieldOrEmpty label="" items={phase.caseSpecificKnowledge} emptyText="まだありません" />
          </Section>

          <Section title="⑤ 自分のロープレFB">
            {linkedRoleplayFb.length === 0 ? (
              <EmptyNote text="ロープレはまだ実施していません" />
            ) : (
              <ul className="flex flex-col gap-1.5">
                {linkedRoleplayFb.map((fb) => (
                  <li key={fb.id} className="rounded-xl bg-stone-50 px-3 py-2.5 text-[12px] text-stone-600">
                    {fb.date ?? "日付未記録"}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="⑥ 実商談FB">
            {linkedLiveFb.length === 0 ? (
              <EmptyNote text="実商談はまだ開始していません" />
            ) : (
              <ul className="flex flex-col gap-1.5">
                {linkedLiveFb.map((fb) => (
                  <li key={fb.id} className="rounded-xl bg-stone-50 px-3 py-2.5 text-[12px] text-stone-600">
                    {fb.date ?? "日付未記録"}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="⑦ 次回改善">
            <ListFieldOrEmpty label="" items={phase.nextImprovement} emptyText="まだありません" />
          </Section>

          <Section title="⑧ 改善履歴">
            <ListFieldOrEmpty label="" items={phase.improvementHistory} emptyText="まだありません" />
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-5 first:mt-4">
      <h3 className="mb-1.5 text-[11px] font-black tracking-wide text-stone-400">{title}</h3>
      {children}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <p>
      <span className="font-bold text-stone-400">{label}　</span>
      {value}
    </p>
  );
}

function ListField({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <p className="font-bold text-stone-400">{label}</p>
      <ul className="mt-1 flex flex-col gap-1">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-1.5">
            <span className="mt-0.5 text-stone-300">・</span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ListFieldOrEmpty({ label, items, emptyText = "まだ書かれていません" }: { label: string; items: string[]; emptyText?: string }) {
  if (items.length === 0) return <EmptyNote text={emptyText} />;
  return (
    <div className="text-[13px] leading-relaxed text-stone-700">
      {label && <p className="font-bold text-stone-400">{label}</p>}
      <ul className={label ? "mt-1 flex flex-col gap-1" : "flex flex-col gap-1"}>
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-1.5">
            <span className="mt-0.5 text-stone-300">・</span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function EmptyNote({ text }: { text: string }) {
  return <p className="text-[12px] text-stone-400">{text}</p>;
}
