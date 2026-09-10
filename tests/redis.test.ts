import test from "node:test";
import assert from "node:assert/strict";
import { compareAndSwap, createRedisClient, redisCredentials } from "../lib/server/redisClient";
import { RedisStore } from "../lib/riala-planner/store";
import { emptyLedger } from "../lib/riala-planner/model";

test("Redis credentials use complete writable pairs and reject read-only/partial configuration", () => {
  assert.deepEqual(redisCredentials({ KV_REST_API_URL: "kv", KV_REST_API_TOKEN: "write", KV_REST_API_READ_ONLY_TOKEN: "read" }), { url: "kv", token: "write" });
  assert.equal(redisCredentials({ KV_REST_API_URL: "kv", KV_REST_API_READ_ONLY_TOKEN: "read", RIALA_REDIS_REST_TOKEN: "legacy" }), null);
  assert.deepEqual(redisCredentials({ RIALA_REDIS_REST_URL: "legacy", RIALA_REDIS_REST_TOKEN: "write" }), { url: "legacy", token: "write" });
  for (const url of ["invalid-secret", "http://redis.example.test", "https://user:secret@redis.example.test", "https://redis.example.test?secret=value"]) {
    assert.throws(() => createRedisClient(url, "fixture"), { message: "Redis configuration is invalid" });
  }
});

test("Redis SDK preserves JSON bytes, atomically rejects stale writers and adds no expiry", async () => {
  const original = globalThis.fetch;
  let raw: string | null = null;
  const commands: unknown[][] = [];
  globalThis.fetch = async (_input, init) => {
    assert.equal(init?.cache, "no-store");
    const args = JSON.parse(String(init?.body)); commands.push(args);
    if (args[0] === "get") return Response.json({ result: raw });
    assert.equal(args[0], "eval"); assert.equal(args.length, 6);
    assert.doesNotMatch(args[1], /EXPIRE|PEXPIRE|SETEX|\bEX\b|\bPX\b/);
    if ((raw ?? "") !== args[4]) return Response.json({ result: 0 });
    raw = args[5]; return Response.json({ result: 1 });
  };
  try {
    const redis = createRedisClient("https://redis.example.test", "fixture");
    const a = JSON.stringify({ version: 1, value: "日本語・改行\n" });
    assert.equal(await compareAndSwap(redis, "fixture", null, a), true);
    assert.equal(await redis.get("fixture"), a);
    const won = await Promise.all([compareAndSwap(redis, "fixture", a, "winner-a"), compareAndSwap(redis, "fixture", a, "winner-b")]);
    assert.equal(won.filter(Boolean).length, 1);
    assert.equal(await compareAndSwap(redis, "fixture", a, "stale"), false);
    assert.equal(raw, "winner-a"); assert.equal(commands.length, 5);
  } finally { globalThis.fetch = original; }
});

test("RedisStore concurrent transactions retain both changes and version; no retry after unknown write", async () => {
  const original = globalThis.fetch;
  let raw = JSON.stringify(emptyLedger()), writes = 0, fail = false;
  globalThis.fetch = async (_input, init) => {
    const args = JSON.parse(String(init?.body));
    if (args[0] === "get") return Response.json({ result: raw });
    writes++;
    if (fail) throw new Error("provider-secret-must-not-escape");
    if (raw !== args[4]) return Response.json({ result: 0 });
    raw = args[5]; return Response.json({ result: 1 });
  };
  try {
    const a = new RedisStore("https://redis.example.test", "fixture"), b = new RedisStore("https://redis.example.test", "fixture");
    await Promise.all([a.transact(l => { l.seenMemberIds.push("fixture-a"); }), b.transact(l => { l.seenMemberIds.push("fixture-b"); })]);
    const saved = await b.read(); assert.equal(saved.version, 2); assert.deepEqual(saved.seenMemberIds.sort(), ["fixture-a", "fixture-b"]);
    fail = true; writes = 0;
    await assert.rejects(a.transact(l => { l.seenMemberIds.push("unknown"); }), { message: "Planner Storeの更新結果を確認できません。再読み込みしてください" });
    assert.equal(writes, 1);
  } finally { globalThis.fetch = original; }
});
