import { createHmac } from 'node:crypto';
import { equalSecret } from '../riala-planner/security';
export const DEVICE_COOKIE = 'work_os_device';
export const DEVICE_SECONDS = 90 * 24 * 3600;
export function deviceSession(secret: string, now = Date.now()) {
  const expiry = String(now + DEVICE_SECONDS * 1000);
  return `${expiry}.${createHmac('sha256', secret).update(`work-device:${expiry}`).digest('hex')}`;
}
/** A remembered device can operate Work OS, never the external-send endpoint. */
export function deviceAuthenticated(request: Request, secret = process.env.RIALA_OPERATOR_SECRET ?? '', now = Date.now()) {
  if (secret.length < 32) return false;
  const value = request.headers.get('cookie')?.split(';').map(x => x.trim()).find(x => x.startsWith(DEVICE_COOKIE + '='))?.slice(DEVICE_COOKIE.length + 1);
  if (!value || !/^\d+\.[a-f0-9]{64}$/.test(value)) return false;
  const [expiry, signature] = value.split('.');
  if (+expiry <= now || +expiry > now + DEVICE_SECONDS * 1000) return false;
  return equalSecret(signature, createHmac('sha256', secret).update(`work-device:${expiry}`).digest('hex'));
}
