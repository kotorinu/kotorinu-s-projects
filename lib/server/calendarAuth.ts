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
export function calendarCookie(request: Request, clear = false) {
  return `${CALENDAR_COOKIE}=${clear ? "" : calendarSession(process.env.RIALA_OPERATOR_SECRET!)}; HttpOnly; SameSite=Strict; Path=/api/calendar; Max-Age=${clear ? 0 : CALENDAR_SESSION_MS / 1000}${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
}
export function cronAuthenticated(request: Request, secret = process.env.CRON_SECRET ?? "") {
  return secret.length >= 32 && equalSecret(request.headers.get("authorization") ?? "", `Bearer ${secret}`);
}
