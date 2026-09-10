import { calendarBounds } from "../../../lib/calendarTime";
import { cachedCalendarResult, calendarConnectionStatus, calendarReaderFor, CalendarRefreshService, configuredCalendarStore } from "../../../lib/server/calendarRefresh";
import { calendarAuthenticated } from "../../../lib/server/calendarAuth";
import { sameOrigin } from "../../../lib/riala-planner/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const response = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
const notReady = () => response({ configured: false, reason: "Calendarの永続Storeが未接続です" }, 503);
const noAuth = () => response({ configured: false, authRequired: true, reason: "Calendarを読むには端末のログインが必要です" });
function validRange(request: Request) {
  const u = new URL(request.url);
  try { calendarBounds(u.searchParams.get("start") ?? "", u.searchParams.get("end") ?? ""); return true; } catch { return false; }
}
export async function GET(request: Request) {
  if (!calendarAuthenticated(request)) return noAuth();
  if (!validRange(request)) return response({ reason: "Calendar取得日付が不正です" }, 400);
  try {
    const store = configuredCalendarStore(); if (!store) return notReady();
    const state = await store.read();
    return response({ configured: true, connection: calendarConnectionStatus(state), result: cachedCalendarResult(state, Date.now()) });
  } catch { return response({ configured: false, reason: "Calendar保存データを取得できません" }, 503); }
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return response({ reason: "Origin確認に失敗しました" }, 403);
  if (!calendarAuthenticated(request)) return response({ configured: false, authRequired: true, reason: "端末のログインが必要です" }, 401);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return response({ reason: "JSONのみ受け付けます" }, 415);
  if (!validRange(request)) return response({ reason: "Calendar取得日付が不正です" }, 400);
  let body: { trigger?: unknown };
  try { const raw = await request.text(); if (raw.length > 1000) return response({ reason: "リクエストが大きすぎます" }, 413); body = JSON.parse(raw); }
  catch { return response({ reason: "JSONの形式を確認してください" }, 400); }
  if (!body || !["OPEN", "MANUAL"].includes(String(body.trigger))) return response({ reason: "Calendar更新方法が不正です" }, 400);
  try {
    const store = configuredCalendarStore(); if (!store) return notReady();
    const outcome = await new CalendarRefreshService(store, calendarReaderFor(store)).refresh(body.trigger as "OPEN" | "MANUAL");
    return response({ configured: true, ...outcome });
  } catch { return response({ configured: false, reason: "Calendar更新に失敗。最後の取得データを表示します" }, 503); }
}
