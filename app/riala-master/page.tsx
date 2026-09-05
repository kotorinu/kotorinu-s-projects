"use client";

import { useState } from "react";
import Link from "next/link";
import { aiOperationMatrix, operationCategories, operationalAudits, tasks, workflows } from "@/lib/dummy-data";
import { auditStatusLabel, computeRialaStats, countAuditsByCategory } from "@/lib/riala";
import { capabilityOwnerLabel } from "@/lib/capability";
import RialaCategoryDetailSheet from "@/components/RialaCategoryDetailSheet";
import type { OperationCategory } from "@/lib/types";

export default function RialaMasterPage() {
  const [selected, setSelected] = useState<OperationCategory | null>(null);
  const stats = computeRialaStats(operationalAudits, workflows, tasks.filter((t) => t.area === "RIALA"));

  return (
    <div className="flex flex-col pb-8">
      <header className="sticky top-0 z-10 bg-gradient-to-b from-background via-background to-transparent px-5 pb-2 pt-6">
        <Link href="/tasks" className="text-xs font-bold text-stone-400">
          ＜ TASK MAP
        </Link>
        <p className="mt-1 text-xs font-bold tracking-widest text-accent-dark">RIALA</p>
        <h1 className="mt-0.5 text-[26px] font-black tracking-tight">RIALA運営</h1>
        <p className="mt-0.5 text-xs font-medium text-stone-400">
          Master（何がある）/ Workflow（どう処理する）/ Actual Task（今回やる）を分けて管理する
        </p>
      </header>

      <section className="mx-5 mt-1 grid grid-cols-5 gap-1.5">
        <StatTile label="ACTIVE" value={stats.activeTasks} tone="accent" />
        <StatTile label="BLOCKED" value={stats.blocked} tone="warning" />
        <StatTile label="UNKNOWN" value={stats.unknown} tone="neutral" />
        <StatTile label="AI READY" value={stats.aiReady} tone="accent" />
        <StatTile label="HUMAN" value={stats.humanDecision} tone="neutral" />
      </section>

      <section className="mt-5 px-5">
        <h2 className="mb-2 text-xs font-bold text-stone-400">Operations Master（7カテゴリ）</h2>
        <div className="flex flex-col gap-1.5">
          {operationCategories.map((cat) => {
            const counts = countAuditsByCategory(operationalAudits, cat.id);
            const activeTaskCount = tasks.filter((t) => t.parentOperationId === cat.id).length;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelected(cat)}
                className="flex w-full items-center gap-3 rounded-xl bg-white px-3.5 py-3 text-left shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_10px_-8px_rgba(0,0,0,0.15)]"
              >
                <span className="tabular-nums w-6 shrink-0 text-[11px] font-bold text-stone-300">
                  {String(cat.categoryNumber).padStart(2, "0")}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-bold text-stone-800">{cat.title}</p>
                  <p className="mt-0.5 text-[10px] text-stone-400">
                    ACTIVE {counts.active}・UNKNOWN {counts.unknown}・DONE {counts.done}
                    {activeTaskCount > 0 ? `・Task ${activeTaskCount}` : ""}
                  </p>
                </div>
                <span className="shrink-0 text-stone-300">＞</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="mt-5 px-5">
        <h2 className="mb-2 text-xs font-bold text-stone-400">AI Operation Matrix（候補・未確定）</h2>
        <div className="flex flex-col gap-1.5">
          {aiOperationMatrix.map((m) => (
            <div key={m.id} className="rounded-xl bg-white px-3.5 py-2.5 shadow-sm">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-[12px] font-bold text-stone-700">{m.operation}</p>
                <span className="shrink-0 text-[10px] font-bold text-stone-400">
                  {m.automationStatus === "CANDIDATE" ? "候補" : m.automationStatus === "CONFIRMED" ? "確定" : "対象外"}
                </span>
              </div>
              <p className="mt-0.5 text-[11px] text-stone-500">{capabilityOwnerLabel(m.aiCapability)}</p>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[10px] text-stone-400">
          candidateは確定扱いにしていません。「RIALA定型業務のAI移管範囲を確定する」Taskで確定させます。
        </p>
      </section>

      <section className="mt-5 px-5">
        <p className="rounded-2xl border border-dashed border-stone-200 px-4 py-3 text-[11px] leading-relaxed text-stone-400">
          {auditStatusLabel("UNKNOWN")}が多いのは、このセッションからRIALAの実際の状態（イベント予定・メンバーの移行状況・未返信DM等）を確認できないためです。実データが分かり次第、各項目のstatusを更新してください。
        </p>
      </section>

      {selected && <RialaCategoryDetailSheet category={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function StatTile({ label, value, tone }: { label: string; value: number; tone: "accent" | "warning" | "neutral" }) {
  const color = tone === "accent" ? "text-accent-dark" : tone === "warning" ? "text-danger" : "text-stone-700";
  return (
    <div className="rounded-xl bg-white px-1 py-2 text-center shadow-sm">
      <p className={`tabular-nums text-base font-black ${color}`}>{value}</p>
      <p className="text-[8px] font-bold text-stone-400">{label}</p>
    </div>
  );
}
