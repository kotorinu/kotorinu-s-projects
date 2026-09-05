"use client";

import { useEffect, useState } from "react";
import { capabilityAction, capabilityOwnerLabel } from "@/lib/capability";
import { problemDecompositionKnowledge } from "@/lib/dummy-data";
import type { RecurringRule } from "@/lib/types";

export default function RecurringDetailSheet({
  rule,
  streak,
  onClose,
  onViewOutcome,
}: {
  rule: RecurringRule;
  streak: number;
  onClose: () => void;
  onViewOutcome: () => void;
}) {
  const [requested, setRequested] = useState(false);

  useEffect(() => {
    const mainEl = document.querySelector("main");
    const prev = mainEl?.style.overflow;
    if (mainEl) mainEl.style.overflow = "hidden";
    return () => {
      if (mainEl) mainEl.style.overflow = prev ?? "";
    };
  }, []);

  const action = capabilityAction(rule.aiCapability);
  const linkedKnowledge = problemDecompositionKnowledge.filter((k) => k.relatedRecurringRuleId === rule.id);

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center">
      <button type="button" aria-label="閉じる" onClick={onClose} className="absolute inset-0 bg-stone-900/45" />

      <div className="relative flex max-h-[85dvh] w-full max-w-[430px] flex-col rounded-t-3xl bg-white shadow-2xl">
        <div className="flex shrink-0 justify-center pt-2.5">
          <span className="h-1 w-9 rounded-full bg-stone-200" />
        </div>

        <div className="shrink-0 px-5 pb-3 pt-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[17px] font-black leading-snug text-stone-900">{rule.title}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] font-bold text-stone-500">
                <span className="rounded-full bg-stone-100 px-2 py-0.5 text-stone-600">{rule.area}</span>
                <span>毎日</span>
                {streak > 0 && <span className="text-accent-dark">{streak}日連続</span>}
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
              {rule.definitionOfDone.map((d, i) => (
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
            <p className="text-[13px] leading-relaxed text-stone-700">{rule.description}</p>
          </Section>

          <Section title="なぜやる？">
            <p className="text-[13px] leading-relaxed text-stone-700">{rule.why}</p>
          </Section>

          <Section title="媒体">
            <div className="flex flex-wrap gap-1.5">
              {rule.allowedMedium.map((m) => (
                <span key={m} className="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-bold text-stone-600">
                  {m}
                </span>
              ))}
            </div>
          </Section>

          {rule.outcomeId && (
            <Section title="上位Outcome">
              <button
                type="button"
                onClick={onViewOutcome}
                className="text-[12px] font-bold text-accent-dark"
              >
                ＞ 60日チャレンジを見る
              </button>
            </Section>
          )}

          {linkedKnowledge.length > 0 && (
            <Section title="関連Knowledge">
              {linkedKnowledge.map((k) => (
                <div key={k.id} className="rounded-2xl bg-stone-50 px-3.5 py-3">
                  <p className="text-[12px] font-bold text-stone-700">{k.title}</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-stone-500">{k.purpose}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {k.perspectives.map((p) => (
                      <span
                        key={p.id}
                        className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-stone-500"
                      >
                        {p.label}
                      </span>
                    ))}
                  </div>
                  {k.caveat && <p className="mt-2 text-[10px] leading-relaxed text-stone-400">{k.caveat}</p>}
                </div>
              ))}
            </Section>
          )}

          <Section title="AIができること">
            {action.buttonLabel && (
              <div className="rounded-2xl bg-accent-soft px-3.5 py-3">
                <p className="text-[13px] font-bold text-accent-dark">🤝 {action.headline}</p>
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

          <Section title="予定">
            <dl className="flex flex-col gap-1.5 text-[13px]">
              <Row label="予定時間" value={rule.estimateMinutes !== null ? `${rule.estimateMinutes}分` : "未設定"} />
              <Row label="頻度" value="毎日" />
              <Row label="担当" value={capabilityOwnerLabel(rule.aiCapability)} />
              <Row label="連続日数" value={`${streak}日`} />
            </dl>
            <p className="mt-2 text-[10px] text-stone-400">
              実績時間の記録はPhase1では未実装です（データモデルのみ用意済み）
            </p>
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
