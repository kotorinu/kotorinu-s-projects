"use client";
import { useState } from "react";
import { useWork } from "@/lib/work/client";
import { useTodayExecution } from "@/lib/todayExecutionStore";
import { countResults } from "@/lib/calendarReview";
import {
  CRITERION_LABEL,
  startGoalReview,
  suggestedGoalStatus,
  summarizeGoalReview,
  type CriterionResult,
  type GoalReview,
} from "@/lib/goalReview";
import type { Goal } from "@/lib/types";
import ConnectPrompt from "./ConnectPrompt";
import StudioEditor from "./StudioEditor";

// 目標の期限の振り返り。達成基準を1行ずつ判定し、事実と理由を残す。
// 判定するのは本人。「達成」に事実が無ければ知らせる（根拠の無い達成を作らない）。

const RESULTS: CriterionResult[] = ["MET", "PARTIAL", "NOT_MET"];
const TONE: Record<CriterionResult, string> = {
  MET: "border-emerald-300 bg-emerald-50 text-emerald-800",
  PARTIAL: "border-amber-300 bg-amber-50 text-amber-800",
  NOT_MET: "border-rose-300 bg-rose-50 text-rose-800",
};
const field = "w-full rounded-xl border border-[#e4dfeb] p-3 text-sm leading-7";

/** 同じ日付の翌月（10/1 → 11/1）。月末は翌月末に丸める。 */
function nextMonth(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(d, last))).toISOString().slice(0, 10);
}
function md(date: string | null) { return date ? Number(date.slice(5, 7)) + "/" + Number(date.slice(8, 10)) : "期限なし"; }

