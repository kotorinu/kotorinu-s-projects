import { gmailAuthenticated, gmailSessionToken } from "../../../../lib/server/gmailAuth";
import {
  decryptGmailSecret, encryptGmailSecret, gmailOAuthClient, gmailReadOnlyScope,
  gmailRedirectUri, gmailTokenKey, verifyAuthState,
} from "../../../../lib/server/gmailOAuth";
import { configuredGmailConnectionStore } from "../../../../lib/server/gmailStore";

// Where Google returns after Gmail consent.
//
// The same discipline as the Calendar callback: the state must match a stored
// hash, must not have expired, must belong to this browser's Gmail session,
// and is consumed inside the compare-and-swap that reads it. A grant carrying
// anything but gmail.readonly is refused rather than stored — so a token that
// could send mail never reaches the database in the first place.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Results are shown by the RIALA page; the code and state never survive the redirect. */
function done(request: Request, outcome: string) {
  const origin = process.env.RIALA_APP_ORIGIN ?? new URL(request.url).origin;
  return Response.redirect(`${origin}/area/riala?gmail=${encodeURIComponent(outcome)}`, 303);
}

export async function GET(request: Request) {
  if (!gmailAuthenticated(request)) return done(request, "login-required");
  const params = new URL(request.url).searchParams;
  if (params.get("error")) return done(request, "denied");
  const code = params.get("code"), state = params.get("state");
  if (!code || !state || code.length > 2048 || state.length > 512) return done(request, "invalid");
  const key = gmailTokenKey();
  const session = gmailSessionToken(request);
  const store = configuredGmailConnectionStore();
  const client = gmailOAuthClient();
  if (!key || !session || !store || !client) return done(request, "not-configured");

  try {
    const claim = await store.transact(s => {
      const failure = verifyAuthState(s.pendingAuth ?? null, state, session);
      const verifierCipher = s.pendingAuth?.verifierCipher ?? null;
      s.pendingAuth = null;
      return failure ? { failure } : { verifierCipher };
    });
    if ("failure" in claim || !claim.verifierCipher) return done(request, "state");

    const verifier = decryptGmailSecret(claim.verifierCipher, key);
    const exchange = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(20000),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code", code, code_verifier: verifier,
        client_id: client.id, client_secret: client.secret, redirect_uri: gmailRedirectUri(request),
      }),
    });
    if (!exchange.ok) return done(request, "exchange");
    const token = await exchange.json() as { refresh_token?: string; scope?: string };
    if (!gmailReadOnlyScope(token.scope)) return done(request, "scope");
    if (!token.refresh_token) return done(request, "no-refresh-token");

    await store.transact(s => {
      s.connection = {
        refreshTokenCipher: encryptGmailSecret(token.refresh_token!, key),
        scope: token.scope!, connectedAt: new Date().toISOString(),
      };
    });
    return done(request, "connected");
  } catch { return done(request, "failed"); }
}
