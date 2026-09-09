"use client";

import { useMemo, useState } from "react";
import {
  DIFF_TYPE_LABEL,
  calendarActionItems,
  calendarDiff,
  type CalendarDiffItem,
  type CalendarDiffType,
} from "@/lib/calendarDiff";
import { calendarSnapshot } from "@/lib/calendarSnapshot";
import { PLAN_ISSUE_LABEL, validatePlan, type PlanIssue } from "@/lib/planValidator";
import type { Clock } from "@/lib/clock";
import type { TaskStateOverlays } from "@/lib/taskState";
import type { Task, TimeBlock } from "@/lib/types";

// 計画の状態 (2026-09-09, §17/§21〜§23 → P0で二分割).
//
// 前のバージョンは「矛盾なし・Calendar一致」を1行にまとめていた。これは嘘に
// なりうる: Validatorが見ているのはOSの内部だけで、Google Calendarが「今」
// 一致しているかは誰も知らない。このアプリはCalendarを読み書きできないので、
// 分かるのは「いつ照合したか」だけ。
//
// だから2つに分ける:
//   OS内部          いま計算した結果。断言してよい
//   Google Calendar 照合した時刻の記録。「現在一致」とは絶対に言わない
//
// そしてsnapshotを読んだ後に予定を動かしたなら、その照合はもう古い。

const TONE: Record<CalendarDiffType, { bg: string; text: string }> = {
  UPDATE: { bg: "bg-amber-100", text: "text-amber-900" },
  DELETE: { bg: "bg-rose-100", text: "text-rose-900" },
  CREATE: { bg: "bg-sky-100", text: "text-sky-900" },
  UNKNOWN: { bg: "bg-stone-150", text: "text-stone-600" },
  MATCHED: { bg: "bg-emerald-100", text: "text-emerald-900" },
};

/**
 * "2026/09/09 00:00" — 日付だけだと「今日照合した」に見えてしまう。
 *
 * new Date(iso).getHours() は絶対に使わない。このページは静的プリレンダリング
 * されるので、UTCのビルドマシンは 09/08 15:00、JSTのブラウザは 09/09 00:00 と
 * 表示し、hydration mismatch (React #418) になる。snapshot.readAt は自分の
 * オフセット(+09:00)を文字列として持っているので、その場で切り出せば
 * サーバでもブラウザでも同じ結果になる。
 */
function formatStamp(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso);
  if (!m) return iso;
  const [, y, mo, d, h, mi] = m;
  return `${y}/${mo}/${d} ${h}:${mi}`;
}

/**
 * 予定を動かした時刻。UTCのISO文字列なので、閲覧者のローカル時刻へ直して出す。
 * これが描画されるのは snapshotStale が true のとき——つまりブラウザ側で予定を
 * 動かした後だけなので、サーバ描画とは比較されない。
 */
function formatLocalStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function DiffRow({ item }: { item: CalendarDiffItem }) {
  const tone = TONE[item.type];
  return (
    <li className="rounded-lg border border-stone-150 px-2.5 py-1.5">
      <div className="flex items-start gap-1.5">
        <span
          className={`shrink-0 whitespace-nowrap rounded px-1.5 py-0.5 text-[9px] font-bold ${tone.bg} ${tone.text}`}
        >
          {DIFF_TYPE_LABEL[item.type]}
        </span>
        <span className="line-clamp-2 text-[11px] font-bold leading-snug text-stone-800">{item.title}</span>
      </div>
      <dl className="mt-1 grid grid-cols-[3.5rem_1fr] gap-x-2 gap-y-0.5 text-[10px]">
        <dt className="text-stone-400">OS予定</dt>
        <dd className="text-stone-700">{item.osWhen ?? "なし"}</dd>
        <dt className="text-stone-400">Calendar</dt>
        <dd className="text-stone-700">{item.calendarWhen ?? "なし"}</dd>
        <dt className="text-stone-400">やること</dt>
        <dd className="text-stone-700">{item.action}</dd>
      </dl>
    </li>
  );
}

