import { createHash, randomBytes } from 'node:crypto';
import { equalSecret, sameOrigin } from '../../../../lib/riala-planner/security';
import { createRedisClient, redisCredentials } from '../../../../lib/server/redisClient';
import { DEVICE_COOKIE, DEVICE_SECONDS, deviceSession } from '../../../../lib/server/deviceSession';
export const runtime = 'nodejs';
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
export async function POST(request: Request) {
  const c = redisCredentials(), secret = process.env.RIALA_OPERATOR_SECRET ?? '';
  if (!c || secret.length < 32) return json({ error: '接続設定が未完了です' }, 503);
  try {
    const redis = createRedisClient(c.url, c.token);
    const apiKey = process.env.WORK_OS_API_SECRET ?? '';
    if (apiKey.length >= 32 && equalSecret(request.headers.get('authorization') ?? '', `Bearer ${apiKey}`)) {
      const token = randomBytes(32).toString('base64url');
      await redis.set('work:pair:' + createHash('sha256').update(token).digest('hex'), '1', { ex: 86400 });
      return json({ token, expiresIn: 86400 });
    }
    if (!sameOrigin(request)) return json({ error: 'Origin mismatch' }, 403);
    const raw = await request.text();
    if (raw.length > 256) return json({ error: 'invalid' }, 400);
    const { token } = JSON.parse(raw);
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return json({ error: 'リンクを確認してください' }, 400);
    const key = 'work:pair:' + createHash('sha256').update(token).digest('hex');
    const used = await redis.eval("local v=redis.call('GET',KEYS[1]); if v then redis.call('DEL',KEYS[1]); end; return v", [key], []);
    if (!used) return json({ error: 'リンクは使用済みか期限切れです。新しい接続リンクが必要です。' }, 401);
    return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store', 'Set-Cookie': `${DEVICE_COOKIE}=${deviceSession(secret)}; Path=/api/riala; HttpOnly; Secure; SameSite=Strict; Max-Age=${DEVICE_SECONDS}` } });
  } catch { return json({ error: '接続できませんでした。時間をおいて再度お試しください。' }, 503); }
}
