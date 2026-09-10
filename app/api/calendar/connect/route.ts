import { calendarAuthenticated, calendarSessionToken } from "../../../../lib/server/calendarAuth";
import { configuredCalendarStore } from "../../../../lib/server/calendarRefresh";
import { authorizeUrl, beginCalendarAuth, calendarRedirectUri, tokenKey } from "../../../../lib/server/calendarOAuth";
import { sameOrigin } from "../../../../lib/riala-planner/security";

// Starting a Calendar connection. This route hands back a URL; it never
// redirects on its own and never touches Google. The browser navigates.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const response = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });

export async function POST(request: Request) {
  if (!sameOrigin(request)) return response({ error: "Origin確認に失敗しました" }, 403);
  if (!calendarAuthenticated(request)) return response({ error: "端末のログインが必要です" }, 401);
  const key = tokenKey();
  if (!key) return response({ error: "CALENDAR_TOKEN_KEY が未設定です。暗号化できないため接続しません" }, 503);
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
  if (!clientId || !process.env.GOOGLE_CALENDAR_CLIENT_SECRET) return response({ error: "Google OAuthクライアントが未設定です" }, 503);
  const store = configuredCalendarStore();
  if (!store) return response({ error: "Calendarの永続Storeが未接続です" }, 503);
  const session = calendarSessionToken(request);
  if (!session) return response({ error: "端末のログインが必要です" }, 401);
  try {
    const { state, verifier, pending } = beginCalendarAuth(session, key);
    // Persist before redirecting: a callback that arrives with no stored state is rejected.
    await store.transact(s => { s.pendingAuth = pending; });
    return response({ authorizeUrl: authorizeUrl(clientId, calendarRedirectUri(request), state, verifier) });
  } catch { return response({ error: "Calendar接続を開始できませんでした" }, 503); }
}
