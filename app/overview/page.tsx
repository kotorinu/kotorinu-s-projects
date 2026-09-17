"use client";
import Link from "next/link";
import { useWork } from "@/lib/work/client";
import { useTodayExecution } from "@/lib/todayExecutionStore";
import { workCoverage } from "@/lib/work/coverage";
export default function OverviewPage() {
  const work = useWork();
  const { currentDate } = useTodayExecution();
  const c = workCoverage(work.tasks, work.goals, work.runs, currentDate);
  const rows = [
    { title: "成果物を確認する", items: c.review, detail: "AIが作った成果物を確認して、次の作業へ。", href: "/tasks" },
    { title: "期限を過ぎた作業を見直す", items: c.overdue, detail: "完了・再計画・中止を判断します。", href: "/tasks" },
    { title: "目標と作業をつなぐ", items: c.unlinked, detail: "目標が未設定、または参照先がないタスクです。", href: "/tasks" },
    { title: "完了条件を決める", items: c.noCriteria, detail: "何ができたら終わりか、タスクに記録します。", href: "/tasks" },
    { title: "目標の次の一歩を確認する", items: c.goalsWithoutWork, detail: "未完了タスクが直接つながっていない目標です。子目標も確認します。", href: "/goals" },
    { title: "目標の達成基準を決める", items: c.goalsWithoutCriteria, detail: "達成と判断する根拠を記録します。", href: "/goals" },
    { title: "AIが止まっている理由を確認する", items: c.blocked, detail: "情報や接続が不足している実行です。", href: "/tasks" },
  ];
  return <div className="mx-auto max-w-5xl px-5 py-8 sm:px-8 lg:py-12">
    <header className="mb-8 flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-medium tracking-widest text-slate-500">WORKSPACE</p><h1 className="mt-2 text-3xl font-bold tracking-tight">目標から、次の一歩へ。</h1><p className="mt-3 text-sm leading-7 text-slate-600">仕事も学びも人生目標も。いま必要な判断を、ここで確認。</p></div><Link href="/today" className="rounded-xl bg-accent px-5 py-3 text-sm font-medium text-white hover:bg-accent-dark">今日の作業へ →</Link></header>
    <p role="status" className="mb-6 rounded-xl border border-hairline bg-white px-4 py-3 text-sm text-slate-600">{work.status}{!work.connected && "。中央データ取得後に件数を表示します。"}</p>
    {work.connected && <section aria-label="実行の状態" className="mb-8 grid grid-cols-3 divide-x divide-hairline rounded-2xl border border-hairline bg-white py-6">{[{ label: "未完了タスク", value: c.pending.length }, { label: "成果物の確認", value: c.review.length }, { label: "AI実行待ち", value: c.queued.length }].map(item => <div key={item.label} className="px-3 sm:px-6"><p className="text-xs text-slate-600">{item.label}</p><p className="mt-2 text-3xl font-semibold tabular-nums">{item.value}<span className="ml-1 text-xs font-normal text-slate-500">件</span></p></div>)}</section>}
    <section className="mb-8"><h2 className="mb-4 text-lg font-bold">仕事と学び</h2><div className="grid gap-3 sm:grid-cols-3">{[{ area: "営業代行", href: "/area/sales", note: "商談の型・準備・実行" }, { area: "RIALA", href: "/area/riala", note: "会員の定着・交流・運営" }, { area: "GENESIS", href: "/area/genesis", note: "学び・練習・実行の証拠" }].map(item => <Link key={item.href} href={item.href} className="rounded-2xl border border-hairline bg-white p-5 transition-colors hover:border-accent"><div className="flex justify-between"><h3 className="font-semibold">{item.area}</h3><span aria-hidden="true" className="text-slate-400">↗</span></div><p className="mt-2 text-xs leading-6 text-slate-600">{item.note}</p></Link>)}</div></section>
    <section><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-bold">不足していること</h2><Link href="/goals" className="text-sm text-accent-dark">人生目標を見る →</Link></div><div className="overflow-hidden rounded-2xl border border-hairline bg-white">{work.connected ? rows.filter(row => row.items.length > 0).map(row => <details key={row.title} className="border-b border-hairline px-5 py-4 last:border-0"><summary className="cursor-pointer py-1 text-sm font-semibold">{row.title}<span className="ml-3 text-slate-500">{row.items.length}件</span></summary><p className="mt-2 text-xs leading-6 text-slate-600">{row.detail}</p><ul className="mt-3 space-y-2">{row.items.map(item => <li key={item.id} className="text-sm leading-6">{"title" in item ? item.title : work.tasks.find(t => t.id === item.taskId)?.title ?? "対象タスクを確認"}</li>)}</ul><Link href={row.href} className="mt-3 inline-block py-2 text-sm text-accent-dark">確認・編集へ →</Link></details>) : <p className="p-5 text-sm leading-7 text-slate-600">中央データへの接続後に、目標・タスク・AI実行を照合します。<Link href="/tasks" className="text-accent-dark">タスク画面でログイン →</Link></p>}{work.connected && rows.every(row => row.items.length === 0) && <p className="p-5 text-sm text-slate-600">この確認範囲では不足は見つかりませんでした。目標達成や外部連携の成功を意味するものではありません。</p>}</div></section>
    <details className="mt-6 text-sm text-slate-600"><summary className="cursor-pointer py-3">自動実行の範囲と、これからの検証</summary><p className="mt-2 leading-7">AIの実行待ちは、実行基盤が接続されて初めて進みます。RIALAは現在テスト期間です。営業成果・人生目標の最新情報との同期、外部送信、Calendar書き込み、PC停止中の実行は、接続と実結果の検証が必要です。</p><Link href="/system" className="mt-3 inline-block py-2 text-accent-dark">接続状態を確認 →</Link></details>
  </div>;
}
