import { cronAuthenticated } from "../../../../lib/server/calendarAuth";
import { CalendarRefreshService, configuredCalendarStore } from "../../../../lib/server/calendarRefresh";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const response = (body: unknown, status: number) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function GET(request: Request) {
  if (!cronAuthenticated(request)) return response({ ok: false }, 401);
  try {
    const store = configuredCalendarStore(); if (!store) return response({ ok: false, reason: "Calendar Store未接続" }, 503);
    const outcome = await new CalendarRefreshService(store).refresh("SCHEDULED");
    // Scheduler responses contain metadata only, never event names/descriptions or tokens.
    return response({ ok: ["REFRESHED", "FRESH"].includes(outcome.status), status: outcome.status,
      lastReadAt: outcome.result?.readAt ?? null, coverageStart: outcome.result?.coverageStart ?? null, coverageEnd: outcome.result?.coverageEnd ?? null },
    outcome.status === "FAILED" ? 503 : ["BUSY", "LIMITED"].includes(outcome.status) ? 429 : 200);
  } catch { return response({ ok: false, reason: "Calendar取得・保存を確認してください" }, 503); }
}
