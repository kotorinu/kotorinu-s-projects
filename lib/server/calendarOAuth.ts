import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

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
 */
export const CALENDAR_READ_SCOPE = "https://www.googleapis.com/auth/calendar.events.readonly";
export const CALENDAR_CALLBACK_PATH = "/api/calendar/callback";
export const AUTH_STATE_TTL_MS = 10 * 60 * 1000;
const AAD = "calendar-oauth:v1";

const b64url = (buffer: Buffer) => buffer.toString("base64url");
export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

/** The key never has a default. Without it, connecting is refused rather than stored in the clear. */
export function tokenKey(env: NodeJS.ProcessEnv = process.env): Buffer | null {
  const raw = env.CALENDAR_TOKEN_KEY;
  if (!raw) return null;
  let key: Buffer;
  try { key = Buffer.from(raw, "base64"); } catch { return null; }
  return key.length === 32 ? key : null;
}

export function encryptSecret(plain: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(AAD));
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `v1.${b64url(iv)}.${b64url(cipher.getAuthTag())}.${b64url(body)}`;
}

export function decryptSecret(payload: string, key: Buffer): string {
  const [version, iv, tag, body] = payload.split(".");
  if (version !== "v1" || !iv || !tag || !body) throw new Error("Calendar資格情報を復号できません");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAAD(Buffer.from(AAD));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
}

export interface PendingCalendarAuth {
  stateHash: string;
  verifierCipher: string;
  sessionHash: string;
  expiresAt: number;
}
export interface CalendarConnection {
  refreshTokenCipher: string;
  scope: string;
  connectedAt: string;
}

/** PKCE: the verifier never leaves the server, and only its S256 challenge is sent to Google. */
export function createVerifier() { return b64url(randomBytes(48)); }
export function challengeFor(verifier: string) { return b64url(createHash("sha256").update(verifier).digest()); }

export function beginCalendarAuth(sessionToken: string, key: Buffer, now = Date.now()) {
  const state = b64url(randomBytes(32));
  const verifier = createVerifier();
  // Only the hash is stored: a leaked store row cannot be replayed as a state.
  const pending: PendingCalendarAuth = {
    stateHash: sha256(state), verifierCipher: encryptSecret(verifier, key),
    sessionHash: sha256(sessionToken), expiresAt: now + AUTH_STATE_TTL_MS,
  };
  return { state, verifier, pending };
}

export function authorizeUrl(clientId: string, redirectUri: string, state: string, verifier: string) {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  for (const [key, value] of Object.entries({
    client_id: clientId, redirect_uri: redirectUri, response_type: "code", scope: CALENDAR_READ_SCOPE,
    // offline + consent so a refresh token is actually issued on a repeat grant.
    access_type: "offline", prompt: "consent", include_granted_scopes: "false",
    state, code_challenge: challengeFor(verifier), code_challenge_method: "S256",
  })) url.searchParams.set(key, value);
  return url.toString();
}

export type AuthStateFailure = "MISSING" | "EXPIRED" | "MISMATCH" | "SESSION";
/** Single use is enforced by the caller clearing pendingAuth inside the same CAS transaction. */
export function verifyAuthState(pending: PendingCalendarAuth | null, state: string, sessionToken: string, now = Date.now()): AuthStateFailure | null {
  if (!pending) return "MISSING";
  if (pending.expiresAt <= now) return "EXPIRED";
  const given = Buffer.from(sha256(state)), stored = Buffer.from(pending.stateHash);
  if (given.length !== stored.length || !timingSafeEqual(given, stored)) return "MISMATCH";
  const session = Buffer.from(sha256(sessionToken)), bound = Buffer.from(pending.sessionHash);
  if (session.length !== bound.length || !timingSafeEqual(session, bound)) return "SESSION";
  return null;
}

/** Reject anything broader than the read scope, including a silently upgraded grant. */
export function readOnlyScope(scope: string | undefined): boolean {
  const granted = scope?.split(/\s+/).filter(Boolean) ?? [];
  return granted.length > 0 && granted.every(s => s === CALENDAR_READ_SCOPE || s === "https://www.googleapis.com/auth/calendar.readonly");
}

export function calendarRedirectUri(request: Request, configured = process.env.RIALA_APP_ORIGIN): string {
  return `${configured ?? new URL(request.url).origin}${CALENDAR_CALLBACK_PATH}`;
}
