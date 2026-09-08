"use client";

import { useState } from "react";
import { OWN_FIELDS, OWN_FIELD_LABEL, phaseOwnState, type OwnField } from "@/lib/sales";
import { useTodayExecution } from "@/lib/todayExecutionStore";
import type { SalesPhase } from "@/lib/types";

// ② 自分版の入力 (2026-09-08, §5).
//
// "0/11" only becomes actionable when the user can see which of the three
// fields is missing on each phase and fill it right there. The count is
// derived from these fields — there is no counter to increment — so writing
// one line here is what moves the number, and nothing else can.
const PLACEHOLDER: Record<OwnField, string> = {
  purpose: "つまり自分は、このフェーズで何をする？",
  okState: "相手がどうなったら次へ進んでいい？",
  means: "そのために自分ならどう聞く？",
};

const HINT: Record<OwnField, string> = {
  purpose: "ワークシートの「目的」を自分の言葉に置き換える",
  okState: "相手の状態で書く（自分がやったことではなく）",
  means: "参考の質問例をそのまま写さず、自分のお客様層に合わせる",
};

export default function PhaseOwnVersionEditor({ phase }: { phase: SalesPhase }) {
  const { phaseOwnVersions, setPhaseOwnField } = useTodayExecution();
  const state = phaseOwnState(phase, phaseOwnVersions);
  const [editing, setEditing] = useState<OwnField | null>(null);
  const [draft, setDraft] = useState("");

  function startEdit(field: OwnField) {
    setEditing(field);
    setDraft(state[field] ?? "");
  }

  function save() {
    if (editing) setPhaseOwnField(phase.id, editing, draft);
    setEditing(null);
    setDraft("");
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[11px] font-bold text-stone-500">
          自分版
          <span className="ml-1.5 tabular-nums text-[13px] font-black text-stone-800">
            {state.filled} / {OWN_FIELDS.length}
          </span>
        </p>
        {state.needsProductInfo && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
            商品情報待ち
          </span>
        )}
      </div>

      {state.needsProductInfo && (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-[10px] leading-relaxed text-amber-800">
          このフェーズは商品固有の内容（提案・価格・オファー・クロージング表現）が必要です。商品レクチャーを受けるまで、
          自分版の分母には入れていません。書ける範囲だけ書いても構いません。
        </p>
      )}

      <ul className="flex flex-col gap-1.5">
        {OWN_FIELDS.map((field) => {
          const value = state[field];
          const isEditing = editing === field;
          return (
            <li key={field} className={`rounded-xl px-3 py-2.5 ${value ? "bg-accent-soft" : "bg-stone-50"}`}>
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-[10px] font-bold text-stone-500">
                  {value ? "✓ " : "□ "}
                  {OWN_FIELD_LABEL[field]}
                </p>
                {!isEditing && (
                  <button
                    type="button"
                    onClick={() => startEdit(field)}
                    className="shrink-0 text-[10px] font-bold text-accent-dark"
                  >
                    {value ? "書き直す" : "書く"}
                  </button>
                )}
              </div>

              {isEditing ? (
                <div className="mt-1.5">
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    rows={3}
                    placeholder={PLACEHOLDER[field]}
                    className="w-full rounded-lg border border-stone-200 bg-white px-2.5 py-2 text-[12px] leading-relaxed text-stone-700"
                  />
                  <p className="mt-0.5 text-[10px] text-stone-400">{HINT[field]}</p>
                  <div className="mt-1.5 flex gap-1.5">
                    <button
                      type="button"
                      onClick={save}
                      className="rounded-full bg-accent px-3 py-1 text-[11px] font-bold text-white"
                    >
                      保存
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditing(null)}
                      className="rounded-full px-3 py-1 text-[11px] font-bold text-stone-400"
                    >
                      キャンセル
                    </button>
                    {value && (
                      <button
                        type="button"
                        onClick={() => {
                          setPhaseOwnField(phase.id, field, null);
                          setEditing(null);
                        }}
                        className="ml-auto rounded-full px-3 py-1 text-[11px] font-bold text-stone-400"
                      >
                        消す
                      </button>
                    )}
                  </div>
                </div>
              ) : value ? (
                <p className="mt-1 text-[12px] leading-relaxed text-stone-700">{value}</p>
              ) : (
                <p className="mt-0.5 text-[11px] text-stone-400">{PLACEHOLDER[field]}</p>
              )}
            </li>
          );
        })}
      </ul>

      <p className="text-[10px] leading-relaxed text-stone-400">
        3項目そろったフェーズだけを「自分版完成」として数えます。カウンターを手で増やす操作はありません。
      </p>
    </div>
  );
}