export default function GoalReviewCard({ goal }: { goal: Goal }) {
  const work = useWork(); const store = useTodayExecution();
  const saved = store.goalReviews[goal.id];
  const [draft, setDraft] = useState<GoalReview>(() => startGoalReview(goal, saved, new Date().toISOString()));
  const [statusMsg, setStatusMsg] = useState(""); const [nextGoal, setNextGoal] = useState(false);
  const nextDate = goal.targetDate ? nextMonth(goal.targetDate) : undefined;
  const dirty = JSON.stringify({ ...draft, savedAt: "" }) !== JSON.stringify({ ...startGoalReview(goal, saved, ""), savedAt: "" });
  const sum = summarizeGoalReview(draft);
  const suggestion = suggestedGoalStatus(sum);
  // 基準④「決めた予定を最後まで実行」の参考: 期限までの30日のカレンダー振り返り。
  const since = goal.targetDate ? new Date(Date.parse(goal.targetDate + "T00:00:00Z") - 30 * 86400000).toISOString().slice(0, 10) : null;
  const days = Object.values(store.calendarReviews).filter(r => since && goal.targetDate && r.date >= since && r.date <= goal.targetDate);
  const cal = countResults(days.flatMap(d => Object.values(d.blocks)));
  const update = (i: number, patch: Partial<GoalReview["criteria"][number]>) =>
    setDraft(d => ({ ...d, criteria: d.criteria.map((c, j) => j === i ? { ...c, ...patch } : c) }));

  async function setGoalStatus(status: Goal["status"]) {
    setStatusMsg("");
    try { await work.mutate({ command: "updateGoal", id: goal.id, status }); setStatusMsg(`目標の状態を「${status}」にしました。`); }
    catch (e) { setStatusMsg((e as Error).message); }
  }

  return <section className="rounded-2xl border border-[#e4dcf1] bg-[#fbf9fe] p-4 sm:p-5" aria-labelledby={`goal-review-${goal.id}`}>
    <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
      <h3 id={`goal-review-${goal.id}`} className="text-base font-semibold text-[#3b334b]">期限（{md(goal.targetDate)}）の振り返り</h3>
      <span className="studio-tag">{sum.total ? `達成${sum.met} 一部${sum.partial} 未達${sum.notMet}${sum.undecided ? ` 未判定${sum.undecided}` : ""}` : "基準なし"}</span>
    </div>
    <p className="mb-4 text-[14px] leading-6 text-[#877e94]">達成基準を1つずつ判定して、起きた事実と理由を残します。達成できなかった記録も、次の1か月の材料になります。</p>
    <ConnectPrompt where="page" />
    {sum.total === 0 && <p className="text-sm leading-7 text-[#877e94]">この目標には達成基準が書かれていません。先に「この目標を編集」で基準を入れてください。</p>}
    <ol className="space-y-5">{draft.criteria.map((c, i) => <li key={c.text} className="border-b border-[#eeeaf3] pb-5 last:border-0">
      <p className="text-sm font-semibold leading-7">{i + 1}. {c.text}</p>
      <div className="mt-2 grid grid-cols-3 gap-2" role="group" aria-label={`基準${i + 1}の判定`}>
        {RESULTS.map(r => <button key={r} type="button" aria-pressed={c.result === r} onClick={() => update(i, { result: c.result === r ? null : r })}
          className={`min-h-11 rounded-xl border px-2 text-sm ${c.result === r ? TONE[r] : "border-[#e4dfeb] bg-white text-[#5f566e]"}`}>{CRITERION_LABEL[r]}</button>)}
      </div>
      <label className="mt-3 block text-[14px] text-[#5f566e]">事実（数字・日付・成果物など）
        <textarea rows={2} maxLength={1000} className={field} value={c.fact} onChange={e => update(i, { fact: e.target.value })} placeholder="例: 成約0件。商談は9/29にロープレのみで、実商談は未実施" /></label>
      {c.result === "MET" && !c.fact.trim() && <p className="mt-1 text-[13px] leading-6 text-amber-800">「達成」にするなら、確かめられる事実を1行残してください。</p>}
      {c.result !== null && c.result !== "MET" && <label className="mt-3 block text-[14px] text-[#5f566e]">届かなかった理由
        <textarea rows={2} maxLength={1000} className={field} value={c.reason} onChange={e => update(i, { reason: e.target.value })} placeholder="例: 商品レクチャーと研修条件が未確定で、商談に進めなかった" /></label>}
    </li>)}</ol>
    {goal.targetDate && <p className="mt-2 rounded-xl bg-white p-3 text-[14px] leading-6 text-[#756b85]">参考: 期限までの30日のカレンダー振り返り {days.length}日分{cal.recorded ? `・○${cal.done} △${cal.partial} ×${cal.missed}` : "（記録なし）"}</p>}
    <label className="mt-5 block text-sm font-semibold text-[#3b334b]">この期間で分かったこと
      <textarea rows={3} maxLength={2000} className={field + " mt-2 font-normal"} value={draft.learned} onChange={e => setDraft(d => ({ ...d, learned: e.target.value }))} /></label>
    <label className="mt-4 block text-sm font-semibold text-[#3b334b]">次の1か月で変えること
      <textarea rows={3} maxLength={2000} className={field + " mt-2 font-normal"} value={draft.next} onChange={e => setDraft(d => ({ ...d, next: e.target.value }))} /></label>
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <button type="button" className="studio-primary" disabled={!dirty} onClick={() => store.saveGoalReview({ ...draft, goalTitle: goal.title, targetDate: goal.targetDate, savedAt: new Date().toISOString() })}>振り返りを保存</button>
      <span className="text-[14px] leading-6 text-[#877e94]">{dirty ? "未保存" : saved ? "保存済み" : ""}{saved && store.executionStatus ? " · " + store.executionStatus : ""}</span>
    </div>
    {saved && !dirty && suggestion && goal.status === "進行中" && work.connected && <div className="mt-5 border-t border-[#eeeaf3] pt-4">
      <p className="mb-3 text-sm leading-7">全ての基準を判定しました。この目標を閉じますか？（決めるのはあなたです）</p>
      <div className="flex flex-wrap gap-3">
        <button type="button" className="studio-secondary" onClick={() => setGoalStatus(suggestion)}>「{suggestion}」として閉じる</button>
        {suggestion === "未達成" && <button type="button" className="studio-secondary" onClick={() => setGoalStatus("一時停止")}>「一時停止」にする</button>}
      </div>
    </div>}
    {statusMsg && <p role="status" className="mt-3 text-sm leading-7 text-[#4c405f]">{statusMsg}</p>}
    {saved && !dirty && work.connected && goal.horizon === "1M" && <div className="mt-5 border-t border-[#eeeaf3] pt-4">
      <p className="mb-3 text-sm leading-7">振り返りをもとに、次の1か月（〜{md(nextDate ?? null)}）の目標を作ります。「次の1か月で変えること」が下書きに入ります。</p>
      <button type="button" className="studio-primary" onClick={() => setNextGoal(true)}>次の1か月の目標を作る</button>
    </div>}
    {nextGoal && <StudioEditor kind="goal" preset={{ title: `1か月後（${md(nextDate ?? null)}）`, description: draft.next, date: nextDate, parent: goal.parentId ?? "", horizon: goal.horizon }} onClose={() => setNextGoal(false)} />}
  </section>;
}
