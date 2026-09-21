"use client";
import { useState } from "react";
import { useWork } from "@/lib/work/client";
export default function WorkControl({ kind = "task" }: { kind?: "task" | "goal" }) {
  const work = useWork();
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const action = async (body: Record<string, unknown>) => {
    setBusy(true); setError(""); try { await work.mutate(body); } catch (e) { setError(e instanceof Error ? e.message : "保存できません"); } finally { setBusy(false); }
  };
  return <section className="mx-5 my-3 rounded-xl border border-stone-200 bg-white p-3">
    <p className="text-[14px] text-stone-600" role="status">{work.status}</p>
    {!work.connected && <form className="mt-2 flex gap-2" onSubmit={async e => {
      e.preventDefault(); const form = e.currentTarget; const data = new FormData(form); setBusy(true); setError("");
      try {
        const response = await fetch("/api/riala", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ command: "login", secret: data.get("secret") }) });
        if (!response.ok) throw new Error("ログインできません。認証と保存先設定を確認してください");
        form.reset(); window.dispatchEvent(new Event("work-os-auth")); await work.refresh();
      } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
    }}><input name="secret" aria-label="操作キー" type="password" autoComplete="current-password" required className="min-w-0 flex-1 rounded border p-2 text-[14px]" placeholder="操作キー" /><button disabled={busy} className="rounded bg-blue-600 px-3 text-[14px] text-white">ログイン</button></form>}
    <details className="mt-3"><summary className="cursor-pointer text-[14px] font-bold">{kind === "task" ? "タスクを追加" : "目標を追加"}</summary>
      <form className="mt-3 grid gap-2" onSubmit={async e => {
        e.preventDefault(); const form = e.currentTarget; const data = new FormData(form);
        const input: Record<string, unknown> = { command: kind === "task" ? "createTask" : "createGoal", title: data.get("title") };
        if (kind === "task") Object.assign(input, { area: data.get("area"), description: data.get("description") || undefined,
          deadline: data.get("date") || null, aiCapability: data.get("capability"), goalId: data.get("goal") || null,
          definitionOfDone: String(data.get("criteria") ?? "").split("\n").filter(Boolean) });
        else Object.assign(input, { desiredState: data.get("description"), achievementCriteria: data.get("criteria"), targetDate: data.get("date") || null, parentId: data.get("goal") || null });
        setBusy(true); setError(""); try { await work.mutate(input); form.reset(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
      }}>
        <input name="title" aria-label="タイトル" placeholder="具体的なタイトル" required maxLength={200} className="rounded border p-2 text-sm" />
        {kind === "task" && <div className="flex gap-2"><select name="area" aria-label="Area" className="rounded border p-2 text-[14px]">{["営業代行", "RIALA", "GENESIS", "その他"].map(a => <option key={a}>{a}</option>)}</select>
          <select name="capability" aria-label="担当" className="rounded border p-2 text-[14px]"><option value="HUMAN">Human</option><option value="AI_DRAFT">AI 下書き</option><option value="AI_EXECUTE">AI 実行</option><option value="HYBRID">Hybrid</option><option value="DECISION">人間の判断</option></select></div>}
        <textarea name="description" aria-label={kind === "goal" ? "達成したい状態" : "作業の説明"} placeholder={kind === "goal" ? "達成したい状態" : "AIに必要な説明・確認済み情報"} required={kind === "goal"} className="rounded border p-2 text-[14px]" />
        <textarea name="criteria" aria-label="達成基準" placeholder="達成基準・完了条件（1行に1つ）" required={kind === "goal"} className="rounded border p-2 text-[14px]" />
        <label className="text-[14px]">{kind === "task" ? "期限（不明なら空欄）" : "目標日（不明なら空欄）"}<input name="date" type="date" className="ml-2 rounded border p-2" /></label>
        <select name="goal" aria-label={kind === "task" ? "関連目標" : "親目標"} className="rounded border p-2 text-[14px]"><option value="">目標の紐づけなし</option>{work.goals.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}</select>
        <button disabled={busy || !work.connected} className="rounded bg-blue-600 p-2 text-[14px] font-bold text-white disabled:opacity-40">中央データへ保存</button>
      </form></details>
    {kind === "task" && work.runs.length > 0 && <details className="mt-3"><summary className="cursor-pointer text-[14px] font-bold">AI実行・成果物 {work.runs.filter(r => r.status !== "ACCEPTED").length}件</summary>
      <div className="mt-2 space-y-2">{work.runs.map(r => <article key={r.id} className="rounded border p-2 text-[14px]">
        <p className="font-bold">{work.tasks.find(t => t.id === r.taskId)?.title}</p><p>{({ QUEUED: "Worker接続待ち", RUNNING: "実行中", REVIEW: "成果物の確認待ち", BLOCKED: "停止", ACCEPTED: "確認済み" })[r.status]}</p>
        {r.blocker && <p className="text-amber-700">{r.blocker}</p>}{r.output && <p className="mt-2 whitespace-pre-wrap">{r.output}</p>}
        {r.evidence.map((e, i) => <p key={i} className="mt-1 text-stone-500">根拠: {e}</p>)}
        {r.status === "REVIEW" && <button disabled={busy || !r.evidence.length} onClick={() => void action({ command: "accept", id: r.id, factsChecked: true })} className="mt-2 rounded border p-2 font-bold">成果物と根拠を確認して受け入れる</button>}
      </article>)}</div></details>}
    {error && <p role="alert" className="mt-2 text-[14px] text-red-700">{error}</p>}
    {kind === "task" && work.connected && <details className="mt-3"><summary className="cursor-pointer text-[14px] font-bold">登録データを編集する</summary>
      <p className="my-2 text-[13px] text-stone-500">実行日時の設定は各タスクの詳細から行えます。未設定のタスクはBacklogに残ります。</p>
      {work.tasks.filter(t => t.source === "USER").map(t => <form key={t.id} className="my-2 grid gap-2 rounded border p-2" onSubmit={async e => {
        e.preventDefault(); const data = new FormData(e.currentTarget); await action({ command: "updateTask", id: t.id,
          title: data.get("title"), description: data.get("description") || undefined, deadline: data.get("deadline") || null,
          definitionOfDone: String(data.get("criteria")).split("\n").filter(Boolean), status: data.get("status") });
      }}><input name="title" defaultValue={t.title} aria-label="タスク名を編集" required className="rounded border p-2 text-[14px]" />
        <textarea name="description" defaultValue={t.description} aria-label="説明を編集" className="rounded border p-2 text-[14px]" />
        <textarea name="criteria" defaultValue={t.definitionOfDone.join("\n")} aria-label="完了条件を編集" className="rounded border p-2 text-[14px]" />
        <input name="deadline" type="date" defaultValue={t.deadline ?? ""} aria-label="期限を編集" className="rounded border p-2 text-[14px]" />
        <select name="status" defaultValue={t.status} aria-label="状態を編集" className="rounded border p-2 text-[14px]">{["未着手", "進行中", "待ち", "完了", "Archive"].map(s => <option key={s}>{s}</option>)}</select>
        <button disabled={busy} className="rounded border p-2 text-[14px]">更新を中央保存</button></form>)}
      <a href="/api/riala/work/calendar" className="my-2 inline-block text-[14px] font-bold text-blue-700">中央保存済みの変更予定をCalendarファイルへ書き出す</a>
      <p className="text-[13px] text-stone-500">Google Calendarの設定 → インポートで取り込んでください。書き出しだけではCalendar反映済みにしません。既存イベントの変更はCalendar上で行ってください。</p>
    </details>}
    {kind === "goal" && work.connected && <details className="mt-3"><summary className="cursor-pointer text-[14px] font-bold">目標を編集する</summary>
      {work.goals.filter(g => !g.isNorthStar).map(g => <form key={g.id} className="my-2 grid gap-2 rounded border p-2" onSubmit={async e => {
        e.preventDefault(); const data = new FormData(e.currentTarget); await action({ command: "updateGoal", id: g.id, title: data.get("title"), achievementCriteria: data.get("criteria"), status: data.get("status") });
      }}><input name="title" defaultValue={g.title} aria-label="目標名を編集" required className="rounded border p-2 text-[14px]" />
        <textarea name="criteria" defaultValue={g.achievementCriteria} aria-label="達成基準を編集" required className="rounded border p-2 text-[14px]" />
        <select name="status" defaultValue={g.status} aria-label="目標の状態" className="rounded border p-2 text-[14px]">{["進行中", "達成", "一時停止", "未達成"].map(s => <option key={s}>{s}</option>)}</select>
        <button disabled={busy} className="rounded border p-2 text-[14px]">目標を中央保存</button></form>)}
    </details>}
  </section>;
}
