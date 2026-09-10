import { calendarAuthenticated, calendarSessionToken } from "../../../../lib/server/calendarAuth";
import { configuredCalendarStore } from "../../../../lib/server/calendarRefresh";
import { calendarRedirectUri, decryptSecret, encryptSecret, readOnlyScope, tokenKey, verifyAuthState } from "../../../../lib/server/calendarOAuth";

// Where Google returns after consent.
//
// This is the one endpoint a third party can cause the browser to hit, so it
// trusts nothing in the query string on its own: the state must match a stored
// hash, must not have expired, must belong to this browser's session, and is
// consumed exactly once inside the compare-and-swap that reads it.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Results are shown by /today; the code and state never survive in the redirect. */
function done(request: Request, outcome: string) {
  const origin = process.env.RIALA_APP_ORIGIN ?? new URL(request.url).origin;
  return Response.redirect(`${origin}/today?calendar=${encodeURIComponent(outcome)}`, 303);
}

export async function GET(request: Request) {
  if (!calendarAuthenticated(request)) return done(request, "login-required");
  const params = new URL(request.url).searchParams;
  if (params.get("error")) return done(request, "denied");
  const code = params.get("code"), state = params.get("state");
  if (!code || !state || code.length > 2048 || state.length > 512) return done(request, "invalid");
  const key = tokenKey();
  const session = calendarSessionToken(request);
  const store = configuredCalendarStore();
  if (!key || !session || !store) return done(request, "not-configured");
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID, clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
  if (!clientId || !clientSecret) return done(request, "not-configured");

  try {
    // Consume the pending state and take the verifier in one atomic step, so a
    // replayed callback finds nothing left to use.
    const claim = await store.transact(s => {
      const failure = verifyAuthState(s.pendingAuth ?? null, state, session);
      const verifierCipher = s.pendingAuth?.verifierCipher ?? null;
      s.pendingAuth = null;
      return failure ? { failure } : { verifierCipher };
    });
    if ("failure" in claim || !claim.verifierCipher) return done(request, "state");

    const verifier = decryptSecret(claim.verifierCipher, key);
    const exchange = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(20000),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "authorization_code", code, code_verifier: verifier,
        client_id: clientId, client_secret: clientSecret, redirect_uri: calendarRedirectUri(request) }),
    });
    if (!exchange.ok) return done(request, "exchange");
    const token = await exchange.json() as { refresh_token?: string; scope?: string };
    // A grant broader than reading events is refused rather than stored.
    if (!readOnlyScope(token.scope)) return done(request, "scope");
    if (!token.refresh_token) return done(request, "no-refresh-token");

    await store.transact(s => {
      s.connection = { refreshTokenCipher: encryptSecret(token.refresh_token!, key), scope: token.scope!, connectedAt: new Date().toISOString() };
      // A newly connected Calendar may return different events; allow an immediate read.
      s.lastAttemptAt = null; s.lastFailure = null;
    });
    return done(request, "connected");
  } catch { return done(request, "failed"); }
}
