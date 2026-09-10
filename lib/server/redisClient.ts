import "server-only";
import { Redis } from "@upstash/redis";

/** Complete credential pairs only; never substitute the read-only token. */
export function redisCredentials(env: Record<string, string | undefined> = process.env) {
  for (const [url, token] of [
    [env.KV_REST_API_URL, env.KV_REST_API_TOKEN],
    [env.RIALA_REDIS_REST_URL, env.RIALA_REDIS_REST_TOKEN],
    [env.UPSTASH_REDIS_REST_URL, env.UPSTASH_REDIS_REST_TOKEN],
  ]) if (url && token) return { url, token };
  return null;
}

export function createRedisClient(url: string, token: string) {
  // Validate before SDK construction; SDK validation warnings may include URLs.
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new Error("Redis configuration is invalid"); }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash ||
    parsed.pathname !== "/" || url.trim() !== url || token.trim() !== token || !token || /[\r\n]/.test(token)) {
    throw new Error("Redis configuration is invalid");
  }
  return new Redis({
    url, token, automaticDeserialization: false, responseEncoding: false,
    enableAutoPipelining: false, enableTelemetry: false, latencyLogging: false,
    // In SDK 1.38.4 retry:false still attempts twice; zero retries means one request.
    retry: { retries: 0 }, cache: "no-store", signal: () => AbortSignal.timeout(10000),
  });
}

/** Compare exact serialized values and replace atomically, with no expiry. */
export async function compareAndSwap(redis: Redis, key: string, expected: string | null, next: string) {
  const script = "local v=redis.call('GET',KEYS[1]); if (v or '')~=ARGV[1] then return 0 end; redis.call('SET',KEYS[1],ARGV[2]); return 1";
  return await redis.eval<string[], number>(script, [key], [expected ?? "", next]) === 1;
}
