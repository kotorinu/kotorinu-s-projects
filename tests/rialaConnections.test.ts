import test from "node:test";
import assert from "node:assert/strict";
import { GET, POST } from "../app/api/riala/route";
import { emptyLedger, type Facts, type Member, type Store, type Ledger } from "../lib/riala-planner/model";
import { plan } from "../lib/riala-planner/planner";
import { observedReadiness } from "../lib/riala-planner/readiness";
import { authenticated, COOKIE, session } from "../lib/riala-planner/security";
import { RealGmailProvider, GMAIL_READ_SCOPE, validMember, validCatalog } from "../lib/riala-planner/providers";
import { configuredStore, RedisStore } from "../lib/riala-planner/store";
import { approveAndSend } from "../lib/riala-planner/service";

const NOW = "2026-09-10T00:00:00.000Z";
const ORIGIN = "https://planner.example.test";
const SECRET = "test-only-operator-key-not-a-production-secret";
const evidence = { sourceId: "fixture", reference: "https://community.riala.jp/members/test", quote: "fixture only", observedAt: NOW };
const member: Member = { id: "fixture-member", name: "Fixture", registeredAt: null, email: null, emailVerified: null, isStaff: false, active: true, interests: [], evidence };
function facts(): Facts {
  const base = { sourceId: "fixture", mode: "LIVE" as const, readAt: NOW, complete: true, failure: null };
  return { members: { ...base, name: "members", items: [member] }, gmail: { ...base, name: "gmail", items: [] },
    events: { ...base, name: "events", items: [], mode: "UNCONNECTED", complete: false }, content: { ...base, name: "content", items: [], mode: "UNCONNECTED", complete: false } };
}
async function environment(values: Record<string, string | undefined>, work: () => Promise<void>) {
  const original = { ...process.env };
  for (const key of Object.keys(process.env)) if (key.startsWith("RIALA_") || key === "VERCEL") delete process.env[key];
  for (const [key, value] of Object.entries(values)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  try { await work(); } finally { for (const key of Object.keys(process.env)) if (!(key in original)) delete process.env[key]; Object.assign(process.env, original); }
}
function request(body: unknown, cookie?: string, origin = ORIGIN) {
  return new Request(`${ORIGIN}/api/riala`, { method: "POST", headers: { "content-type": "application/json", origin, ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
}
function memoryStore(): Store {
  let state = emptyLedger();
  return { read: async () => structuredClone(state), transact: async <T>(fn: (l: Ledger) => T) => { const next = structuredClone(state); const result = fn(next); state = next; return result; } };
}

test("RIALA connection: optional sources do not prevent a real member baseline; no bulk welcome", () => {
  const l = emptyLedger(); const f = facts();
  f.members.items.push({ ...member, id: "staff", isStaff: true }, { ...member, id: "unknown", isStaff: null });
  const run = plan(l, f, NOW, "baseline");
  assert.equal(l.baselineAt, NOW); assert.equal(l.seenMemberIds.length, 3); assert.equal(l.actions.length, 0);
  assert.deepEqual(run.memberSummary, { total: 3, staffExcluded: 1, activeMembers: 1, unknownEligibility: 1, seenMemberIds: 3 });
  assert.equal(run.decisions.length, 2);
  plan(l, f, NOW, "again"); assert.equal(l.actions.length, 0);
});
test("RIALA connection: missing Gmail prevents baseline and unknown fields remain unknown", () => {
  assert.equal(validMember(member), true);
  assert.equal(validMember({ ...member, isStaff: undefined }), false);
  assert.equal(validCatalog({ id: "test", title: "test", summary: "UNKNOWN", url: null, topics: [], sourceUpdatedAt: null, evidence }), true);
  const f = facts(); f.gmail.complete = false; const l = emptyLedger();
  plan(l, f, NOW, "stopped"); assert.equal(l.baselineAt, null); assert.equal(l.seenMemberIds.length, 0);
});
test("RIALA connection: unknown staff never generates a welcome; unknown registration requires review", () => {
  const l = emptyLedger(); l.baselineAt = "2026-09-01T00:00:00.000Z";
  const f = facts(); f.members.items.push({ ...member, id: "unknown", isStaff: null });
  plan(l, f, NOW, "scan");
  assert.equal(l.actions.length, 1); assert.equal(l.actions[0].status, "NEEDS_REVIEW");
  assert.match(l.actions[0].stopReason!, /不明/); assert.equal(l.actions[0].recommendations.length, 0);
});
test("RIALA connection: configured URLs are not readiness; stale successful reads expire", async () => {
  await environment({ VERCEL: "1", RIALA_MEMBERS_SOURCE_URL: "https://source.example.test", RIALA_MEMBERS_SOURCE_TOKEN: "fixture" }, async () => {
    assert.equal(observedReadiness(null, NOW).members, false);
    const l = emptyLedger(); plan(l, facts(), NOW, "r");
    assert.equal(observedReadiness(l, NOW).members, true);
    assert.equal(observedReadiness(l, NOW).events, false);
    assert.equal(observedReadiness(l, "2026-09-10T02:00:00.000Z").members, false);
    assert.equal(observedReadiness(l, NOW).send, false);
  });
});
test("RIALA security: signed cookies reject tampering, expiry, and trailing bytes", () => {
  const now = Date.parse(NOW), token = session(SECRET, now);
  const req = (value: string) => new Request(`${ORIGIN}/api/riala`, { headers: { cookie: `${COOKIE}=${value}` } });
  assert.equal(authenticated(req(token), SECRET, now), true);
  assert.equal(authenticated(req(token + ".extra"), SECRET, now), false);
  assert.equal(authenticated(req(token), SECRET + "x", now), false);
  assert.equal(authenticated(req(token), SECRET, now + 8 * 3600000), false);
});
test("RIALA security: production never selects FileStore", async () => {
  await environment({ VERCEL: "1", RIALA_PLANNER_DATA_DIR: "unused" }, async () => assert.equal(configuredStore(), null));
});
test("RIALA security: route auth, origin, JSON redaction, durable rate limit, and send OFF", async () => {
  await environment({ VERCEL: "1", RIALA_APP_ORIGIN: ORIGIN, RIALA_OPERATOR_SECRET: SECRET,
    RIALA_REDIS_REST_URL: "https://redis.example.test", RIALA_REDIS_REST_TOKEN: "fixture-redis-token", RIALA_SEND_ENABLED: "false" }, async () => {
    const originalFetch = globalThis.fetch; let raw: string | null = null; let externalCalls = 0;
    globalThis.fetch = async (input, init) => {
      if (String(input) !== "https://redis.example.test") { externalCalls++; throw new Error("Unexpected external effect"); }
      const args = JSON.parse(String(init?.body));
      if (args[0] === "GET") return Response.json({ result: raw });
      assert.equal(args[0], "EVAL");
      if ((raw ?? "") !== args[4]) return Response.json({ result: 0 });
      raw = args[5]; return Response.json({ result: 1 });
    };
    try {
      const initial = await GET(new Request(`${ORIGIN}/api/riala`));
      const initialText = await initial.text(); assert.equal(initial.status, 200);
      assert.equal(initial.headers.get("cache-control"), "no-store");
      assert.equal(initialText.includes(SECRET), false); assert.equal(initialText.includes("fixture-redis-token"), false);
      assert.equal((await POST(request({ command: "scan" }))).status, 401);
      assert.equal((await POST(request({ command: "login", secret: SECRET }, undefined, "https://other.example.test"))).status, 403);
      const malformed = await POST(new Request(`${ORIGIN}/api/riala`, { method: "POST", headers: { origin: ORIGIN, "content-type": "application/json" }, body: '{"x":"credential-do-not-echo"' }));
      assert.equal(malformed.status, 400); assert.equal((await malformed.text()).includes("credential-do-not-echo"), false);
      assert.equal((await POST(request(null))).status, 400);
      const login = await POST(request({ command: "login", secret: SECRET }));
      assert.equal(login.status, 200); const cookie = login.headers.get("set-cookie")!;
      for (const flag of ["HttpOnly", "Secure", "SameSite=Strict", "Path=/api/riala"]) assert.ok(cookie.includes(flag));
      const state = await GET(new Request(`${ORIGIN}/api/riala`, { headers: { cookie: cookie.split(";")[0] } }));
      assert.equal((await state.json()).readiness.store, true);
      const disabled = await POST(request({ command: "approve", selections: [] }, cookie.split(";")[0]));
      assert.equal(disabled.status, 409); assert.match(await disabled.text(), /OFF/);
      for (let i = 0; i < 4; i++) assert.equal((await POST(request({ command: "login", secret: "wrong" }))).status, 401);
      const limited = await POST(request({ command: "login", secret: "wrong" })); assert.equal(limited.status, 429); assert.equal(limited.headers.get("retry-after"), "60");
      assert.equal(externalCalls, 0);
      const otherInstance = new RedisStore("https://redis.example.test", "fixture-redis-token");
      assert.equal((await otherInstance.read()).rate.login.count, 6);
    } finally { globalThis.fetch = originalFetch; }
  });
});
test("RIALA safety: disabled sender stops before sources, mutations, and send calls", async () => {
  const store = memoryStore(); let calls = 0;
  const fail = async (): Promise<never> => { calls++; throw new Error("must not call"); };
  await assert.rejects(approveAndSend(store, { members: { read: fail }, gmail: { read: fail }, events: { read: fail }, content: { read: fail } }, { enabled: false, send: fail, readBack: fail }, []));
  assert.equal(calls, 0); assert.deepEqual(await store.read(), emptyLedger());
});
test("RIALA Gmail READ: real adapter requests only sent metadata and records masked diagnostics", async () => {
  await environment({ RIALA_GMAIL_CLIENT_ID: "fixture-id", RIALA_GMAIL_CLIENT_SECRET: "fixture-secret", RIALA_GMAIL_READ_REFRESH_TOKEN: "fixture-refresh" }, async () => {
    const original = globalThis.fetch; const calls: URL[] = [];
    globalThis.fetch = async (input, init) => {
      const url = new URL(String(input)); calls.push(url);
      if (url.hostname === "oauth2.googleapis.com") { assert.equal(init?.method, "POST"); return Response.json({ access_token: "fixture-access", scope: GMAIL_READ_SCOPE }); }
      assert.equal(init?.method, undefined); assert.equal(init?.redirect, "error");
      if (url.pathname.endsWith("/profile")) return Response.json({ emailAddress: "operator@example.test" });
      if (url.pathname.endsWith("/messages")) {
        assert.match(url.searchParams.get("q")!, /^in:sent RIALA after:\d+ before:\d+$/);
        return Response.json({ messages: [{ id: "fixture-mail" }] });
      }
      assert.equal(url.searchParams.get("format"), "metadata");
      assert.deepEqual(url.searchParams.getAll("metadataHeaders"), ["To", "Bcc", "Cc", "Subject"]);
      assert.equal(url.searchParams.get("fields")!.includes("body"), false);
      return Response.json({ id: "fixture-mail", threadId: "fixture-thread", internalDate: String(Date.parse(NOW)), labelIds: ["SENT"], payload: { headers: [{ name: "To", value: "Fixture <fixture@example.test>" }, { name: "Subject", value: "RIALA fixture" }] } });
    };
    try {
      const result = await new RealGmailProvider().read(NOW);
      assert.equal(result.complete, true); assert.equal(result.items.length, 1);
      assert.deepEqual(result.diagnostics, { messageCount: 1, latestMessageAt: NOW, accountMasked: "o***@example.test", scope: GMAIL_READ_SCOPE });
      assert.equal(JSON.stringify(result).includes("fixture-access"), false);
      assert.equal(calls.some(c => /send|drafts/.test(c.pathname)), false);
      globalThis.fetch = async () => Response.json({ access_token: "fixture-access", scope: GMAIL_READ_SCOPE + " https://www.googleapis.com/auth/gmail.send" });
      const broad = await new RealGmailProvider().read(NOW); assert.equal(broad.complete, false); assert.equal(broad.items.length, 0);
    } finally { globalThis.fetch = original; }
  });
});
test("RIALA Gmail READ: 200 is complete only when pagination ends; overflow and loops fail closed", async () => {
  await environment({ RIALA_GMAIL_CLIENT_ID: "fixture-id", RIALA_GMAIL_CLIENT_SECRET: "fixture-secret", RIALA_GMAIL_READ_REFRESH_TOKEN: "fixture-refresh" }, async () => {
    const original = globalThis.fetch;
    try {
      for (const mode of ["complete", "overflow", "loop"]) {
        let pages = 0, details = 0;
        globalThis.fetch = async input => {
          const u = new URL(String(input));
          if (u.hostname === "oauth2.googleapis.com") return Response.json({ access_token: "fixture", scope: GMAIL_READ_SCOPE });
          if (u.pathname.endsWith("/profile")) return Response.json({ emailAddress: "fixture@example.test" });
          if (u.pathname.endsWith("/messages")) {
            const offset = pages++ * 50;
            return Response.json({ messages: Array.from({ length: 50 }, (_, i) => ({ id: `m${offset+i}` })),
              ...(pages < 4 || mode === "overflow" ? { nextPageToken: mode === "loop" ? "same-page" : `page${pages}` } : {}) });
          }
          details++;
          return Response.json({ id: u.pathname.split("/").at(-1), threadId: "fixture", internalDate: String(Date.parse(NOW)), labelIds: ["SENT"], payload: { headers: [] } });
        };
        const result = await new RealGmailProvider().read(NOW);
        assert.equal(result.complete, mode === "complete");
        assert.equal(result.items.length, mode === "complete" ? 200 : 0);
        assert.ok(pages <= 4); assert.ok(details <= 200);
      }
    } finally { globalThis.fetch = original; }
  });
});
