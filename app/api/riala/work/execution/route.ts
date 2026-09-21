import { deviceAuthenticated } from '../../../../../lib/server/deviceSession';
import { authenticated, sameOrigin } from "../../../../../lib/riala-planner/security";
import { redisCredentials } from "../../../../../lib/server/redisClient";
import { RedisJsonStore } from "../../../../../lib/server/redisJsonStore";
import { decodeExecution, validSnapshot } from "../../../../../lib/work/execution";
import { WorkConflict } from "../../../../../lib/work/model";
export const dynamic = "force-dynamic";
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
function store() { const c = redisCredentials(); return c ? new RedisJsonStore(c.url, c.token, "work:execution:v1", decodeExecution) : null; }
export async function GET(request: Request) {
  if (!authenticated(request) && !deviceAuthenticated(request)) return json({ error: "認証が必要です" }, 401);
  try { const s = store(); return s ? json(await s.read()) : json({ error: "中央保存先が未設定です" }, 503); }
  catch { return json({ error: "実績を取得できません" }, 503); }
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Origin確認に失敗しました" }, 403);
  if (!authenticated(request) && !deviceAuthenticated(request)) return json({ error: "認証が必要です" }, 401);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "JSONが必要です" }, 415);
  try {
    const raw = await request.text(); if (raw.length > 1000000) return json({ error: "実績が大きすぎます。履歴を保全して容量を確認してください" }, 413);
    let body; try { body = JSON.parse(raw); } catch { return json({ error: "入力形式を確認してください" }, 400); }
    if (!body || !validSnapshot(body.snapshot) || !Number.isSafeInteger(body.version)) return json({ error: "実績形式を確認してください" }, 400);
    const s = store(); if (!s) return json({ error: "中央保存先が未設定です" }, 503);
    const now = new Date().toISOString();
    const result = await s.transact(state => {
      if (state.version !== body.version) throw new WorkConflict("別端末の実績更新があります。端末の記録を保全し、再読み込みしてください");
      // Closed days are append-only. A stale/partial client must not erase them.
      body.snapshot.history = { ...(body.snapshot.history ?? {}), ...(state.snapshot?.history as Record<string, unknown> ?? {}) };
      state.snapshot = body.snapshot; state.updatedAt = now; return { version: state.version + 1, updatedAt: now };
    }); return json(result);
  } catch (e) { return json({ error: e instanceof WorkConflict ? e.message : "実績を保存できません" }, e instanceof WorkConflict ? 409 : 503); }
}
