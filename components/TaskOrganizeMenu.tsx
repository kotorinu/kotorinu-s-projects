"use client";

import { useState } from "react";
import { tasks as allTasks } from "@/lib/dummy-data";
import { effectiveLifecycle, hasExecutionHistory } from "@/lib/taskState";
import { useTodayExecution } from "@/lib/todayExecutionStore";
import type { Task, TaskLifecycle } from "@/lib/types";

// 「Taskを整理」(2026-09-08, §4).
//
// A Task that is no longer needed must be able to leave the list — otherwise
// the inventory only ever grows and stops being trustworthy. But leaving is
// not the same as never having existed:
//
//   A. mis-entry / exact duplicate, no execution history → really delete
//   B. anything with a completion, a measured span or a started timer →
//      ARCHIVED / MERGED only, so the measurement survives
//
// The distinction is enforced here, not left to the user's memory: the
// delete option is simply absent once a Task has history, and says why.
const LIFECYCLE_LABEL: Record<TaskLifecycle, string> = {
  ACTIVE: "実行中の計画",
  BACKLOG: "Backlog（実行日時が未定）",
  SUPERSEDED: "置き換え済み",
  MERGED: "他のTaskへ統合",
  ARCHIVED: "Archive",
  DELETED: "削除（誤登録）",
};

export default function TaskOrganizeMenu({ task, onDone }: { task: Task; onDone: () => void }) {
  const { completions, lifecycleOverrides, taskStartedAt, currentDate, setTaskLifecycle } = useTodayExecution();
  const [open, setOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeTargetId, setMergeTargetId] = useState("");

  const current = effectiveLifecycle(task, { lifecycleOverrides });
  const hasHistory = hasExecutionHistory(task, { completions }, new Set(taskStartedAt.keys()));
  const overridden = lifecycleOverrides[task.id] !== undefined;

  function apply(lifecycle: TaskLifecycle, reason: string, replacedByTaskId: string | null = null) {
    setTaskLifecycle(
      {
        taskId: task.id,
        lifecycle,
        reason,
        decidedOnDate: currentDate,
        decidedAt: new Date().toISOString(),
        replacedByTaskId,
      },
      task.id
    );
    setOpen(false);
    setMergeOpen(false);
    onDone();
  }

  // Merge targets: other live Tasks in the same area, so the work has an
  // obvious new home rather than vanishing.
  const mergeCandidates = allTasks.filter(
    (t) =>
      t.id !== task.id &&
      t.area === task.area &&
      ["ACTIVE", "BACKLOG"].includes(effectiveLifecycle(t, { lifecycleOverrides }))
  );

  return (
    <div className="mt-4 border-t border-stone-100 pt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="text-[11px] font-black tracking-wide text-stone-400">Taskを整理</span>
        <span className="text-[11px] font-bold text-stone-400">{open ? "▾" : "▸"}</span>
      </button>

      {current !== "ACTIVE" && (
        <p className="mt-1.5 inline-block rounded-full bg-stone-800 px-2 py-0.5 text-[10px] font-bold text-white">
          {LIFECYCLE_LABEL[current]}
        </p>
      )}
      {task.lifecycleReason && !overridden && (
        <p className="mt-1 text-[10px] leading-relaxed text-stone-400">{task.lifecycleReason}</p>
      )}
      {overridden && (
        <p className="mt-1 text-[10px] leading-relaxed text-stone-400">
          {lifecycleOverrides[task.id].reason}
        </p>
      )}

      {open && (
        <div className="mt-2 flex flex-col gap-1.5">
          {current !== "BACKLOG" && (
            <OrganizeButton
              label="Backlogへ戻す"
              hint="やる意思はあるが、実行日時をまだ決めない"
              onClick={() => apply("BACKLOG", "実行日時が決まっていないため、実行計画から外した")}
            />
          )}
          {current !== "ACTIVE" && (
            <OrganizeButton
              label="実行計画へ戻す"
              hint="実行日時を決めたうえで戻す"
              onClick={() => {
                setTaskLifecycle(null, task.id);
                onDone();
              }}
            />
          )}
          <OrganizeButton
            label="Archiveする"
            hint="現役ではないが、記録として残す"
            onClick={() => apply("ARCHIVED", "現在の実行計画には不要と判断してArchiveした")}
          />
          <OrganizeButton
            label="他のTaskへ統合する"
            hint="重複しているTaskをまとめる"
            onClick={() => setMergeOpen((v) => !v)}
          />

          {mergeOpen && (
            <div className="rounded-xl bg-stone-50 px-3 py-2.5">
              <p className="text-[11px] font-bold text-stone-500">統合先のTask</p>
              <select
                value={mergeTargetId}
                onChange={(e) => setMergeTargetId(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-[12px] text-stone-700"
              >
                <option value="">選択してください</option>
                {mergeCandidates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!mergeTargetId}
                onClick={() =>
                  apply(
                    "MERGED",
                    `重複していたため「${mergeCandidates.find((t) => t.id === mergeTargetId)?.title}」へ統合した`,
                    mergeTargetId
                  )
                }
                className={`mt-2 w-full rounded-full px-3 py-1.5 text-[11px] font-bold ${
                  mergeTargetId ? "bg-stone-800 text-white" : "bg-stone-100 text-stone-300"
                }`}
              >
                このTaskへ統合する
              </button>
            </div>
          )}

          {hasHistory ? (
            <p className="rounded-xl bg-stone-50 px-3 py-2.5 text-[10px] leading-relaxed text-stone-500">
              このTaskには実行履歴（開始・完了・実績時間）があるため、削除はできません。Archiveまたは統合を使ってください——履歴を消すと、見積りと実績の差分が追えなくなります。
            </p>
          ) : (
            <OrganizeButton
              label="誤登録として削除する"
              hint="実行履歴がないので完全に消せます"
              tone="danger"
              onClick={() => apply("DELETED", "誤登録として削除した（実行履歴なし）")}
            />
          )}
        </div>
      )}
    </div>
  );
}

function OrganizeButton({
  label,
  hint,
  onClick,
  tone = "normal",
}: {
  label: string;
  hint: string;
  onClick: () => void;
  tone?: "normal" | "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl px-3 py-2.5 text-left ${tone === "danger" ? "bg-danger-soft" : "bg-stone-50"}`}
    >
      <p className={`text-[12px] font-bold ${tone === "danger" ? "text-danger" : "text-stone-700"}`}>{label}</p>
      <p className="mt-0.5 text-[10px] leading-relaxed text-stone-500">{hint}</p>
    </button>
  );
}
