import { gmailAuthenticated, gmailSessionToken } from "../../../../lib/server/gmailAuth";
import { beginGmailAuth, gmailAuthorizeUrl, gmailOAuthClient, gmailRedirectUri, gmailTokenKey } from "../../../../lib/server/gmailOAuth";
import { configuredGmailConnectionStore } from "../../../../lib/server/gmailStore";
import { sameOrigin } from "../../../../lib/riala-planner/security";

// Starting a Gmail connection. Hands back a URL; never redirects on its own,
// and never contacts Google here.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const response = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });

export async function POST(request: Request) {
  if (!sameOrigin(request)) return response({ error: "Origin確認に失敗しました" }, 403);
  if (!gmailAuthenticated(request)) return response({ error: "端末のログインが必要です" }, 401);
  const key = gmailTokenKey();
  if (!key) return response({ error: "GMAIL_TOKEN_KEY が未設定です。暗号化できないため接続しません" }, 503);
  const client = gmailOAuthClient();
  if (!client) return response({ error: "Google OAuthクライアントが未設定です" }, 503);
  const store = configuredGmailConnectionStore();
  if (!store) return response({ error: "Gmailの永続Storeが未接続です" }, 503);
  const session = gmailSessionToken(request);
  if (!session) return response({ error: "端末のログインが必要です" }, 401);
  try {
    const { state, verifier, pending } = beginGmailAuth(session, key);
    // Persist before redirecting: a callback with no stored state is refused.
    await store.transact(s => { s.pendingAuth = pending; });
    return response({ authorizeUrl: gmailAuthorizeUrl(client.id, gmailRedirectUri(request), state, verifier) });
  } catch { return response({ error: "Gmail接続を開始できませんでした" }, 503); }
}
