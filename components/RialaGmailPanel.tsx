"use client";

import { useCallback, useEffect, useState } from "react";
import type { GmailSummary } from "@/lib/gmailSummary";

/**
 * Gmail, at the size the planner actually needs (§22).
 *
 * This is not an inbox. It answers three questions — when did we last read,
 * how much looks like RIALA work, and what is waiting on a reply from us —
 * and keeps the rest behind a disclosure. Message bodies never reach here:
 * the API returns thread summaries and the evidence behind each label.
 */

const CONNECT_MESSAGE: Record<string, string> = {
  connected: "Gmailを接続しました（読み取りのみ）",
  denied: "Google側で許可されませんでした。接続していません",
  "login-required": "端末のログインが切れています。ログインしてからもう一度接続してください",
  "not-configured": "接続に必要な設定が足りません（OAuthクライアント・暗号鍵・保存先）",
  state: "接続のやり直しが必要です（リンクの有効期限切れ、または別のブラウザ）",
  scope: "読み取り以外の権限が含まれていたため、接続しませんでした",
  "no-refresh-token": "Googleが再接続用のトークンを返しませんでした。もう一度お試しください",
  exchange: "Googleとのやり取りに失敗しました。接続していません",
  invalid: "接続リンクが不正でした。接続していません",
  failed: "接続に失敗しました。接続していません",
};

const RELEVANCE_LABEL: Record<string, string> = {
  RIALA_RELEVANT: "RIALA",
  POSSIBLY_RIALA: "RIALAかも",
  NOT_RIALA: "対象外",
  UNKNOWN: "判別材料なし",
};
const REPLY_LABEL: Record<string, string> = {
  AWAITING_OUR_REPLY: "相手から届いたまま",
  AWAITING_THEIR_REPLY: "こちらが最後に送信",
  OUTGOING_ONLY: "こちらからのみ",
  UNKNOWN: "不明",
};

interface Connection { connected: boolean; connectedAt: string | null; scope: string | null; keyConfigured: boolean; clientConfigured: boolean }
interface GmailApiBody { configured: boolean; authRequired?: boolean; reason?: string; connection?: Connection; result?: GmailSummary | null }

/** From an ISO instant to JST wall time, without Date's local-time getters. */
function stamp(iso: string): string {
  const local = new Date(Date.parse(iso) + 9 * 3600000).toISOString();
  return `${Number(local.slice(5, 7))}/${Number(local.slice(8, 10))} ${local.slice(11, 16)}`;
}

