import { createHmac, timingSafeEqual } from "node:crypto";
import type { Store } from "./model";

export const COOKIE = "riala_operator";
export function equalSecret(a: string, b: string): boolean {
  const left = Buffer.from(a); const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
export function authConfigured() { return (process.env.RIALA_OPERATOR_SECRET?.length ?? 0) >= 32; }
export function session(secret: string, now = Date.now()) {
  const expiry = String(now + 8 * 3600000);
  return `${expiry}.${createHmac("sha256", secret).update(`riala-operator:${expiry}`).digest("hex")}`;
}
export function authenticated(request: Request, secret = process.env.RIALA_OPERATOR_SECRET ?? "", now = Date.now()) {
  if (secret.length < 32) return false;
  const token = request.headers.get("cookie")?.split(";").map(p => p.trim()).find(p => p.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  if (!token || !/^\d+\.[a-f0-9]{64}$/.test(token)) return false; const [expiry, signature] = token.split(".");
  if (!expiry || !signature || !/^\d+$/.test(expiry) || Number(expiry) <= now || Number(expiry) > now + 8 * 3600000) return false;
  return equalSecret(signature, createHmac("sha256", secret).update(`riala-operator:${expiry}`).digest("hex"));
}
export function sameOrigin(request: Request, configured = process.env.RIALA_APP_ORIGIN): boolean {
  const origin = request.headers.get("origin");
  if (process.env.VERCEL && !configured) return false;
  return origin === (configured ?? new URL(request.url).origin) && request.headers.get("sec-fetch-site") !== "cross-site";
}
export class RateLimitError extends Error {}
export async function rateLimit(store: Store, key: string, max: number, now = Date.now()) {
  const allowed = await store.transact(ledger => {
    const old = ledger.rate[key]; const next = !old || now - old.start > 60000 ? { start: now, count: 1 } : { ...old, count: old.count + 1 };
    ledger.rate[key] = next; return next.count <= max;
  });
  if (!allowed) throw new RateLimitError("操作回数の上限です。1分後に再試行してください");
}
