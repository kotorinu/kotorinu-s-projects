"use client";
import { useState } from "react";
import Link from "next/link";
import { useTodayExecution } from "@/lib/todayExecutionStore";
import StudioHeader from "@/components/StudioHeader";
import ConnectPrompt from "@/components/ConnectPrompt";
import {
  COMMISSION_RATE, SALE_KIND_LABEL, currentMilestone, fillOptions, meetingsNeeded, milestoneStatuses, reward, yen,
  type MilestoneStatus, type SaleKind,
} from "@/lib/salesProgress";

// 営業代行の契約と報酬の進み具合 (2026-10-10)。
// 契約したら金額を1件ずつ記録するだけ。期限つきの到達基準に対して、いまどこか・
// あといくら・何件で埋まるかを出す。記録していない見込みは数えない。
function md(d: string) { return Number(d.slice(5, 7)) + "/" + Number(d.slice(8, 10)); }
const field = "rounded-xl border border-[#e4dfeb] p-2 text-sm";

function Bar({ s }: { s: MilestoneStatus }) {
  const pct = Math.min(100, Math.round((s.achieved / s.milestone.target) * 100));
  return <span className="block h-2 overflow-hidden rounded-full bg-[#eeeaf3]" aria-hidden="true"><span className={`block h-full rounded-full ${s.done ? "bg-emerald-500" : s.missed ? "bg-rose-400" : "bg-[#8c7ab0]"}`} style={{ width: `${pct}%` }} /></span>;
}

