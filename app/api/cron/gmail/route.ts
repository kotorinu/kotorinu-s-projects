import { cronAuthenticated } from "../../../../lib/server/readerSession";
import {
  configuredGmailConnectionStore, configuredGmailLastGoodStore,
  gmailReaderFor, GmailRefreshService,
} from "../../../../lib/server/gmailStore";

// Unattended Gmail read.
//
// Bearer only: a secret in a query string ends up in access logs and browser
// history. The response is counts and timestamps — never a subject, an
// address, or a line of a message. A scheduler log is not a place for mail.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const response = (body: unknown, status: number) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(request: Request) {
  if (!cronAuthenticated(request)) return response({ ok: false }, 401);
  try {
    const connectionStore = configuredGmailConnectionStore();
    const lastGoodStore = configuredGmailLastGoodStore();
    if (!connectionStore || !lastGoodStore) return response({ ok: false, reason: "Gmail Store未接続" }, 503);
    const outcome = await new GmailRefreshService(lastGoodStore, gmailReaderFor(connectionStore)).refresh("SCHEDULED");
    const ok = outcome.status === "LIVE" || outcome.status === "FRESH";
    return response({
      ok, status: outcome.status,
      readAt: outcome.readAt,
      messageCount: outcome.record?.messages.length ?? null,
      threadCount: outcome.record?.threads.length ?? null,
    }, ok ? 200 : ["BUSY", "LIMITED"].includes(outcome.status) ? 429 : 503);
  } catch { return response({ ok: false, reason: "Gmail取得・保存を確認してください" }, 503); }
}
