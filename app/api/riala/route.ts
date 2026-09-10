import { configuredStore } from "../../../lib/riala-planner/store";
import { configuredProviders } from "../../../lib/riala-planner/providers";
import { GmailSender } from "../../../lib/riala-planner/sender";
import { approveAndSend, publicAction, reconcile, scan } from "../../../lib/riala-planner/service";
import { authConfigured, authenticated, COOKIE, equalSecret, rateLimit, RateLimitError, sameOrigin, session } from "../../../lib/riala-planner/security";
import { approvalHash } from "../../../lib/riala-planner/planner";
import { configuration, observedReadiness } from "../../../lib/riala-planner/readiness";
import { calendarCookie } from "../../../lib/server/calendarAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;
const response = (body: unknown, status = 200, extra: Record<string, string> = {}) => Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...extra } });
export async function GET(request: Request) {
  try {
    const ready = observedReadiness();
    if (!authenticated(request)) return response({ authenticated: false, readiness: ready, configuration: configuration() });
    const store = configuredStore(); if (!store) return response({ authenticated: true, readiness: ready, blocker: "永続Planner Store未接続" });
    const ledger = await store.read();
    return response({ authenticated: true, readiness: observedReadiness(ledger), configuration: configuration(), settings: ledger.settings, baselineAt: ledger.baselineAt,
      actions: ledger.actions.slice(-100).map(publicAction), runs: ledger.runs.slice(-10), totalActions: ledger.actions.length });
  } catch { return response({ error: "Plannerの保存先または設定を確認してください。処理は停止しています" }, 503); }
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return response({ error: "Origin確認に失敗しました" }, 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return response({ error: "JSONのみ受け付けます" }, 415);
  try {
    const raw = await request.text(); if (raw.length > 20000) return response({ error: "リクエストが大きすぎます" }, 413);
    let body: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return response({ error: "JSONオブジェクトが必要です" }, 400);
      body = parsed as Record<string, unknown>;
    } catch { return response({ error: "JSONの形式を確認してください" }, 400); }
    const store = configuredStore();
    if (!store || !authConfigured()) return response({ error: "認証または永続Planner Storeが未設定です。Source取得・承認・送信は停止しています" }, 503);
    if (body.command === "login") {
      await rateLimit(store, "login", 5);
      if (typeof body.secret !== "string" || !equalSecret(body.secret, process.env.RIALA_OPERATOR_SECRET!)) return response({ error: "認証できませんでした" }, 401);
      const login = response({ ok: true }, 200, { "Set-Cookie": `${COOKIE}=${session(process.env.RIALA_OPERATOR_SECRET!)}; HttpOnly; SameSite=Strict; Path=/api/riala; Max-Age=28800${new URL(request.url).protocol === "https:" ? "; Secure" : ""}` });
      // The same operator login also authorizes this device to read Calendar (read-only, separate cookie/path).
      login.headers.append("Set-Cookie", calendarCookie(request));
      return login;
    }
    if (!authenticated(request)) return response({ error: "操作には認証が必要です" }, 401);
    await rateLimit(store, "operator", 30);
    const now = new Date().toISOString();
    if (body.command === "logout") {
      const logout = response({ ok: true }, 200, { "Set-Cookie": `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/api/riala; Max-Age=0` });
      logout.headers.append("Set-Cookie", calendarCookie(request, true));
      return logout;
    }
    if (body.command === "scan") { await rateLimit(store, "scan", 3); return response({ run: await scan(store, configuredProviders(), now) }); }
    if (body.command === "approve") {
      if (!new GmailSender().enabled) return response({ error: "送信はOFFです。外部送信は行いません" }, 409);
      if (!Array.isArray(body.selections) || !body.selections.every(s => s && typeof s.id === "string" && typeof s.hash === "string")) return response({ error: "承認対象が不正です" }, 400);
      await approveAndSend(store, configuredProviders(), new GmailSender(), body.selections, now); return response({ ok: true });
    }
    if (body.command === "readback" && typeof body.id === "string") { await reconcile(store, new GmailSender(), body.id); return response({ ok: true }); }
    if (body.command === "settings") {
      if (!Number.isInteger(body.eventLeadDays) || Number(body.eventLeadDays) < 1 || Number(body.eventLeadDays) > 7) return response({ error: "イベント準備は1〜7日前で指定してください" }, 400);
      await store.transact(l => { l.settings.eventLeadDays = Number(body.eventLeadDays); l.audit.push({ at: now, actionId: "settings", operation: "RULE_CHANGED", reason: `eventLeadDays=${body.eventLeadDays}` }); }); return response({ ok: true });
    }
    if (body.command === "metrics") {
      const values = body.minutes as Record<string, number>;
      if (!values || typeof values !== "object" || !Object.entries(values).every(([key, value]) => ["explanation", "preparation", "approval", "correction", "verification", "reconciliation"].includes(key) && typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1440)) return response({ error: "実測した時間を分で入力してください" }, 400);
      if (!["MANUAL_BASELINE", "AI_ASSISTED"].includes(String(body.mode))) return response({ error: "計測モードを指定してください" }, 400);
      await store.transact(l => { const run = l.runs.find(r => r.id === body.runId); if (!run) throw new Error("Runが見つかりません"); run.managementMinutes = values; run.humanVerificationMinutes = values.verification ?? null; run.measurementMode = body.mode as "MANUAL_BASELINE" | "AI_ASSISTED"; }); return response({ ok: true });
    }
    if (["edit", "hold", "skip", "recipient"].includes(String(body.command)) && typeof body.id === "string") {
      const result = await store.transact(l => {
        const a = l.actions.find(x => x.id === body.id); if (!a) throw new Error("対象が見つかりません");
        if (body.command === "recipient") return { recipient: a.identity.email, candidates: a.identity.candidates.map(c => ({ email: c.email, evidence: c.evidence })) };
        if (!["PROPOSED", "NEEDS_REVIEW", "APPROVED"].includes(a.status) || approvalHash(a) !== body.hash) throw new Error("対象が更新されています。再読み込みしてください");
        if (body.command === "edit") {
          if (typeof body.draft !== "string" || !body.draft.trim() || body.draft.length > 6000 || body.factsChecked !== true) throw new Error("修正文と事実確認が必要です");
          const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 300) : ""; if (!reason) throw new Error("修正理由を入力してください");
          a.draft = body.draft; a.edited = true; a.revision++; a.status = a.stopReason ? "NEEDS_REVIEW" : "PROPOSED";
          const run = l.runs.find(r => r.id === a.runId); if (run) run.humanCorrections++;
          l.audit.push({ at: now, actionId: a.id, operation: "DRAFT_EDITED", reason });
        } else if (body.command === "hold") { a.status = "NEEDS_REVIEW"; a.nextAction = "保留中。根拠を確認してから個別承認してください"; }
        else { a.status = "SKIPPED"; a.nextAction = "今回は送りません。同じ業務キーでは再生成しません"; }
        a.approvedHash = null; a.approvedAt = null; a.updatedAt = now;
        l.audit.push({ at: now, actionId: a.id, operation: String(body.command), reason: "operator decision" }); return { ok: true };
      }); return response(result);
    }
    return response({ error: "未対応の操作です" }, 400);
  } catch (error) {
    // Do not log provider payloads, emails, or credentials.
    if (error instanceof RateLimitError) return response({ error: "操作回数の上限です。1分後に再試行してください" }, 429, { "Retry-After": "60" });
    return response({ error: "処理を停止しました。接続・保存先・対象の最新状態を確認してください" }, 409);
  }
}
