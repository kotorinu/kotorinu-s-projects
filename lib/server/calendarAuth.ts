import { createHmac } from "node:crypto";
import { equalSecret } from "../riala-planner/security";

export const CALENDAR_COOKIE = "calendar_reader";
export const CALENDAR_SESSION_MS = 30 * 86400000;
/** Read-only device authorization. Never accepted by RIALA mutation/send endpoints. */
export function calendarSession(secret: string, now = Date.now()) {
  const expiry = String(now + CALENDAR_SESSION_MS);
  return `${expiry}.${createHmac("sha256", secret).update(`calendar-reader:${expiry}`).digest("hex")}`;
}
/** The raw session token, used to bind an OAuth state to this browser. Never logged or returned. */
export function calendarSessionToken(request: Request): string | null {
  const token = request.headers.get("cookie")?.split(";").map(v => v.trim()).find(v => v.startsWith(`${CALENDAR_COOKIE}=`))?.slice(CALENDAR_COOKIE.length + 1);
  return token && /^\d+\.[a-f0-9]{64}$/.test(token) ? token : null;
}
export function calendarAuthenticated(request: Request, secret = process.env.RIALA_OPERATOR_SECRET ?? "", now = Date.now()) {
  if (secret.length < 32) return false;
  const token = calendarSessionToken(request);
  if (!token) return false;
  const [expiry, signature] = token.split(".");
  return Number(expiry) > now && Number(expiry) <= now + CALENDAR_SESSION_MS &&
    equalSecret(signature, createHmac("sha256", secret).update(`calendar-reader:${expiry}`).digest("hex"));
}
/**
 * SameSite=Lax, and only for this cookie.
 *
 * Google returns from consent as a cross-site top-level GET to
 * /api/calendar/callback. Under Strict the browser withholds this cookie on
 * that navigation, so the callback cannot tell which session started the
 * connection and refuses it — the connection could never complete.
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
export function calendarCookie(request: Request, clear = false) {
  return `${CALENDAR_COOKIE}=${clear ? "" : calendarSession(process.env.RIALA_OPERATOR_SECRET!)}; HttpOnly; SameSite=Lax; Path=/api/calendar; Max-Age=${clear ? 0 : CALENDAR_SESSION_MS / 1000}${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
}
export function cronAuthenticated(request: Request, secret = process.env.CRON_SECRET ?? "") {
  return secret.length >= 32 && equalSecret(request.headers.get("authorization") ?? "", `Bearer ${secret}`);
}