export default function PlanIntegrityPanel({
  tasks,
  planBlocks,
  supersededBlocks,
  overlays,
  clock,
  planLastChangedAt,
}: {
  tasks: Task[];
  planBlocks: TimeBlock[];
  supersededBlocks: TimeBlock[];
  overlays: TaskStateOverlays;
  clock: Clock;
  /** ISO timestamp of the newest plan edit, or null if nothing was moved. */
  planLastChangedAt: string | null;
}) {
  const issues = useMemo(
    () => validatePlan(tasks, planBlocks, overlays, clock),
    [tasks, planBlocks, overlays, clock]
  );
  const diff = useMemo(
    () => calendarDiff({ planBlocks, supersededBlocks, from: clock.today }),
    [planBlocks, supersededBlocks, clock.today]
  );

  const { actionable, unknown, matched } = useMemo(() => {
    const notMatched = calendarActionItems(diff);
    return {
      actionable: notMatched.filter((i) => i.type !== "UNKNOWN"),
      unknown: notMatched.filter((i) => i.type === "UNKNOWN"),
      matched: diff.length - notMatched.length,
    };
  }, [diff]);

  // 照合した後に予定を動かしたなら、その照合はもう現在の計画を保証しない。
  const snapshotStale = planLastChangedAt !== null && planLastChangedAt > calendarSnapshot.readAt;
  const calendarNeedsWork = snapshotStale || actionable.length > 0;

  const [open, setOpen] = useState(issues.length > 0 || calendarNeedsWork);
  const [unknownOpen, setUnknownOpen] = useState(false);

  return (
    <section className="mx-5 mt-2 rounded-xl border border-stone-150 bg-white">
      <button type="button" onClick={() => setOpen((v) => !v)} className="w-full px-3 py-2 text-left">
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-bold text-stone-700">計画の状態</span>
          <span className="ml-auto shrink-0 text-[11px] text-stone-400">{open ? "閉じる" : "開く"}</span>
        </div>
        {/* 2行に分ける。1行にまとめると「Calendarも今OK」に読める。 */}
        <div className="mt-1 flex flex-col gap-0.5">
          <StatusLine
            label="OS内部"
            tone={issues.length > 0 ? "bad" : "good"}
            value={issues.length > 0 ? `矛盾 ${issues.length}件` : "整合"}
          />
          <StatusLine
            label="Google Calendar"
            tone={calendarNeedsWork ? "warn" : "neutral"}
            value={
              snapshotStale
                ? "再照合が必要"
                : actionable.length > 0
                  ? `要照合 ${actionable.length}件`
                  : `差分 0件（${formatStamp(calendarSnapshot.readAt)}時点）`
            }
          />
        </div>
      </button>

      {open && (
        <div className="border-t border-stone-150 px-3 py-2.5">
          <h3 className="text-[11px] font-black tracking-wide text-stone-500">OS内部</h3>
          <p className="mt-0.5 text-[10px] leading-snug text-stone-400">
            いま計算した結果です。Taskと予定の間に矛盾があればここに出ます。
          </p>
          {issues.length === 0 ? (
            <p className="mt-1 text-[11px] leading-snug text-stone-500">
              ✓ 整合。実行するTaskはすべて時間が決まっていて、置き換え済みの予定は残っていません。
            </p>
          ) : (
            <ul className="mt-1 flex flex-col gap-1.5">
              {issues.map((issue: PlanIssue, i) => (
                <li key={`${issue.code}-${issue.taskId}-${i}`} className="rounded-lg bg-rose-50 px-2.5 py-1.5">
                  <p className="text-[11px] font-bold text-rose-900">{PLAN_ISSUE_LABEL[issue.code]}</p>
                  <p className="mt-0.5 text-[11px] leading-snug text-stone-700">{issue.taskTitle}</p>
                  <p className="mt-0.5 text-[10px] leading-snug text-stone-500">{issue.detail}</p>
                </li>
              ))}
            </ul>
          )}

          <h3 className="mt-4 text-[11px] font-black tracking-wide text-stone-500">Google Calendar</h3>
          <dl className="mt-1 grid grid-cols-[5rem_1fr] gap-x-2 gap-y-1 text-[11px]">
            <dt className="text-stone-400">最終照合</dt>
            <dd className="tabular-nums font-bold text-stone-700">{formatStamp(calendarSnapshot.readAt)}</dd>
            <dt className="text-stone-400">照合範囲</dt>
            <dd className="text-stone-600">
              {calendarSnapshot.coverageStart}〜{calendarSnapshot.coverageEnd}
            </dd>
            <dt className="text-stone-400">Calendar差分</dt>
            <dd className={actionable.length > 0 ? "font-bold text-amber-700" : "text-stone-600"}>
              {actionable.length}件{matched > 0 && `（一致 ${matched}件）`}
            </dd>
          </dl>
          <p className="mt-1 text-[10px] leading-snug text-stone-400">
            これは<span className="font-bold">この時刻時点で照合済み</span>
            という記録であって、現在一致している保証ではありません。
            このアプリはGoogle Calendarを読み書きしないため、照合後の変更は検知できません。
          </p>

          {snapshotStale && (
            <div className="mt-2 rounded-lg bg-amber-50 px-2.5 py-2">
              <p className="text-[11px] font-bold text-amber-900">Calendar再照合が必要</p>
              <p className="mt-0.5 text-[10px] leading-relaxed text-amber-800">
                最終照合（{formatStamp(calendarSnapshot.readAt)}）のあと、
                {formatLocalStamp(planLastChangedAt as string)} にOS側の予定を変更しました。
                下の差分は変更前の照合結果を元にしているため、そのままでは信用できません。
              </p>
            </div>
          )}

          {actionable.length === 0 ? (
            <p className="mt-1.5 text-[11px] text-stone-500">
              最終照合の時点では、Calendarへ反映が必要な予定はありませんでした。
            </p>
          ) : (
            <>
              <ul className="mt-1.5 flex flex-col gap-1.5">
                {actionable.map((item, i) => (
                  <DiffRow key={`${item.type}-${item.blockId ?? item.eventId}-${i}`} item={item} />
                ))}
              </ul>
              <p className="mt-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[10px] leading-relaxed text-amber-800">
                このアプリからGoogle Calendarへ書き込む機能は未実装です（OAuthサーバもトークン保管先もありません）。
                手動、またはCalendar接続のあるセッションから反映してください。
              </p>
            </>
          )}

          {unknown.length > 0 && (
            <div className="mt-2">
              <button
                type="button"
                onClick={() => setUnknownOpen((v) => !v)}
                className="flex w-full items-center gap-1.5 rounded-lg bg-stone-50 px-2.5 py-1.5 text-left"
              >
                <span className="text-[11px] font-bold text-stone-600">判定できない {unknown.length}件</span>
                <span className="ml-auto text-[10px] text-stone-400">{unknownOpen ? "閉じる" : "見る"}</span>
              </button>
              <p className="mt-1 text-[10px] leading-snug text-stone-400">
                Calendarには予定があるが、OS側に対応するTimeBlockが無いもの。照合範囲の外も含みます。
                対応するイベントIDが無いものを「一致」とは判定しません。
              </p>
              {unknownOpen && (
                <ul className="mt-1.5 flex flex-col gap-1.5">
                  {unknown.map((item, i) => (
                    <DiffRow key={`unknown-${item.blockId ?? item.eventId}-${i}`} item={item} />
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function StatusLine({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "good" | "warn" | "bad" | "neutral";
}) {
  const dot =
    tone === "bad"
      ? "bg-danger"
      : tone === "warn"
        ? "bg-amber-500"
        : tone === "good"
          ? "bg-emerald-500"
          : "bg-stone-300";
  const text =
    tone === "bad"
      ? "text-danger"
      : tone === "warn"
        ? "text-amber-700"
        : tone === "good"
          ? "text-emerald-700"
          : "text-stone-500";
  return (
    <div className="flex items-center gap-1.5">
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
      <span className="w-[6.5rem] shrink-0 text-[10px] text-stone-400">{label}</span>
      <span className={`text-[11px] font-bold ${text}`}>{value}</span>
    </div>
  );
}