export default function SalesProgressPage() {
  const store = useTodayExecution();
  const today = store.currentDate;
  const records = Object.values(store.salesRecords).sort((a, b) => b.date.localeCompare(a.date) || b.recordedAt.localeCompare(a.recordedAt));
  const statuses = milestoneStatuses(records, today);
  const now = currentMilestone(statuses);
  const [date, setDate] = useState(""); const [amount, setAmount] = useState(""); const [kind, setKind] = useState<SaleKind>("PORTFOLIO"); const [note, setNote] = useState("");
  const [rate, setRate] = useState<string | null>(null);
  const amountValue = Number(amount.replace(/[,，円\s]/g, ""));
  const valid = Number.isInteger(amountValue) && amountValue > 0 && amountValue <= 100_000_000;
  function add() {
    if (!valid) return;
    const id = `sale-${Date.now()}`;
    store.saveSaleRecord({ id, date: date || today, amount: amountValue, kind, note: note.trim().slice(0, 500), recordedAt: new Date().toISOString() }, id);
    setAmount(""); setNote("");
  }
  const options = now ? fillOptions(now.remaining) : [];
  const ratePct = store.salesCloseRate !== null ? Math.round(store.salesCloseRate * 100) : null;
  return <div className="studio">
    <StudioHeader title="契約と報酬の進み具合" subtitle={`契約したら金額を記録するだけ。報酬は契約金額の${COMMISSION_RATE * 100}%で計算します。`} kind="tasks" />
    <ConnectPrompt where="page" />
    {now ? <section className="studio-card mb-6 p-6" aria-labelledby="now-ms">
      <p className="studio-eyebrow">いま追う到達基準 · {md(now.milestone.due)}まで あと{now.daysLeft}日</p>
      <h2 id="now-ms" className="mb-3 text-lg font-semibold">{now.milestone.label}</h2>
      <p className="mb-2 text-2xl font-semibold tabular-nums">{yen(now.achieved)} <span className="text-base font-normal text-[#877e94]">/ {yen(now.milestone.target)}（契約金額・{md(now.milestone.from)}〜）</span></p>
      <Bar s={now} />
      <p className="mt-3 text-sm leading-7">報酬換算 {yen(reward(now.achieved))} / {yen(reward(now.milestone.target))}　·　<strong>あと契約 {yen(now.remaining)}</strong></p>
      {options.length > 0 && <div className="mt-4 rounded-xl bg-[#f5f1fb] p-4 text-sm leading-7"><p className="font-semibold">残りを埋める例</p><ul className="mt-1 list-disc pl-5">{options.map(o => <li key={o.label}>{o.label} × {o.count}件{o.count > 1 ? `（${yen(o.total)}）` : ""}{ratePct !== null ? ` → 商談 約${meetingsNeeded(o.count, store.salesCloseRate)}件（成約率${ratePct}%）` : ""}</li>)}</ul></div>}
    </section> : <section className="studio-card mb-6 p-6"><p className="text-base font-semibold">期限内の到達基準はすべて達成しています。</p><p className="text-sm text-[#877e94]">次の目標は月次の振り返りで決めましょう。</p></section>}

    <section className="studio-card mb-6 p-6" aria-labelledby="add-sale">
      <h2 id="add-sale" className="mb-3 text-base font-semibold">契約を記録する</h2>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">契約日<input type="date" className={field} value={date || today} max={today} onChange={e => setDate(e.target.value)} /></label>
        <label className="flex flex-col gap-1 text-sm">契約金額（円）<input inputMode="numeric" className={field} value={amount} onChange={e => setAmount(e.target.value)} placeholder="例: 79800" /></label>
        <label className="flex flex-col gap-1 text-sm">種類<select className={field} value={kind} onChange={e => setKind(e.target.value as SaleKind)}>{(Object.keys(SALE_KIND_LABEL) as SaleKind[]).map(k => <option key={k} value={k}>{SALE_KIND_LABEL[k]}</option>)}</select></label>
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-sm">メモ（任意・個人名は書かない）<input className={field} value={note} maxLength={500} onChange={e => setNote(e.target.value)} /></label>
        <button type="button" className="studio-primary" disabled={!valid} onClick={add}>記録する{valid ? `（報酬 ${yen(reward(amountValue))}）` : ""}</button>
      </div>
      <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-[#eeeaf3] pt-4 text-sm">
        <label className="flex flex-col gap-1">自分の成約率（%・実績から）<input inputMode="numeric" className={field} value={rate ?? (ratePct ?? "").toString()} onChange={e => setRate(e.target.value)} placeholder="例: 30" /></label>
        <button type="button" className="studio-secondary" onClick={() => { const n = Number(rate); store.setSalesCloseRate(rate === "" || rate === null ? null : n > 0 && n <= 100 ? n / 100 : store.salesCloseRate); setRate(null); }}>保存</button>
        <span className="text-[13px] text-[#877e94]">成約率を入れると、必要な商談数も出ます（推定はしません）。</span>
      </div>
    </section>

    <section className="studio-card mb-6 p-6" aria-labelledby="all-ms">
      <h2 id="all-ms" className="mb-3 text-base font-semibold">すべての到達基準</h2>
      <ul className="space-y-4">{statuses.map(s => <li key={s.milestone.id} className="text-sm">
        <div className="mb-1 flex flex-wrap justify-between gap-2"><span className="font-semibold">{md(s.milestone.due)}まで　{s.milestone.label}</span><span className={s.done ? "text-emerald-700" : s.missed ? "text-rose-700" : "text-[#5f566e]"}>{s.done ? "達成" : s.missed ? "期限切れ・未達" : `あと${s.daysLeft}日`}</span></div>
        <Bar s={s} />
        <p className="mt-1 text-[13px] text-[#877e94]">{yen(s.achieved)} / {yen(s.milestone.target)}（{md(s.milestone.from)}〜の契約・報酬換算 {yen(reward(s.milestone.target))}）</p>
      </li>)}</ul>
      <p className="mt-4 text-[13px] leading-6 text-[#877e94]">2027年3月のゴール「月50万円」は契約250万円／月（報酬率20%）。12月10万→1月20万→2月35万→3月50万円で上げていきます。</p>
    </section>

    <section className="studio-card p-6" aria-labelledby="records">
      <h2 id="records" className="mb-3 text-base font-semibold">記録した契約 {records.length}件</h2>
      {records.length === 0 ? <p className="text-sm text-[#877e94]">まだ記録はありません。</p> : <ul>{records.map(r => <li key={r.id} className="flex items-center justify-between gap-3 border-b border-[#eeeaf3] py-3 text-sm last:border-0">
        <span><span className="tabular-nums text-[#877e94]">{md(r.date)}</span>　{SALE_KIND_LABEL[r.kind]}　<strong className="tabular-nums">{yen(r.amount)}</strong>（報酬 {yen(reward(r.amount))}）{r.note && <span className="block text-[13px] text-[#877e94]">{r.note}</span>}</span>
        <button type="button" className="text-[13px] text-rose-700 underline" onClick={() => { if (window.confirm(`${md(r.date)} ${yen(r.amount)} の記録を削除しますか？`)) store.saveSaleRecord(null, r.id); }}>削除</button>
      </li>)}</ul>}
      <p className="mt-4 text-sm"><Link className="text-accent-dark underline" href="/pdca?period=week">週の振り返りを開く →</Link></p>
    </section>
  </div>;
}
