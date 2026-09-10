import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * The parts of the Google OAuth flow that do not depend on which API is being
 * connected. Calendar established these; Gmail reuses them rather than growing
 * a second, subtly different implementation.
 *
 * Everything that differs between connections is a parameter: the scope, the
 * encryption key, and the AAD. The AAD matters — it binds a ciphertext to the
 * connection it was made for, so a Calendar token cannot be substituted into
 * the Gmail slot even if the same key were ever used for both.
 */

const b64url = (buffer: Buffer) => buffer.toString("base64url");
export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

/** A key is never defaulted or derived. Absent or wrong-sized means "cannot store", not "store in the clear". */
export function readTokenKey(name: string, env: NodeJS.ProcessEnv = process.env): Buffer | null {
  const raw = env[name];
  if (!raw) return null;
  let key: Buffer;
  try { key = Buffer.from(raw, "base64"); } catch { return null; }
  return key.length === 32 ? key : null;
}

export function encryptWithKey(plain: string, key: Buffer, aad: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(aad));
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `v1.${b64url(iv)}.${b64url(cipher.getAuthTag())}.${b64url(body)}`;
}

export function decryptWithKey(payload: string, key: Buffer, aad: string): string {
  const [version, iv, tag, body] = payload.split(".");
  if (version !== "v1" || !iv || !tag || !body) throw new Error("資格情報を復号できません");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
}

export interface PendingAuth {
  stateHash: string;
  verifierCipher: string;
  sessionHash: string;
  expiresAt: number;
}
export interface OAuthConnection {
  refreshTokenCipher: string;
  scope: string;
  connectedAt: string;
}

export const AUTH_STATE_TTL_MS = 10 * 60 * 1000;

/** PKCE: the verifier never leaves the server, and only its S256 challenge is sent to Google. */
export function createVerifier() { return b64url(randomBytes(48)); }
export function challengeFor(verifier: string) { return b64url(createHash("sha256").update(verifier).digest()); }

export function beginAuth(sessionToken: string, key: Buffer, aad: string, now = Date.now()) {
  const state = b64url(randomBytes(32));
  const verifier = createVerifier();
  // Only the hash is stored: a leaked store row cannot be replayed as a state.
  const pending: PendingAuth = {
    stateHash: sha256(state), verifierCipher: encryptWithKey(verifier, key, aad),
    sessionHash: sha256(sessionToken), expiresAt: now + AUTH_STATE_TTL_MS,
  };
  return { state, verifier, pending };
}

export function googleAuthorizeUrl(input: { clientId: string; redirectUri: string; scope: string; state: string; verifier: string }) {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  for (const [key, value] of Object.entries({
    client_id: input.clientId, redirect_uri: input.redirectUri, response_type: "code", scope: input.scope,
    // offline + consent so a refresh token is actually issued on a repeat grant.
    access_type: "offline", prompt: "consent", include_granted_scopes: "false",
    state: input.state, code_challenge: challengeFor(input.verifier), code_challenge_method: "S256",
  })) url.searchParams.set(key, value);
  return url.toString();
}

export type AuthStateFailure = "MISSING" | "EXPIRED" | "MISMATCH" | "SESSION";
/** Single use is enforced by the caller clearing pendingAuth inside the same CAS transaction. */
export function verifyAuthState(pending: PendingAuth | null, state: string, sessionToken: string, now = Date.now()): AuthStateFailure | null {
  if (!pending) return "MISSING";
  if (pending.expiresAt <= now) return "EXPIRED";
  const given = Buffer.from(sha256(state)), stored = Buffer.from(pending.stateHash);
  if (given.length !== stored.length || !timingSafeEqual(given, stored)) return "MISMATCH";
  const session = Buffer.from(sha256(sessionToken)), bound = Buffer.from(pending.sessionHash);
  if (session.length !== bound.length || !timingSafeEqual(session, bound)) return "SESSION";
  return null;
}

/**
 * A grant is accepted only when every scope it carries is one we asked for.
 * An empty scope is rejected too: "we cannot tell" is not permission.
 */
export function grantedScopeAllowed(scope: string | undefined, allowed: readonly string[]): boolean {
  const granted = scope?.split(/\s+/).filter(Boolean) ?? [];
  return granted.length > 0 && granted.every(s => allowed.includes(s));
}

/** Built from the configured origin, never the request Host, so a spoofed Host cannot redirect a grant. */
export function redirectUriFor(request: Request, path: string, configured = process.env.RIALA_APP_ORIGIN): string {
  return `${configured ?? new URL(request.url).origin}${path}`;
}
