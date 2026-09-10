import { gmailAuthenticated } from "../../../lib/server/gmailAuth";
import {
  cachedGmailResult, configuredGmailConnectionStore, configuredGmailLastGoodStore,
  gmailConnectionStatus, gmailReaderFor, GmailRefreshService, type GmailReadResult,
} from "../../../lib/server/gmailStore";
import { summarizeGmail } from "../../../lib/gmailSummary";
import { sameOrigin } from "../../../lib/riala-planner/security";

// The operator-facing Gmail read.
//
// Message bodies never cross this boundary. The planner runs server-side and
// reads the store directly, so there is no reason to ship mail contents to a
// browser — what comes back is counts, thread summaries, and the evidence
// behind each classification.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const response = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });

const projected = (result: GmailReadResult | null) => result && summarizeGmail(result);

export async function GET(request: Request) {
  if (!gmailAuthenticated(request)) {
    return response({ configured: false, authRequired: true, reason: "Gmailを読むには端末のログインが必要です" });
  }
  const connectionStore = configuredGmailConnectionStore();
  const lastGoodStore = configuredGmailLastGoodStore();
  if (!connectionStore || !lastGoodStore) return response({ configured: false, reason: "Gmailの永続Storeが未接続です" }, 503);
  try {
    const [connection, lastGood] = await Promise.all([connectionStore.read(), lastGoodStore.read()]);
    return response({
      configured: true,
      connection: gmailConnectionStatus(connection),
      result: projected(cachedGmailResult(lastGood, Date.now())),
      scheduled: lastGood.scheduled,
    });
  } catch { return response({ configured: false, reason: "Gmailの保存データを取得できません" }, 503); }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return response({ error: "Origin確認に失敗しました" }, 403);
  if (!gmailAuthenticated(request)) return response({ configured: false, authRequired: true, reason: "端末のログインが必要です" }, 401);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return response({ error: "JSONのみ受け付けます" }, 415);
  let body: { trigger?: unknown };
  try {
    const raw = await request.text();
    if (raw.length > 1000) return response({ error: "リクエストが大きすぎます" }, 413);
    body = JSON.parse(raw);
  } catch { return response({ error: "JSONの形式を確認してください" }, 400); }
  if (!body || !["OPEN", "MANUAL"].includes(String(body.trigger))) return response({ error: "Gmail取得方法が不正です" }, 400);

  const connectionStore = configuredGmailConnectionStore();
  const lastGoodStore = configuredGmailLastGoodStore();
  if (!connectionStore || !lastGoodStore) return response({ configured: false, reason: "Gmailの永続Storeが未接続です" }, 503);
  try {
    const service = new GmailRefreshService(lastGoodStore, gmailReaderFor(connectionStore));
    const outcome = await service.refresh(body.trigger as "OPEN" | "MANUAL");
    const connection = await connectionStore.read();
    return response({ configured: true, connection: gmailConnectionStatus(connection), result: projected(outcome) });
  } catch { return response({ configured: false, reason: "Gmailの取得に失敗しました。最後の取得結果を表示します" }, 503); }
}