export default function RialaGmailPanel() {
  const [body, setBody] = useState<GmailApiBody | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/gmail", { cache: "no-store" });
      setBody((await response.json()) as GmailApiBody);
    } catch { setBody({ configured: false, reason: "Gmailの状態を取得できません" }); }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    const outcome = new URLSearchParams(window.location.search).get("gmail");
    if (!outcome) return;
    // Clear the parameter with the message, not before it, so a cancelled
    // first pass in development does not consume the outcome.
    const timer = setTimeout(() => {
      setNotice(CONNECT_MESSAGE[outcome] ?? "Gmail接続の結果を確認できませんでした");
      window.history.replaceState(null, "", window.location.pathname);
      void load();
    }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  const connect = async () => {
    setBusy(true); setNotice(null);
    try {
      const response = await fetch("/api/gmail/connect", { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" }, body: "{}" });
      const data = (await response.json()) as { authorizeUrl?: string; error?: string };
      if (data.authorizeUrl) { window.location.href = data.authorizeUrl; return; }
      setNotice(data.error ?? "Gmail接続を開始できませんでした");
    } catch { setNotice("Gmail接続を開始できませんでした"); }
    setBusy(false);
  };

  const refresh = async () => {
    setBusy(true); setNotice(null);
    try {
      const response = await fetch("/api/gmail", { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trigger: "MANUAL" }) });
      const data = (await response.json()) as GmailApiBody;
      setBody(data);
      if (data.result?.reason) setNotice(data.result.reason);
    } catch { setNotice("Gmailの取得に失敗しました"); }
    setBusy(false);
  };

  const connection = body?.connection;
  const result = body?.result ?? null;
  const canConnect = !!connection && !connection.connected && connection.clientConfigured && connection.keyConfigured;

  const freshness = !body
    ? "Gmail 読み込み中…"
    : body.authRequired
      ? "Gmail 未ログイン"
      : !connection?.connected
        ? "Gmail 未接続"
        : result?.readAt
          ? `Gmail ${result.stale ? "最終取得" : "✓"} ${stamp(result.readAt)} JST`
          : "Gmail 未取得";

  return (
    <section className="mt-3 rounded-3xl border border-violet-100 bg-white/70 px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-black tracking-[0.18em] text-violet-700">INCOMING / GMAIL</p>
          <p role="status" aria-live="polite" className="mt-0.5 text-[11px] font-bold text-stone-600">{freshness}</p>
          {connection?.connected && result?.accountMasked ? (
            <p className="text-[10px] text-stone-400">{result.accountMasked}・読み取りのみ{result.window ? `・直近${result.window.days}日` : ""}</p>
          ) : null}
        </div>
        <div className="flex gap-1.5">
          {canConnect ? (
            <button type="button" onClick={() => void connect()} disabled={busy}
              className="rounded-xl bg-violet-700 px-3 py-2 text-[11px] font-black text-white disabled:opacity-40">
              {busy ? "接続中…" : "Gmailを接続"}
            </button>
          ) : null}
          {connection?.connected ? (
            <button type="button" onClick={() => void refresh()} disabled={busy}
              className="rounded-xl border border-violet-200 px-3 py-2 text-[11px] font-black text-violet-700 disabled:opacity-40">
              {busy ? "取得中…" : "Gmailを取得 ⟳"}
            </button>
          ) : null}
        </div>
      </div>

      {connection && !connection.connected ? (
        <p className="mt-2 text-[10px] leading-relaxed text-stone-500">
          {!connection.clientConfigured ? "Google OAuthクライアントが未設定です。" : null}
          {!connection.keyConfigured ? "GMAIL_TOKEN_KEY が未設定のため、暗号化できず接続しません。" : null}
          {connection.clientConfigured && connection.keyConfigured ? "受信メールを読むには接続が必要です。権限は読み取りのみで、送信・下書き・既読変更はできません。" : null}
        </p>
      ) : null}

      {result && connection?.connected ? (
        <>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <Stat label="対応候補" value={result.counts.relevant + result.counts.possible} />
            <Stat label="要返信" value={result.counts.awaitingOurReply} />
            <Stat label="判別材料なし" value={result.counts.unknown} />
          </div>
          {result.reason ? (
            <div className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-[10px] font-bold text-amber-800">
              <p>{result.reason}</p>
              {result.diagnostic ? (
                <p className="mt-0.5 font-normal text-amber-700">
                  失敗した段階: {result.diagnostic.stage}
                  {result.diagnostic.httpStatus ? ` / HTTP ${result.diagnostic.httpStatus}` : ""}
                  {` / ${result.diagnostic.category}`}
                </p>
              ) : null}
            </div>
          ) : null}
          <button type="button" onClick={() => setOpen(v => !v)} className="mt-2 text-[10px] font-black text-violet-700">
            {open ? "内訳を閉じる" : `内訳を見る（${result.counts.threads}スレッド / ${result.counts.messages}通）`}
          </button>
          {open ? (
            <div className="mt-2 space-y-1.5">
              {result.threads.length === 0 ? <p className="text-[11px] text-stone-400">この期間に該当はありません</p> : null}
              {result.threads.map(thread => (
                <article key={thread.threadId} className="rounded-2xl border border-stone-100 bg-white px-3 py-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`rounded-full px-2 py-0.5 text-[9px] font-black ${thread.relevance === "RIALA_RELEVANT" ? "bg-violet-50 text-violet-700" : "bg-stone-50 text-stone-500"}`}>
                      {RELEVANCE_LABEL[thread.relevance] ?? thread.relevance}
                    </span>
                    <span className="text-[10px] font-bold text-stone-500">{REPLY_LABEL[thread.replyState] ?? thread.replyState}</span>
                    {thread.unreadCount > 0 ? <span className="text-[10px] font-bold text-amber-700">未読{thread.unreadCount}</span> : null}
                  </div>
                  <p className="mt-1 text-[12px] font-bold text-stone-800">{thread.subject || "(件名なし)"}</p>
                  <p className="text-[10px] text-stone-400">
                    最終 {stamp(thread.lastMessageAt)}
                    {thread.lastIncomingAt ? `・相手から ${stamp(thread.lastIncomingAt)}` : ""}
                    ・{thread.messageCount}通
                  </p>
                  {thread.evidence.length > 0 ? (
                    <div className="mt-1 space-y-0.5">
                      {thread.evidence.slice(0, 3).map((e, index) => (
                        <p key={`${thread.threadId}-${index}`} className="rounded-lg bg-stone-50 px-2 py-1 text-[10px] text-stone-500">{e.detail}</p>
                      ))}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          ) : null}
          <p className="mt-2 text-[10px] leading-relaxed text-stone-400">
            返信が必要かどうかはここでは決めません。事実だけを出しています。送信・下書き・既読変更は行いません。
          </p>
        </>
      ) : null}

      {notice ? <p className="mt-2 text-[11px] font-bold text-violet-800">{notice}</p> : null}
      {body && !body.configured && body.reason && !body.authRequired ? (
        <p className="mt-2 text-[11px] font-bold text-amber-800">{body.reason}</p>
      ) : null}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-white px-3 py-2">
      <p className="text-[10px] font-bold text-stone-400">{label}</p>
      <p className="mt-0.5 text-[20px] font-black tabular-nums text-violet-700">{value}</p>
    </div>
  );
}
