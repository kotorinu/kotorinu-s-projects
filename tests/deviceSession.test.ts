import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deviceAuthenticated, deviceSession, DEVICE_COOKIE, DEVICE_SECONDS } from '../lib/server/deviceSession';
import { authenticated } from '../lib/riala-planner/security';
test('remembered Work OS device expires and cannot authorize external sends', () => {
  const secret = 'x'.repeat(40), now = 1000000000;
  const value = deviceSession(secret, now);
  const req = new Request('https://example.com/api/riala/work', { headers: { cookie: `${DEVICE_COOKIE}=${value}` } });
  assert.equal(deviceAuthenticated(req, secret, now + 1), true);
  assert.equal(deviceAuthenticated(req, secret, now + DEVICE_SECONDS * 1000 + 1), false);
  assert.equal(deviceAuthenticated(req, 'y'.repeat(40), now + 1), false);
  assert.equal(authenticated(req, secret, now + 1), false);
});

// 2026-09-30: 使っている間は切れない端末ログイン。
import { renewedDeviceCookies, deviceSession as issueDevice, DEVICE_SECONDS as SECONDS } from "../lib/server/deviceSession";
import { session as operatorSession } from "../lib/riala-planner/security";
const KEY = "k".repeat(40);
const req = (cookie?: string) => new Request("https://work.example/api/riala/work", { headers: cookie ? { cookie } : {} });

test("端末ログイン: 開くたびに90日延長。1日以内に延長済みなら何もしない", () => {
  const t0 = Date.parse("2026-09-30T00:00:00Z");
  assert.deepEqual(renewedDeviceCookies(req(`work_os_device=${issueDevice(KEY, t0)}`), KEY, t0 + 3600000), []);
  const later = t0 + 10 * 86400000;
  const cookies = renewedDeviceCookies(req(`work_os_device=${issueDevice(KEY, t0)}`), KEY, later);
  assert.equal(cookies.length, 2);
  assert.match(cookies[0], new RegExp(`^work_os_device=${later + SECONDS * 1000}\\.[a-f0-9]{64}; Path=/api/riala; HttpOnly; SameSite=Strict; Max-Age=${SECONDS}; Secure$`));
  assert.match(cookies[1], /^calendar_reader=/);
});

test("端末ログイン: 8時間の操作ログインからも端末Cookieを発行する（移行）", () => {
  const now = Date.now();
  assert.equal(renewedDeviceCookies(req(`riala_operator=${operatorSession(KEY, now)}`), KEY, now).length, 2);
});

test("端末ログイン: 未認証・期限切れ・署名違いでは延長しない", () => {
  const t0 = Date.parse("2026-09-30T00:00:00Z");
  assert.deepEqual(renewedDeviceCookies(req(), KEY, t0), []);
  assert.deepEqual(renewedDeviceCookies(req(`work_os_device=${issueDevice(KEY, t0)}`), KEY, t0 + SECONDS * 1000 + 1), []);
  assert.deepEqual(renewedDeviceCookies(req(`work_os_device=${issueDevice("x".repeat(40), t0)}`), KEY, t0 + 10 * 86400000), []);
});
