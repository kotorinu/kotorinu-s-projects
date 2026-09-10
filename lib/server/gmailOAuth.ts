import "server-only";
import {
  beginAuth, decryptWithKey, encryptWithKey, googleAuthorizeUrl, grantedScopeAllowed,
  readTokenKey, redirectUriFor, type PendingAuth,
} from "./googleOAuth";

/**
 * Google OAuth for Gmail **reading only**.
 *
 * A separate connection from Calendar on purpose. Calendar's grant covers
 * calendar.events.readonly and nothing else; adding Gmail to that token would
 * widen a credential that is already in production. Two connections means a
 * compromise or revocation of one does not reach the other.
 *
 * gmail.readonly is the narrowest scope that can read a message body, and
 * bodies are the point: deciding whether a reply is needed requires reading
 * what was actually said. gmail.metadata cannot do it. Every write-capable
 * scope — modify, compose, send, and full mail.google.com — is refused, so
 * "this cannot send mail" is a property of the token rather than a promise
 * about the code.
 */
export const GMAIL_READ_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
export const GMAIL_CALLBACK_PATH = "/api/gmail/callback";
const AAD = "gmail-oauth:v1";
/** Exactly one scope is acceptable. Anything else, broader or narrower, is not stored. */
const ALLOWED_SCOPES = [GMAIL_READ_SCOPE] as const;

export type { AuthStateFailure, PendingAuth, OAuthConnection } from "./googleOAuth";
export { AUTH_STATE_TTL_MS, verifyAuthState, sha256 } from "./googleOAuth";

/** GMAIL_TOKEN_KEY is separate from CALENDAR_TOKEN_KEY: one key, one connection. */
export function gmailTokenKey(env: NodeJS.ProcessEnv = process.env) { return readTokenKey("GMAIL_TOKEN_KEY", env); }
export function encryptGmailSecret(plain: string, key: Buffer) { return encryptWithKey(plain, key, AAD); }
export function decryptGmailSecret(payload: string, key: Buffer) { return decryptWithKey(payload, key, AAD); }

export function beginGmailAuth(sessionToken: string, key: Buffer, now = Date.now()): { state: string; verifier: string; pending: PendingAuth } {
  return beginAuth(sessionToken, key, AAD, now);
}

export function gmailAuthorizeUrl(clientId: string, redirectUri: string, state: string, verifier: string) {
  return googleAuthorizeUrl({ clientId, redirectUri, scope: GMAIL_READ_SCOPE, state, verifier });
}

/** True only for exactly gmail.readonly. Every write-capable scope is refused. */
export function gmailReadOnlyScope(scope: string | undefined): boolean {
  return grantedScopeAllowed(scope, ALLOWED_SCOPES);
}

export function gmailRedirectUri(request: Request, configured = process.env.RIALA_APP_ORIGIN): string {
  return redirectUriFor(request, GMAIL_CALLBACK_PATH, configured);
}

/**
 * The OAuth client may be shared with Calendar (same Google project, one more
 * redirect URI) or given its own. Gmail-specific values win when present, so a
 * split can happen later without touching Calendar's configuration.
 */
export function gmailOAuthClient(env: NodeJS.ProcessEnv = process.env) {
  const id = env.GMAIL_CLIENT_ID ?? env.GOOGLE_CALENDAR_CLIENT_ID;
  const secret = env.GMAIL_CLIENT_SECRET ?? env.GOOGLE_CALENDAR_CLIENT_SECRET;
  return id && secret ? { id, secret } : null;
}
