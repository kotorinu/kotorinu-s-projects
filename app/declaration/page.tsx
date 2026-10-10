"use client";
import { useEffect, useState } from "react";
import { useTodayExecution } from "@/lib/todayExecutionStore";
import StudioHeader from "@/components/StudioHeader";
import ConnectPrompt from "@/components/ConnectPrompt";

// 朝5分の読み上げ (2026-10-10)。
// ルーズリーフ（長期目標・自分との決まり事・やらなければいけない理由）を、毎朝
// 声に出して読む。文章は本人が一度貼り付ける（コードやGitには置かない）。
const FIVE_MIN = 5 * 60;

export default function DeclarationPage() {
  const store = useTodayExecution();
  const saved = store.declaration?.text ?? "";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    if (left === null || left <= 0) return;
    const t = setTimeout(() => setLeft(l => (l === null ? null : l - 1)), 1000);
    return () => clearTimeout(t);
  }, [left]);
  const showEditor = editing || !saved;
  return <div className="studio">
    <StudioHeader title="朝の読み上げ" subtitle="声に出して、今日の基準を決める（5分）。" kind="goals" />
    <ConnectPrompt where="page" />
    {!showEditor && <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button type="button" className="studio-primary" onClick={() => setLeft(FIVE_MIN)}>{left === null ? "5分はかって読む" : left > 0 ? `残り ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` : "5分たちました"}</button>
        <button type="button" className="studio-secondary" onClick={() => { setDraft(saved); setEditing(true); }}>書き直す</button>
      </div>
      <article className="studio-card whitespace-pre-wrap p-6 text-[19px] leading-[2.1] text-[#2f2840] sm:p-8">{saved}</article>
      <p className="mt-3 text-[13px] text-[#877e94]">最終更新 {store.declaration ? new Date(store.declaration.updatedAt).toLocaleString("ja-JP") : ""}</p>
    </>}
    {showEditor && <section className="studio-card p-6">
      <h2 className="mb-2 text-base font-semibold">ルーズリーフの内容を貼り付ける</h2>
      <p className="mb-3 text-[14px] leading-6 text-[#877e94]">2027年3月までの目標・自分との決まり事・やらなければいけない理由・今月と今週の数字など、毎朝読みたいものを1回だけ入れてください。あなたの中央保存にだけ保存されます。</p>
      <textarea rows={14} maxLength={5000} className="w-full rounded-xl border border-[#e4dfeb] p-3 text-base leading-8" value={draft} onChange={e => setDraft(e.target.value)} placeholder={"【2027年3月までの目標】\n1. \n2. \n3. \n\n【自分との決まり事】\n1. \n\n【やらなければいけない理由】\n"} />
      <div className="mt-3 flex gap-3"><button type="button" className="studio-primary" disabled={!draft.trim()} onClick={() => { store.saveDeclaration(draft); setEditing(false); }}>保存する</button>{saved && <button type="button" className="studio-secondary" onClick={() => setEditing(false)}>やめる</button>}</div>
    </section>}
  </div>;
}
