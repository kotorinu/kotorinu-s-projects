"use client";

import { useEffect, useState } from "react";
import { liveSalesFeedback, practitionerFeedback, roleplayFeedback } from "@/lib/dummy-data";
import { feedbackForPhase, masteryStatusLabel } from "@/lib/sales";
import PhaseOwnVersionEditor from "@/components/PhaseOwnVersionEditor";
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
          {/* ① 基礎 — 教材。読むもの。本人の進捗ではない (§P9). */}
          <SourceSection>
            {hasBasics ? (
              <div className="flex flex-col gap-3 text-[13px] leading-relaxed text-stone-700">
                {phase.purpose && (
                  <div>
                    <p className="text-[10px] font-black tracking-wide text-stone-400">目的</p>
                    <p className="mt-0.5">{phase.purpose}</p>
                  </div>
                )}
                {phase.okConditions.length > 0 ? (
                  <TickList label="OK状態（次へ進む条件）" items={phase.okConditions} />
                ) : (
                  phase.okState && (
                    <div>
                      <p className="text-[10px] font-black tracking-wide text-stone-400">OK状態</p>
                      <p className="mt-0.5">{phase.okState}</p>
                    </div>
                  )
                )}
                {phase.checkPoints.length > 0 && <ListField label="確認すること" items={phase.checkPoints} />}
                {/* 質問例とNG例は最初から開かない。全部展開すると文字壁になり、
                    肝心の目的とOK状態が読まれなくなる (§P8). */}
                {phase.sourceQuestions.length > 0 && (
                  <Collapsible label="質問例" count={phase.sourceQuestions.length} items={phase.sourceQuestions} />
                )}
                {phase.ngExamples.length > 0 && (
                  <Collapsible label="NG例" count={phase.ngExamples.length} items={phase.ngExamples} />
                )}
              </div>
            ) : (
              <p className="rounded-xl bg-stone-50 px-3 py-2.5 text-[12px] text-stone-400">
                営業フェーズ分解ワークシートの内容がまだ登録されていません。ワークシートを共有いただければ反映します。
              </p>
            )}
          </SourceSection>

          {/* ①を読んで終わりにしない導線 (§P10). */}
          {hasBasics && (
            <p className="mt-4 rounded-xl bg-accent-soft px-3 py-2.5 text-[12px] font-bold leading-relaxed text-accent-dark">
              この内容を、自分ならどう説明する？
            </p>
          )}

          <OwnSection>
            <PhaseOwnVersionEditor phase={phase} />
            {phase.myTransitionTalk.length > 0 && (
              <div className="mt-2">
                <ListFieldOrEmpty label="次フェーズへのつなぎ" items={phase.myTransitionTalk} />
              </div>
            )}
          </OwnSection>

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

// ① と ② は性質が違うので、見出しだけでなく面ごと分ける (§P9)。
// ①は与えられた教材（灰・SOURCE表記）、②は本人が書くもの（アクセント色・
// USER表記）。同じ見た目にすると「17/17できた」と本人の進捗が混ざる。
function SourceSection({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 rounded-2xl border border-stone-150 bg-stone-50/60 px-3.5 py-3">
      <div className="mb-2 flex items-baseline gap-2">
        <h3 className="text-[11px] font-black tracking-wide text-stone-500">① 基礎</h3>
        <span className="rounded-full bg-stone-200/70 px-1.5 py-0.5 text-[9px] font-bold text-stone-500">
          SOURCE 営業ワークシート
        </span>
      </div>
      {children}
    </div>
  );
}

function OwnSection({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-2 rounded-2xl border border-accent-soft bg-white px-3.5 py-3">
      <div className="mb-2 flex items-baseline gap-2">
        <h3 className="text-[11px] font-black tracking-wide text-accent-dark">② 自分版</h3>
        <span className="rounded-full bg-accent-soft px-1.5 py-0.5 text-[9px] font-bold text-accent-dark">
          YOU 琴音さんの理解
        </span>
      </div>
      {children}
    </div>
  );
}

/** OK状態は「満たしたかどうか」なので ・ ではなく ✓ で並べる (§P8). */
function TickList({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <p className="text-[10px] font-black tracking-wide text-stone-400">{label}</p>
      <ul className="mt-1 flex flex-col gap-1">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-1.5">
            <span className="mt-[3px] shrink-0 text-[11px] font-black text-emerald-500">✓</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 参考情報は畳んでおく。件数だけ見せて、必要な時だけ開く (§P8). */
function Collapsible({ label, count, items }: { label: string; count: number; items: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 text-left"
      >
        <span className="text-[10px] font-black tracking-wide text-stone-400">{label}</span>
        <span className="tabular-nums text-[10px] font-bold text-stone-300">{count}件</span>
        <span className="ml-auto text-[10px] font-bold text-accent-dark">{open ? "閉じる" : "見る"}</span>
      </button>
      {open && (
        <ul className="mt-1 flex flex-col gap-1">
          {items.map((item, i) => (
            <li key={i} className="flex items-start gap-1.5">
              <span className="mt-0.5 shrink-0 text-stone-300">・</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
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
