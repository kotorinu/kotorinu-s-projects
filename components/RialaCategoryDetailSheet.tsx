"use client";

import { useEffect, useState } from "react";
import { operationalAudits, tasks, workflows } from "@/lib/dummy-data";
import { formatMd } from "@/lib/date";
import { auditStatusLabel } from "@/lib/riala";
import { capabilityOwnerLabel } from "@/lib/capability";
import TaskDetailSheet from "@/components/TaskDetailSheet";
import type { AuditStatus, OperationCategory, Task } from "@/lib/types";

const statusTone: Record<AuditStatus, string> = {
  ACTIVE: "bg-accent-soft text-accent-dark",
  DONE: "bg-stone-800 text-white",
  NOT_NEEDED_NOW: "bg-stone-100 text-stone-500",
  UNKNOWN: "bg-stone-100 text-stone-500",
  BLOCKED: "bg-danger-soft text-danger",
};

export default function RialaCategoryDetailSheet({
  category,
  onClose,
}: {
  category: OperationCategory;
  onClose: () => void;
}) {
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  useEffect(() => {
    const mainEl = document.querySelector("main");
    const prev = mainEl?.style.overflow;
    if (mainEl) mainEl.style.overflow = "hidden";
    return () => {
      if (mainEl) mainEl.style.overflow = prev ?? "";
    };
  }, []);

  const categoryWorkflows = workflows.filter((w) => w.categoryId === category.id);
  const categoryAudits = operationalAudits.filter((a) => a.categoryId === category.id);
  const categoryTasks = tasks.filter((t) => t.parentOperationId === category.id);

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
              <p className="text-[11px] font-bold text-stone-400">
                CATEGORY {String(category.categoryNumber).padStart(2, "0")}
              </p>
              <p className="text-[17px] font-black leading-snug text-stone-900">{category.title}</p>
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
          <p className="mt-2 text-[13px] leading-relaxed text-stone-600">{category.purpose}</p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-[max(2rem,env(safe-area-inset-bottom))]">
          <Section title="Active Tasks">
            {categoryTasks.length === 0 ? (
              <p className="text-[12px] text-stone-400">現在このカテゴリのActual Taskはありません</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {categoryTasks.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedTask(t)}
                      className="w-full rounded-xl bg-stone-50 px-3 py-2.5 text-left"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="text-[12px] font-bold text-stone-700">{t.title}</p>
                        <span className="shrink-0 text-[11px] font-bold text-stone-400">
                          {formatMd(t.deadline)}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-stone-400">{capabilityOwnerLabel(t.aiCapability)}</p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="現在実務の棚卸し">
            <ul className="flex flex-col gap-1.5">
              {categoryAudits.map((a) => (
                <li key={a.id} className="rounded-xl bg-stone-50 px-3 py-2.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-[12px] font-bold text-stone-700">{a.title}</p>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${statusTone[a.currentStatus]}`}>
                      {auditStatusLabel(a.currentStatus)}
                    </span>
                  </div>
                  {a.evidence && <p className="mt-1 text-[11px] leading-relaxed text-stone-500">{a.evidence}</p>}
                  {a.missingInputs.length > 0 && (
                    <p className="mt-1 text-[11px] text-danger">不足：{a.missingInputs.join("・")}</p>
                  )}
                </li>
              ))}
              {categoryAudits.length === 0 && <p className="text-[12px] text-stone-400">棚卸し記録はまだありません</p>}
            </ul>
          </Section>

          <Section title="Workflow">
            {categoryWorkflows.length === 0 ? (
              <p className="text-[12px] text-stone-400">まだWorkflowは定義されていません</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {categoryWorkflows.map((w) => (
                  <li key={w.id} className="rounded-xl bg-stone-50 px-3 py-2.5">
                    <p className="text-[12px] font-bold text-stone-700">{w.title}</p>
                    <p className="mt-1 text-[11px] leading-relaxed text-stone-500">{w.description}</p>
                    <p className="mt-1.5 text-[10px] font-bold text-stone-400">
                      AI Capability：{capabilityOwnerLabel(w.aiCapability)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </div>

      {selectedTask && <TaskDetailSheet task={selectedTask} onClose={() => setSelectedTask(null)} />}
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
