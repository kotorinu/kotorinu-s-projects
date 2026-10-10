"use client";
import Link from "next/link";
import { useTodayExecution } from "@/lib/todayExecutionStore";
import { currentMilestone, milestoneStatuses, yen } from "@/lib/salesProgress";

// TODAYと営業代行ページに出す1行: いま追う到達基準と、あといくらか (2026-10-10)。
export default function SalesProgressLine() {
  const store = useTodayExecution();
  const now = currentMilestone(milestoneStatuses(Object.values(store.salesRecords), store.currentDate));
  if (!now) return null;
  const pct = Math.min(100, Math.round((now.achieved / now.milestone.target) * 100));
  const due = Number(now.milestone.due.slice(5, 7)) + "/" + Number(now.milestone.due.slice(8, 10));
  return <Link href="/sales-progress" className="block rounded-2xl border border-[#e4dfeb] bg-white p-5 text-sm leading-7">
    <span className="flex items-center justify-between gap-3"><span className="font-semibold text-[#3b334b]">営業代行の契約 {yen(now.achieved)} / {yen(now.milestone.target)}</span><span className="text-[#877e94]">{due}まで あと{now.daysLeft}日</span></span>
    <span className="mt-2 block h-2 overflow-hidden rounded-full bg-[#eeeaf3]" aria-hidden="true"><span className="block h-full rounded-full bg-[#8c7ab0]" style={{ width: `${pct}%` }} /></span>
    <span className="mt-2 block text-[#877e94]">{now.milestone.label} · あと契約 {yen(now.remaining)} · 契約したらここから記録 →</span>
  </Link>;
}
