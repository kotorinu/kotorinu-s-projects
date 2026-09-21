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
