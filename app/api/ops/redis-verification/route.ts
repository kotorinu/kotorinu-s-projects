import "server-only";
import { authenticated } from "../../../../lib/riala-planner/security";
import { compareAndSwap, createRedisClient, redisCredentials } from "../../../../lib/server/redisClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const key = "riala:verification:20260910:3f7e4e5a";
const initial = JSON.stringify({ version: 1, value: "production-write-日本語" });
const updated = JSON.stringify({ version: 2, value: "production-update-日本語" });
const winner = (value: string) => JSON.stringify({ version: 3, value });
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });

/** Temporary authenticated operations probe. Remove after activation; expires fail-closed. */
export async function POST(request: Request) {
  if (process.env.VERCEL_ENV !== "production" || Date.now() >= Date.parse("2026-09-11T12:00:00Z")) return reply({ error: "Not found" }, 404);
  if (!authenticated(request)) return reply({ error: "Unauthorized" }, 401);
  if (process.env.RIALA_SEND_ENABLED !== "false") return reply({ error: "Send must be disabled" }, 409);
  try {
    const raw = await request.text();
    if (raw.length > 200) return reply({ error: "Invalid request" }, 400);
    const body = JSON.parse(raw);
    const c = redisCredentials(); if (!c) return reply({ error: "Unconfigured" }, 503);
    const redis = createRedisClient(c.url, c.token);
    if (body?.step === "write") return reply({ ok: await redis.set(key, initial, { nx: true }) === "OK" });
    if (body?.step === "read") return reply({ ok: await redis.get<string>(key) === initial });
    if (body?.step === "update") return reply({ ok: await compareAndSwap(redis, key, initial, updated) && await redis.get<string>(key) === updated });
    if (body?.step === "cas" && ["contender-a", "contender-b"].includes(body.contender)) {
      return reply({ won: await compareAndSwap(redis, key, updated, winner(body.contender)) });
    }
    if (body?.step === "retain") {
      const value = await redis.get<string>(key), ttl = await redis.ttl(key);
      const staleRejected = !await compareAndSwap(redis, key, updated, "must-never-replace");
      return reply({ ok: [winner("contender-a"), winner("contender-b")].includes(value ?? "") && ttl === -1 && staleRejected, ttl, staleRejected });
    }
    if (body?.step === "cleanup") return reply({ ok: await redis.del(key) === 1 });
    return reply({ error: "Invalid request" }, 400);
  } catch { return reply({ error: "Redis verification failed" }, 503); }
}
