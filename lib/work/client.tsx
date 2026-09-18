"use client";
import { createContext, useCallback, useContext, useEffect, useState, useRef, type ReactNode } from "react";
import { tasks, goals } from "../dummy-data";
import type { WorkLedger } from "./model";
type WorkContextValue = { tasks: WorkLedger["tasks"]; goals: WorkLedger["goals"]; runs: WorkLedger["runs"];
  status: string; connected: boolean; refresh: () => Promise<boolean>; mutate: (body: Record<string, unknown>) => Promise<void> };
const Context = createContext<WorkContextValue | null>(null);
export function WorkProvider({ children }: { children: ReactNode }) {
  const [ledger, setLedger] = useState<WorkLedger | null>(null);
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState("中央保存への接続を確認中");
  const requests = useRef(new Map<string, string>());
  const readGeneration = useRef(0);
  const refresh = useCallback(async () => {
    const generation=++readGeneration.current;
    try {
      const response = await fetch("/api/riala/work", { cache: "no-store" });
      if(generation!==readGeneration.current)return false;
      if (response.status === 401) { setConnected(false); setLedger(null); setStatus("中央保存にはログインが必要です"); return false; }
      if (!response.ok) throw new Error("中央保存先へ接続できません");
      let next: WorkLedger = await response.json();
      if (next.version === 0) {
        const initialized = await fetch("/api/riala/work", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ command: "initialize", version: 0 }) });
        if (initialized.ok) next = (await initialized.json()).ledger;
        else if (initialized.status === 409) next = await (await fetch("/api/riala/work", { cache: "no-store" })).json();
        else throw new Error("中央データの初期保存に失敗しました");
      }
      if(generation!==readGeneration.current)return false;
      setLedger(current=>current && current.version>next.version?current:next); setConnected(true); setStatus("中央データ取得済み"); return true;
    } catch { if(generation===readGeneration.current){setConnected(false); setStatus("中央保存先へ接続できません。表示データは確認用です");}return false; }
  }, []);
  useEffect(() => {
    const start = setTimeout(() => void refresh(), 0);
    const focus = () => void refresh();
    window.addEventListener("focus", focus);
    window.addEventListener("work-os-auth", focus);
    return () => { clearTimeout(start); window.removeEventListener("focus", focus); window.removeEventListener("work-os-auth", focus); };
  }, [refresh]);
  const mutate = async (body: Record<string, unknown>) => {
    if (!ledger || !connected) throw new Error("中央保存への接続を確認してください");
    ++readGeneration.current;
    const fingerprint = JSON.stringify(body);
    const requestId = requests.current.get(fingerprint) ?? crypto.randomUUID();
    requests.current.set(fingerprint, requestId);
    const response = await fetch("/api/riala/work", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, requestId, version: ledger.version }) });
    const result = await response.json();
    if (!response.ok) { if (response.status === 409) await refresh(); throw new Error(result.error ?? "保存できません"); }
    setLedger(current=>current && current.version>result.ledger.version?current:result.ledger); setStatus("中央保存を確認しました");
    requests.current.delete(fingerprint);
  };
  return <Context.Provider value={{ tasks: ledger?.tasks ?? tasks, goals: ledger?.goals ?? goals,
    runs: ledger?.runs ?? [], status, connected, refresh, mutate }}>{children}</Context.Provider>;
}
export function useWork() { const context = useContext(Context); if (!context) throw new Error("WorkProviderが必要です"); return context; }
