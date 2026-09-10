import "server-only";
import {
  beginAuth, decryptWithKey, encryptWithKey, googleAuthorizeUrl, grantedScopeAllowed,
  readTokenKey, redirectUriFor, type PendingAuth,
} from "./googleOAuth";

/**
 * Google OAuth for Calendar **reading only**.
 *
 * Why an authorization-code flow rather than a pasted refresh token: a refresh
 * token is a long-lived credential. Asking someone to copy one out of a
 * playground and into a settings field means it passes through a clipboard, a
 * browser field and possibly a chat log. Here it is only ever handled
 * server-side, and it is encrypted before it reaches storage.
 *
 * The scope is calendar.events.readonly and nothing else. A token that cannot
 * write is a stronger guarantee than a promise not to write.
 *
 * The shared mechanics live in googleOAuth. The AAD below is part of the
 * stored format: changing it would make existing ciphertext undecryptable.
 */
export const CALENDAR_READ_SCOPE = "https://www.googleapis.com/auth/calendar.events.readonly";
export const CALENDAR_CALLBACK_PATH = "/api/calendar/callback";
const AAD = "calendar-oauth:v1";
const ALLOWED_SCOPES = [CALENDAR_READ_SCOPE, "https://www.googleapis.com/auth/calendar.readonly"] as const;

export { AUTH_STATE_TTL_MS, challengeFor, createVerifier, sha256, verifyAuthState } from "./googleOAuth";
export type { AuthStateFailure, PendingAuth, OAuthConnection } from "./googleOAuth";
export type { OAuthConnection as CalendarConnection, PendingAuth as PendingCalendarAuth } from "./googleOAuth";

export function tokenKey(env: NodeJS.ProcessEnv = process.env) { return readTokenKey("CALENDAR_TOKEN_KEY", env); }
export function encryptSecret(plain: string, key: Buffer) { return encryptWithKey(plain, key, AAD); }
export function decryptSecret(payload: string, key: Buffer) { return decryptWithKey(payload, key, AAD); }

export function beginCalendarAuth(sessionToken: string, key: Buffer, now = Date.now()): { state: string; verifier: string; pending: PendingAuth } {
  return beginAuth(sessionToken, key, AAD, now);
}

export function authorizeUrl(clientId: string, redirectUri: string, state: string, verifier: string) {
  return googleAuthorizeUrl({ clientId, redirectUri, scope: CALENDAR_READ_SCOPE, state, verifier });
}

/** Reject anything broader than the read scope, including a silently upgraded grant. */
export function readOnlyScope(scope: string | undefined): boolean {
  return grantedScopeAllowed(scope, ALLOWED_SCOPES);
}

export function calendarRedirectUri(request: Request, configured = process.env.RIALA_APP_ORIGIN): string {
  return redirectUriFor(request, CALENDAR_CALLBACK_PATH, configured);
}
