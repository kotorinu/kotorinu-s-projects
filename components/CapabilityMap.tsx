"use client";

import { useState } from "react";
import { AREA_THEME } from "@/lib/areaTheme";
import type { Capability } from "@/lib/types";

// GENESIS Capability Map (2026-09-09, P2-6/P2-7/P16).
//
// The point of GENESIS is portable skill, so measuring it by task-completion
// percentage would be measuring the wrong thing entirely — it would say how
// many boxes were ticked, not whether the ability exists.
//
// Each capability therefore shows only what can be pointed at: what it is
// practised through, what evidence exists so far, what is missing now, and
// what the next practice is. No invented 72点 / 80%.
export default function CapabilityMap({ capabilities }: { capabilities: Capability[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const theme = AREA_THEME.GENESIS;

  return (
    <div className="flex flex-col gap-1.5">
      {capabilities.map((c) => {
        const isOpen = openId === c.id;
        return (
          <div
            key={c.id}
            className="rounded-xl border bg-white"
            style={{ borderColor: "#EAE8E6", borderLeftWidth: 3, borderLeftColor: theme.primary }}
          >
            <button
              type="button"
              onClick={() => setOpenId(isOpen ? null : c.id)}
              className="w-full px-3 py-2.5 text-left"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[13px] font-bold text-stone-800">{c.title}</span>
                <span className="shrink-0 text-[10px] font-bold text-stone-300">
                  証拠 {c.evidence.length}件 {isOpen ? "▾" : "▸"}
                </span>
              </div>
              <p className="mt-0.5 line-clamp-1 text-[11px] text-stone-500">いま足りない　{c.currentGap}</p>
            </button>

            {isOpen && (
              <div className="border-t border-stone-100 px-3 py-2.5">
                <Field label="なぜ鍛えるか" body={c.why} />
                <div className="mt-2">
                  <p className="text-[10px] font-bold text-stone-400">練習していること</p>
                  <ul className="mt-1 flex flex-wrap gap-1">
                    {c.practices.map((p) => (
                      <li
                        key={p}
                        className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                        style={{ backgroundColor: theme.soft, color: theme.text }}
                      >
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="mt-2">
                  <p className="text-[10px] font-bold text-stone-400">証拠（Evidence）</p>
                  {c.evidence.length === 0 ? (
                    <p className="mt-0.5 text-[11px] text-stone-400">
                      まだありません。実行した記録がここに溜まります。
                    </p>
                  ) : (
                    <ul className="mt-0.5 flex flex-col gap-0.5">
                      {c.evidence.map((e) => (
                        <li key={e} className="text-[11px] leading-relaxed text-stone-600">
                          ・{e}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <Field label="次の練習" body={c.nextPractice} accent />
              </div>
            )}
          </div>
        );
      })}
      <p className="mt-1 text-[10px] leading-relaxed text-stone-400">
        点数はつけません。Task完了率は「何個やったか」であって、能力が身についたかとは別のためです。
      </p>
    </div>
  );
}

function Field({ label, body, accent = false }: { label: string; body: string; accent?: boolean }) {
  return (
    <div className="mt-2 first:mt-0">
      <p className="text-[10px] font-bold text-stone-400">{label}</p>
      <p className={`mt-0.5 text-[11px] leading-relaxed ${accent ? "font-bold text-accent-dark" : "text-stone-600"}`}>
        {body}
      </p>
    </div>
  );
}
