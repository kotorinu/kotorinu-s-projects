import { createHmac } from "node:crypto";
import { equalSecret } from "../riala-planner/security";

/**
 * A read-only device session, issued alongside the operator login.
 *
 * Each read connection gets its own cookie, its own path, and its own signed
 * purpose string. The purpose is inside the HMAC, so a Calendar reader cookie
 * cannot authenticate a Gmail request even though both are derived from the
 * same operator secret — the signature simply will not match. None of these
 * are ever accepted by RIALA's mutation or send endpoints.
 */
export const READER_SESSION_MS = 30 * 86400000;

export function readerSession(purpose: string, secret: string, now = Date.now()) {
  const expiry = String(now + READER_SESSION_MS);
  return `${expiry}.${createHmac("sha256", secret).update(`${purpose}:${expiry}`).digest("hex")}`;
}

/** The raw session token, used to bind an OAuth state to this browser. Never logged or returned. */
export function readerSessionToken(request: Request, cookieName: string): string | null {
  const token = request.headers.get("cookie")?.split(";").map(v => v.trim())
    .find(v => v.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  return token && /^\d+\.[a-f0-9]{64}$/.test(token) ? token : null;
}

export function readerAuthenticated(request: Request, cookieName: string, purpose: string, secret: string, now = Date.now()) {
  if (secret.length < 32) return false;
  const token = readerSessionToken(request, cookieName);
  if (!token) return false;
  const [expiry, signature] = token.split(".");
  return Number(expiry) > now && Number(expiry) <= now + READER_SESSION_MS &&
    equalSecret(signature, createHmac("sha256", secret).update(`${purpose}:${expiry}`).digest("hex"));
}

/**
 * SameSite=Lax, and only for these reader cookies.
 *
 * Google returns from consent as a cross-site top-level GET to the callback.
 * Under Strict the browser withholds the cookie on that navigation, so the
 * callback cannot tell which session started the connection and refuses it —
 * the connection could never complete. This was observed in production on the
 * Calendar flow before it was fixed.
 *
 * Lax sends it on exactly that case (top-level navigation, safe method) and
 * still withholds it from cross-site POSTs and sub-resource requests. None is
 * not needed and is not used: it would attach the cookie to every cross-site
 * request instead.
 *
 * Lax is not what protects the callback. The state does: random, stored only
 * as a hash, valid ten minutes, bound to this session, and consumed inside
 * the compare-and-swap that reads it. A forged callback has no usable state.
 * The RIALA operator cookie stays Strict — nothing redirects into it.
 */
export function readerCookie(request: Request, cookieName: string, purpose: string, path: string, clear = false) {
  const value = clear ? "" : readerSession(purpose, process.env.RIALA_OPERATOR_SECRET!);
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${cookieName}=${value}; HttpOnly; SameSite=Lax; Path=${path}; Max-Age=${clear ? 0 : READER_SESSION_MS / 1000}${secure}`;
}

/** Scheduler authorization is a Bearer header only: a secret in a query string lands in logs and history. */
export function cronAuthenticated(request: Request, secret = process.env.CRON_SECRET ?? "") {
  return secret.length >= 32 && equalSecret(request.headers.get("authorization") ?? "", `Bearer ${secret}`);
}
