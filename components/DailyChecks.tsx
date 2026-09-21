"use client";
import { recurringRules } from '@/lib/dummy-data';
import { useTodayExecution } from '@/lib/todayExecutionStore';
export default function DailyChecks() {
  const store = useTodayExecution();
  return <section className="studio-card my-6 p-6"><h2 className="text-lg font-semibold">毎日の積み上げ</h2><p className="mt-2 text-sm text-slate-600">終わった項目をタップ。もう一度押すと戻せます。</p><div className="mt-4 grid gap-2">{recurringRules.map(rule => <button key={rule.id} type="button" aria-pressed={store.recurringDone.has(rule.id)} onClick={() => store.setRecurringDone(previous => { const next = new Set(previous); if (next.has(rule.id)) next.delete(rule.id); else next.add(rule.id); return next; })} className="flex min-h-14 items-center gap-4 rounded-xl border border-hairline p-4 text-left text-base"><span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent-dark">{store.recurringDone.has(rule.id) ? '✓' : '○'}</span>{rule.title}</button>)}</div><p role="status" className="mt-4 text-sm text-slate-600">{store.executionReady ? 'クラウド同期が有効です' : 'この端末に記録します。端末接続後に同期を確認できます。'}</p></section>;
}
