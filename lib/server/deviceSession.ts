import { createHmac } from 'node:crypto';
import { authenticated, equalSecret } from '../riala-planner/security';
import { calendarCookie } from './calendarAuth';
export const DEVICE_COOKIE = 'work_os_device';
export const DEVICE_SECONDS = 90 * 24 * 3600;
const DAY_MS = 86400000;
export function deviceSession(secret: string, now = Date.now()) {
  const expiry = String(now + DEVICE_SECONDS * 1000);
  return `${expiry}.${createHmac('sha256', secret).update(`work-device:${expiry}`).digest('hex')}`;
}
function deviceToken(request: Request) {
  const value = request.headers.get('cookie')?.split(';').map(x => x.trim()).find(x => x.startsWith(DEVICE_COOKIE + '='))?.slice(DEVICE_COOKIE.length + 1);
  return value && /^\d+\.[a-f0-9]{64}$/.test(value) ? value : null;
}
/** A remembered device can operate Work OS, never the external-send endpoint. */
export function deviceAuthenticated(request: Request, secret = process.env.RIALA_OPERATOR_SECRET ?? '', now = Date.now()) {
  if (secret.length < 32) return false;
  const value = deviceToken(request);
  if (!value) return false;
  const [expiry, signature] = value.split('.');
  if (+expiry <= now || +expiry > now + DEVICE_SECONDS * 1000) return false;
  return equalSecret(signature, createHmac('sha256', secret).update(`work-device:${expiry}`).digest('hex'));
}
export function deviceCookie(request: Request, secret = process.env.RIALA_OPERATOR_SECRET ?? '', now = Date.now()) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${DEVICE_COOKIE}=${deviceSession(secret, now)}; Path=/api/riala; HttpOnly; SameSite=Strict; Max-Age=${DEVICE_SECONDS}${secure}`;
}
/**
 * 使っている間は切れない端末ログイン (2026-09-30, 本人の依頼)。
 *
 * このアプリの利用者は本人だけで、8時間ごとの再ログインが負担になっていた。
 * 一度ログインした端末は、Work OSを開くたびに期限を90日先へ延ばす。
 * 90日間まったく開かなかった端末だけがログアウトされる。
 *
 * 延長するのは Work OS 用の端末Cookieと Calendar 読取Cookie だけ。RIALAの
 * 送信・承認に使う操作Cookie（8時間）は延長しない。延長は、すでに本人として
 * 認証されたリクエスト（端末Cookieまたは操作Cookie）でだけ行い、Worker・外部AI
 * のBearerでは行わない。1日以内に延長済みなら何もしない。
 */
export function renewedDeviceCookies(request: Request, secret = process.env.RIALA_OPERATOR_SECRET ?? '', now = Date.now()): string[] {
  if (secret.length < 32) return [];
  const device = deviceAuthenticated(request, secret, now);
  if (!device && !authenticated(request, secret, now)) return [];
  const expiry = device ? Number(deviceToken(request)!.split('.')[0]) : 0;
  if (device && expiry - now > DEVICE_SECONDS * 1000 - DAY_MS) return [];
  return [deviceCookie(request, secret, now), calendarCookie(request, false, secret)];
}
export function withRenewedDevice(request: Request, response: Response): Response {
  for (const cookie of renewedDeviceCookies(request)) response.headers.append('Set-Cookie', cookie);
  return response;
}
