"use client";
import { useState } from "react";
import { useWork } from "@/lib/work/client";
import { useTodayExecution } from "@/lib/todayExecutionStore";
import StudioEditor from "./StudioEditor";

// 記録ボタンが押せない理由と、その場で直す入口 (2026-09-30)。
// 以前は「接続を確認してから使えます」という灰色の文だけで、ログインの入口は
// ページの一番下にあった。操作キーのログインは8時間で切れるので、スマホでは
// 「完了が押せない」状態になりやすかった。
export default function ConnectPrompt({ where }: { where: "page" | "action" }) {
  const work = useWork(); const store = useTodayExecution(); const [login, setLogin] = useState(false);
  if (work.connected && store.executionReady) return null;
  const needsLogin = !work.connected;
  return <div role="status" className={`rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-7 text-amber-900 ${where === "page" ? "mb-6" : ""}`}>
    <p className="font-semibold">{needsLogin ? "記録するには、ワークスペースへの接続が必要です" : "記録の保存先を確認しています"}</p>
    <p className="text-[14px] leading-6">{needsLogin ? "ログインは8時間で切れます。操作キーを入れると、完了や振り返りを記録できます。" : store.executionStatus}</p>
    <div className="mt-3">{needsLogin
      ? <button type="button" className="studio-primary" onClick={() => setLogin(true)}>接続して記録する</button>
      : <button type="button" className="studio-secondary" onClick={() => window.dispatchEvent(new Event("work-os-auth"))}>もう一度確認する</button>}</div>
    {login && <StudioEditor kind="login" onClose={() => setLogin(false)} />}
  </div>;
}
