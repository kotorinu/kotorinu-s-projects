import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  authorizeUrl, beginCalendarAuth, CALENDAR_CALLBACK_PATH, CALENDAR_READ_SCOPE, calendarRedirectUri,
  challengeFor, decryptSecret, encryptSecret, readOnlyScope, tokenKey, verifyAuthState, AUTH_STATE_TTL_MS,
} from "../lib/server/calendarOAuth";
import { emptyCalendarState, type CalendarState } from "../lib/server/calendarRefresh";
import { LiveGoogleCalendarProvider } from "../lib/server/liveGoogleCalendar";
import { CALENDAR_COOKIE, calendarSession, calendarSessionToken } from "../lib/server/calendarAuth";

const KEY = randomBytes(32);
const SECRET = "fixture-only-calendar-operator-secret";
const ORIGIN = "https://fixture.example.test";
const REFRESH = "fixture-refresh-token-value";
/** The read window is anchored on the real JST day, so the fixture event must be too. */
function jstToday() { return new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10); }

test("Calendar OAuth encryption round-trips, is non-deterministic, and rejects tampering or a wrong key", () => {
  const first = encryptSecret(REFRESH, KEY), second = encryptSecret(REFRESH, KEY);
  assert.equal(decryptSecret(first, KEY), REFRESH);
  assert.notEqual(first, second, "a fresh IV each time");
  assert.equal(first.includes(REFRESH), false, "the plaintext never appears in the stored value");
  assert.equal(first.startsWith("v1."), true);
  assert.throws(() => decryptSecret(first, randomBytes(32)));
  const [v, iv, tag, body] = first.split(".");
  const flipped = Buffer.from(body, "base64url"); flipped[0] ^= 0xff;
  // GCM rejects a modified ciphertext.
  assert.throws(() => decryptSecret([v, iv, tag, flipped.toString("base64url")].join("."), KEY));
  assert.throws(() => decryptSecret("v1.only.three", KEY));
});

test("Calendar OAuth key must be exactly 32 bytes and is never defaulted", () => {
  assert.equal(tokenKey({ NODE_ENV: "test" }), null);
  assert.equal(tokenKey({ NODE_ENV: "test", CALENDAR_TOKEN_KEY: randomBytes(16).toString("base64") }), null, "a short key is refused, not padded");
  assert.equal(tokenKey({ NODE_ENV: "test", CALENDAR_TOKEN_KEY: randomBytes(64).toString("base64") }), null);
  assert.equal(tokenKey({ NODE_ENV: "test", CALENDAR_TOKEN_KEY: KEY.toString("base64") })?.length, 32);
});

test("Calendar OAuth authorize URL requests read-only offline access with S256 PKCE", () => {
  const { state, verifier } = beginCalendarAuth("fixture-session", KEY);
  const url = new URL(authorizeUrl("fixture-client", `${ORIGIN}${CALENDAR_CALLBACK_PATH}`, state, verifier));
  assert.equal(url.origin + url.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
  assert.equal(url.searchParams.get("scope"), CALENDAR_READ_SCOPE);
  assert.equal(url.searchParams.get("scope")!.includes("gmail"), false);
  assert.equal(url.searchParams.get("access_type"), "offline");
  assert.equal(url.searchParams.get("prompt"), "consent");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("code_challenge"), challengeFor(verifier));
  assert.equal(url.searchParams.get("code_challenge")!.includes(verifier), false, "the verifier itself is never sent");
  assert.equal(url.toString().includes(KEY.toString("base64")), false);
});

test("Calendar OAuth state is single-use, expires in 10 minutes, and is bound to the browser session", () => {
  const now = Date.parse("2026-09-10T04:00:00+09:00");
  const session = calendarSession(SECRET, now);
  const { state, pending } = beginCalendarAuth(session, KEY, now);
  assert.equal(pending.stateHash.includes(state), false, "only the hash is stored");
  assert.equal(pending.verifierCipher.startsWith("v1."), true, "the verifier is encrypted at rest");
  assert.equal(AUTH_STATE_TTL_MS, 10 * 60 * 1000);

  assert.equal(verifyAuthState(pending, state, session, now + 60000), null);
  assert.equal(verifyAuthState(pending, state, session, now + AUTH_STATE_TTL_MS), "EXPIRED");
  assert.equal(verifyAuthState(pending, "attacker-supplied-state", session, now), "MISMATCH");
  assert.equal(verifyAuthState(pending, state, calendarSession(SECRET, now + 1), now), "SESSION", "another browser cannot complete this connection");
  assert.equal(verifyAuthState(null, state, session, now), "MISSING", "a replayed callback finds nothing left");
});

test("Calendar OAuth consuming a state clears it inside the same transaction", () => {
  const now = Date.now(), session = calendarSession(SECRET, now);
  const { state, pending } = beginCalendarAuth(session, KEY, now);
  let stored: CalendarState = { ...emptyCalendarState(), pendingAuth: pending };
  const consume = () => {
    const failure = verifyAuthState(stored.pendingAuth ?? null, state, session, now);
    stored = { ...stored, pendingAuth: null };
    return failure;
  };
  assert.equal(consume(), null);
  assert.equal(consume(), "MISSING", "the same code cannot be redeemed twice");
});

test("Calendar OAuth refuses any scope broader than reading events", () => {
  assert.equal(readOnlyScope(CALENDAR_READ_SCOPE), true);
  assert.equal(readOnlyScope("https://www.googleapis.com/auth/calendar.readonly"), true);
  assert.equal(readOnlyScope("https://www.googleapis.com/auth/calendar"), false, "write scope");
  assert.equal(readOnlyScope(`${CALENDAR_READ_SCOPE} https://www.googleapis.com/auth/gmail.send`), false, "no Gmail");
  assert.equal(readOnlyScope(`${CALENDAR_READ_SCOPE} https://www.googleapis.com/auth/calendar.events`), false);
  assert.equal(readOnlyScope(""), false);
  assert.equal(readOnlyScope(undefined), false);
});

test("Calendar redirect URI uses the configured origin so a spoofed Host cannot redirect the grant", () => {
  const request = new Request("https://attacker.example.test/api/calendar/callback");
  assert.equal(calendarRedirectUri(request, ORIGIN), `${ORIGIN}${CALENDAR_CALLBACK_PATH}`);
  assert.equal(calendarRedirectUri(request, undefined), `https://attacker.example.test${CALENDAR_CALLBACK_PATH}`);
});

test("Calendar live read uses the connected refresh token and never reflects it outward", async () => {
  const env: NodeJS.ProcessEnv = { NODE_ENV: "test", GOOGLE_CALENDAR_CLIENT_ID: "fixture-id", GOOGLE_CALENDAR_CLIENT_SECRET: "fixture-secret" };
  const cipher = encryptSecret(REFRESH, KEY);
  let sentRefreshToken: string | null = null;
  const http: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.hostname === "oauth2.googleapis.com") {
      sentRefreshToken = new URLSearchParams(String(init!.body)).get("refresh_token");
      return Response.json({ access_token: "fixture-access", scope: CALENDAR_READ_SCOPE });
    }
    return Response.json({ items: [] });
  };
  // No GOOGLE_CALENDAR_REFRESH_TOKEN in env: the token comes from the encrypted connection.
  const provider = new LiveGoogleCalendarProvider(env, http, () => Date.parse("2026-09-10T04:00:00+09:00"), async () => decryptSecret(cipher, KEY));
  const result = await provider.read("2026-09-09", "2026-09-17");
  assert.equal(sentRefreshToken, REFRESH);
  assert.equal(JSON.stringify(result).includes(REFRESH), false);
  assert.equal(JSON.stringify(result).includes("fixture-access"), false);
  assert.equal(result.sourceMode, "LIVE");

  // Without any token source the read fails rather than returning invented events.
  await assert.rejects(new LiveGoogleCalendarProvider(env, http, Date.now).read("2026-09-09", "2026-09-17"));
});

test("Calendar session token is only returned for a well-formed cookie", () => {
  const token = calendarSession(SECRET);
  assert.equal(calendarSessionToken(new Request(ORIGIN, { headers: { cookie: `${CALENDAR_COOKIE}=${token}` } })), token);
  assert.equal(calendarSessionToken(new Request(ORIGIN, { headers: { cookie: `${CALENDAR_COOKIE}=garbage` } })), null);
  assert.equal(calendarSessionToken(new Request(ORIGIN)), null);
});

test("Calendar OAuth HTTP: connect -> Google consent -> callback stores an encrypted token; replay and cross-session are refused", async () => {
  const originalEnv = { ...process.env }, originalFetch = globalThis.fetch;
  const { POST: connectPOST } = await import("../app/api/calendar/connect/route");
  const { GET: callbackGET } = await import("../app/api/calendar/callback/route");
  const { configuredCalendarStore, calendarReaderFor } = await import("../lib/server/calendarRefresh");
  Object.assign(process.env, {
    VERCEL: "1", RIALA_APP_ORIGIN: ORIGIN, RIALA_OPERATOR_SECRET: SECRET, CALENDAR_TOKEN_KEY: KEY.toString("base64"),
    GOOGLE_CALENDAR_CLIENT_ID: "fixture-id", GOOGLE_CALENDAR_CLIENT_SECRET: "fixture-secret",
    RIALA_REDIS_REST_URL: "https://redis.fixture.test", RIALA_REDIS_REST_TOKEN: "fixture-token",
  });
  delete process.env.GOOGLE_CALENDAR_REFRESH_TOKEN;
  const raw = new Map<string, string>();
  let grantedScope = CALENDAR_READ_SCOPE, issueRefreshToken = true, sentRefreshToken: string | null = null;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.hostname === "redis.fixture.test") {
      const args = JSON.parse(String(init!.body)); const command = String(args[0]).toUpperCase();
      if (command === "GET") return Response.json({ result: raw.get(args[1]) ?? null });
      if ((raw.get(args[3]) ?? "") !== args[4]) return Response.json({ result: 0 });
      raw.set(args[3], args[5]); return Response.json({ result: 1 });
    }
    if (url.hostname === "oauth2.googleapis.com") {
      const body = new URLSearchParams(String(init!.body));
      if (body.get("grant_type") === "authorization_code") {
        assert.equal(body.get("code_verifier")!.length > 20, true, "PKCE verifier is sent on exchange");
        assert.equal(body.get("redirect_uri"), `${ORIGIN}${CALENDAR_CALLBACK_PATH}`);
        return Response.json({ refresh_token: issueRefreshToken ? REFRESH : undefined, scope: grantedScope, access_token: "fixture-access" });
      }
      sentRefreshToken = body.get("refresh_token");
      return Response.json({ access_token: "fixture-access", scope: CALENDAR_READ_SCOPE });
    }
    return Response.json({ items: [] });
  };
  const cookie = `${CALENDAR_COOKIE}=${calendarSession(SECRET)}`;
  const connect = (c = cookie) => new Request(`${ORIGIN}/api/calendar/connect`, { method: "POST", headers: { origin: ORIGIN, cookie: c, "Content-Type": "application/json" }, body: "{}" });
  const callback = (state: string, c = cookie) => new Request(`${ORIGIN}${CALENDAR_CALLBACK_PATH}?code=fixture-code&state=${encodeURIComponent(state)}`, { headers: { cookie: c } });
  const outcome = (res: Response) => new URL(res.headers.get("location")!).searchParams.get("calendar");
  try {
    assert.equal((await connectPOST(connect(""))).status, 401, "an unauthenticated device cannot start a connection");
    assert.equal((await connectPOST(new Request(`${ORIGIN}/api/calendar/connect`, { method: "POST", headers: { origin: "https://cross.example.test", cookie }, body: "{}" }))).status, 403);

    const started = await (await connectPOST(connect())).json();
    const state = new URL(started.authorizeUrl).searchParams.get("state")!;
    assert.equal(JSON.stringify([...raw.values()]).includes(state), false, "the raw state is not stored");

    assert.equal(outcome(await callbackGET(callback("wrong-state"))), "state", "a forged state is refused");
    // That refusal consumed the pending state, so the real one must start over.
    const restarted = await (await connectPOST(connect())).json();
    const good = new URL(restarted.authorizeUrl).searchParams.get("state")!;
    // A different, still-valid session: authenticated, but not the one that started this connection.
    const otherBrowser = `${CALENDAR_COOKIE}=${calendarSession(SECRET, Date.now() - 1000)}`;
    assert.notEqual(otherBrowser, cookie);
    assert.equal(outcome(await callbackGET(callback(good, otherBrowser))), "state", "another browser cannot complete it");

    const third = await (await connectPOST(connect())).json();
    const live = new URL(third.authorizeUrl).searchParams.get("state")!;
    assert.equal(outcome(await callbackGET(callback(live))), "connected");
    assert.equal(outcome(await callbackGET(callback(live))), "state", "the callback cannot be replayed");

    const stored = JSON.stringify([...raw.values()]);
    assert.equal(stored.includes(REFRESH), false, "the refresh token is never stored in the clear");
    assert.equal(stored.includes(KEY.toString("base64")), false, "the key is never stored beside the ciphertext");
    const connection = (await configuredCalendarStore()!.read()).connection!;
    assert.equal(decryptSecret(connection.refreshTokenCipher, KEY), REFRESH);
    assert.equal(connection.scope, CALENDAR_READ_SCOPE);

    // The connected token is what a later live read actually uses.
    await calendarReaderFor(configuredCalendarStore()!).read("2026-09-09", "2026-09-17");
    assert.equal(sentRefreshToken, REFRESH);

    // A grant that came back broader than reading events is refused, leaving the good connection untouched.
    grantedScope = "https://www.googleapis.com/auth/calendar";
    const broad = await (await connectPOST(connect())).json();
    assert.equal(outcome(await callbackGET(callback(new URL(broad.authorizeUrl).searchParams.get("state")!))), "scope");
    assert.equal(decryptSecret((await configuredCalendarStore()!.read()).connection!.refreshTokenCipher, KEY), REFRESH);

    grantedScope = CALENDAR_READ_SCOPE; issueRefreshToken = false;
    const none = await (await connectPOST(connect())).json();
    assert.equal(outcome(await callbackGET(callback(new URL(none.authorizeUrl).searchParams.get("state")!))), "no-refresh-token");
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
    Object.assign(process.env, originalEnv);
  }
});

test("Calendar reader cookie is SameSite=Lax so the Google callback receives it; operator cookie stays Strict", async () => {
  const originalEnv = { ...process.env };
  Object.assign(process.env, { RIALA_OPERATOR_SECRET: SECRET });
  try {
    const { calendarCookie } = await import("../lib/server/calendarAuth");
    const https = calendarCookie(new Request(`${ORIGIN}/api/riala`));

    // 1. The reader cookie must be Lax: Strict is withheld on Google's cross-site top-level GET.
    assert.match(https, /SameSite=Lax/);
    assert.doesNotMatch(https, /SameSite=Strict/);
    // None would attach it to every cross-site request; it is never used.
    assert.doesNotMatch(https, /SameSite=None/);
    // Everything else about the cookie is unchanged.
    assert.match(https, /HttpOnly/);
    assert.match(https, /Secure/);
    assert.match(https, /Path=\/api\/calendar(;|$)/);
    assert.match(https, new RegExp(`Max-Age=${30 * 86400}(;|$)`));
    assert.equal(https.startsWith(`${CALENDAR_COOKIE}=`), true);
    // Path must still cover the callback (prefix + "/" boundary).
    assert.equal(CALENDAR_CALLBACK_PATH.startsWith("/api/calendar/"), true);

    const cleared = calendarCookie(new Request(`${ORIGIN}/api/riala`), true);
    assert.match(cleared, /SameSite=Lax/);
    assert.match(cleared, /Max-Age=0/);
    assert.equal(cleared.includes(SECRET), false, "the operator secret is never echoed into a cookie");

    // 2. The RIALA operator cookie is a different cookie and stays Strict: nothing redirects into it.
    const { COOKIE } = await import("../lib/riala-planner/security");
    assert.equal(COOKIE, "riala_operator");
    assert.notEqual(COOKIE, CALENDAR_COOKIE, "the two sessions are separate cookies");
    const routeSource = readFileSync("app/api/riala/route.ts", "utf8");
    // Every operator Set-Cookie is identified by its own path, and must stay Strict.
    const operatorCookies = routeSource.match(/[^`]*Path=\/api\/riala[^`]*/g) ?? [];
    assert.equal(operatorCookies.length, 2, "login and logout both set the operator cookie");
    for (const line of operatorCookies) {
      assert.match(line, /SameSite=Strict/);
      assert.doesNotMatch(line, /SameSite=Lax|SameSite=None/);
    }
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
    Object.assign(process.env, originalEnv);
  }
});

test("Calendar OAuth callback regression: cookie present completes, cookie absent/mismatched/replayed refuses, cross-site POST 403", async () => {
  const originalEnv = { ...process.env }, originalFetch = globalThis.fetch;
  const { POST: connectPOST } = await import("../app/api/calendar/connect/route");
  const { GET: callbackGET } = await import("../app/api/calendar/callback/route");
  const { configuredCalendarStore } = await import("../lib/server/calendarRefresh");
  Object.assign(process.env, {
    VERCEL: "1", RIALA_APP_ORIGIN: ORIGIN, RIALA_OPERATOR_SECRET: SECRET, CALENDAR_TOKEN_KEY: KEY.toString("base64"),
    GOOGLE_CALENDAR_CLIENT_ID: "fixture-id", GOOGLE_CALENDAR_CLIENT_SECRET: "fixture-secret",
    RIALA_REDIS_REST_URL: "https://redis.fixture.test", RIALA_REDIS_REST_TOKEN: "fixture-token",
  });
  delete process.env.GOOGLE_CALENDAR_REFRESH_TOKEN;
  const raw = new Map<string, string>();
  const requestedScopes: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.hostname === "redis.fixture.test") {
      const args = JSON.parse(String(init!.body)); const command = String(args[0]).toUpperCase();
      if (command === "GET") return Response.json({ result: raw.get(args[1]) ?? null });
      if ((raw.get(args[3]) ?? "") !== args[4]) return Response.json({ result: 0 });
      raw.set(args[3], args[5]); return Response.json({ result: 1 });
    }
    if (url.hostname === "oauth2.googleapis.com") {
      return Response.json({ refresh_token: REFRESH, scope: CALENDAR_READ_SCOPE, access_token: "fixture-access" });
    }
    return Response.json({ items: [] });
  };
  const cookie = `${CALENDAR_COOKIE}=${calendarSession(SECRET)}`;
  const connect = (headers: Record<string, string>) =>
    new Request(`${ORIGIN}/api/calendar/connect`, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: "{}" });
  const callback = (state: string, headers: Record<string, string> = {}) =>
    new Request(`${ORIGIN}${CALENDAR_CALLBACK_PATH}?code=fixture-code&state=${encodeURIComponent(state)}`, { headers });
  const outcome = (res: Response) => new URL(res.headers.get("location")!).searchParams.get("calendar");
  const beginConnection = async () => {
    const body = await (await connectPOST(connect({ origin: ORIGIN, cookie }))).json();
    requestedScopes.push(new URL(body.authorizeUrl).searchParams.get("scope")!);
    return new URL(body.authorizeUrl).searchParams.get("state")!;
  };
  try {
    // 4. No cookie on the callback -> login-required (the exact production symptom).
    assert.equal(outcome(await callbackGET(callback(await beginConnection()))), "login-required");

    // 3. Cookie present -> the connection completes. This is what Lax restores.
    const good = await beginConnection();
    assert.equal(outcome(await callbackGET(callback(good, { cookie }))), "connected");
    assert.equal(decryptSecret((await configuredCalendarStore()!.read()).connection!.refreshTokenCipher, KEY), REFRESH);

    // 6. Replaying the same callback finds no state left.
    assert.equal(outcome(await callbackGET(callback(good, { cookie }))), "state");

    // 5. A state that does not match the stored hash is refused.
    await beginConnection();
    assert.equal(outcome(await callbackGET(callback("forged-state-value", { cookie }))), "state");

    // 7. Same-origin is still enforced on connect after the Lax change.
    assert.equal((await connectPOST(connect({ origin: "https://evil.example.test", cookie }))).status, 403);
    assert.equal((await connectPOST(connect({ origin: ORIGIN, cookie, "sec-fetch-site": "cross-site" }))).status, 403);
    assert.equal((await connectPOST(connect({ cookie }))).status, 403, "a POST with no Origin is refused too");

    // 8. Scope never widened: every authorize URL asked for exactly the read scope.
    assert.equal(requestedScopes.length > 0, true);
    for (const scope of requestedScopes) assert.equal(scope, CALENDAR_READ_SCOPE);
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
    Object.assign(process.env, originalEnv);
  }
});

test("Calendar source contains no write call and no Gmail scope", () => {
  const files = [
    "lib/server/calendarOAuth.ts", "lib/server/liveGoogleCalendar.ts", "lib/server/calendarRefresh.ts",
    "lib/server/calendarAuth.ts", "app/api/calendar/route.ts", "app/api/calendar/connect/route.ts",
    "app/api/calendar/callback/route.ts", "app/api/cron/calendar/route.ts",
  ].map(path => [path, readFileSync(path, "utf8")] as const);

  for (const [path, source] of files) {
    // 9. No Calendar write: no mutating endpoint and no mutating method against the Calendar API.
    assert.doesNotMatch(source, /events\.(insert|update|patch|delete)/i, path);
    assert.doesNotMatch(source, /method:\s*["'](PUT|PATCH|DELETE)["']/i, path);
    // 10. No Gmail scope anywhere in the Calendar path.
    assert.doesNotMatch(source, /gmail/i, path);
    // Only the read scope is ever named.
    for (const scope of source.match(/auth\/[a-z.]+/g) ?? []) {
      assert.equal(["auth/calendar.events.readonly", "auth/calendar.readonly"].includes(scope), true, `${path}: ${scope}`);
    }
  }
  // The only hosts the Calendar path talks to are Google's token and API endpoints.
  const live = files.find(([p]) => p.endsWith("liveGoogleCalendar.ts"))![1];
  for (const match of live.match(/https:\/\/[a-z0-9.]+/g) ?? []) {
    assert.equal(["https://oauth2.googleapis.com", "https://www.googleapis.com"].includes(match), true, match);
  }
});

test("Calendar API responses never carry the token, its ciphertext, the key, or the pending auth state", async () => {
  const originalEnv = { ...process.env }, originalFetch = globalThis.fetch;
  const { POST: connectPOST } = await import("../app/api/calendar/connect/route");
  const { GET: callbackGET } = await import("../app/api/calendar/callback/route");
  const { GET: calendarGET, POST: calendarPOST } = await import("../app/api/calendar/route");
  const { GET: cronGET } = await import("../app/api/cron/calendar/route");
  const { configuredCalendarStore } = await import("../lib/server/calendarRefresh");
  Object.assign(process.env, {
    VERCEL: "1", RIALA_APP_ORIGIN: ORIGIN, RIALA_OPERATOR_SECRET: SECRET, CALENDAR_TOKEN_KEY: KEY.toString("base64"),
    CRON_SECRET: SECRET, GOOGLE_CALENDAR_CLIENT_ID: "fixture-id", GOOGLE_CALENDAR_CLIENT_SECRET: "fixture-client-secret",
    RIALA_REDIS_REST_URL: "https://redis.fixture.test", RIALA_REDIS_REST_TOKEN: "fixture-redis-token",
  });
  delete process.env.GOOGLE_CALENDAR_REFRESH_TOKEN;
  const raw = new Map<string, string>();
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.hostname === "redis.fixture.test") {
      const args = JSON.parse(String(init!.body)); const command = String(args[0]).toUpperCase();
      if (command === "GET") return Response.json({ result: raw.get(args[1]) ?? null });
      if ((raw.get(args[3]) ?? "") !== args[4]) return Response.json({ result: 0 });
      raw.set(args[3], args[5]); return Response.json({ result: 1 });
    }
    if (url.hostname === "oauth2.googleapis.com") return Response.json({ refresh_token: REFRESH, scope: CALENDAR_READ_SCOPE, access_token: "fixture-access-token" });
    return Response.json({ items: [{ id: "e1", summary: "private fixture title", start: { dateTime: `${jstToday()}T09:00:00+09:00` }, end: { dateTime: `${jstToday()}T10:00:00+09:00` } }] });
  };
  const cookie = `${CALENDAR_COOKIE}=${calendarSession(SECRET)}`;
  try {
    // Connect for real, so a token actually exists to leak.
    const started = await (await connectPOST(new Request(`${ORIGIN}/api/calendar/connect`, {
      method: "POST", headers: { origin: ORIGIN, cookie, "Content-Type": "application/json" }, body: "{}" }))).json();
    const state = new URL(started.authorizeUrl).searchParams.get("state")!;
    await callbackGET(new Request(`${ORIGIN}${CALENDAR_CALLBACK_PATH}?code=c&state=${encodeURIComponent(state)}`, { headers: { cookie } }));
    const stored = await configuredCalendarStore()!.read();
    const cipher = stored.connection!.refreshTokenCipher;
    assert.equal(cipher.length > 0, true, "a token really is stored");

    const today = jstToday();
    const url = `${ORIGIN}/api/calendar?start=${today}&end=${today}`;
    const responses = await Promise.all([
      calendarGET(new Request(url, { headers: { cookie } })),
      calendarPOST(new Request(url, { method: "POST", headers: { origin: ORIGIN, cookie, "Content-Type": "application/json" }, body: JSON.stringify({ trigger: "MANUAL" }) })),
      cronGET(new Request(`${ORIGIN}/api/cron/calendar`, { headers: { Authorization: `Bearer ${SECRET}` } })),
      // The unauthenticated shapes must not leak configuration either.
      calendarGET(new Request(url)),
      connectPOST(new Request(`${ORIGIN}/api/calendar/connect`, { method: "POST", headers: { origin: ORIGIN, "Content-Type": "application/json" }, body: "{}" })),
    ]);

    const forbidden: [string, string][] = [
      ["plaintext refresh token", REFRESH],
      ["stored ciphertext", cipher],
      ["encryption key", KEY.toString("base64")],
      ["Google client secret", "fixture-client-secret"],
      ["Redis token", "fixture-redis-token"],
      ["access token", "fixture-access-token"],
      ["operator secret", SECRET],
      ["pending auth field", "pendingAuth"],
      ["state hash field", "stateHash"],
      ["verifier field", "verifierCipher"],
    ];
    for (const response of responses) {
      const body = await response.text();
      for (const [label, secret] of forbidden) {
        assert.equal(body.includes(secret), false, `${label} appeared in a ${response.status} response body`);
      }
      // Headers must not carry them either (no Set-Cookie with a token, no debug header).
      const headers = JSON.stringify([...response.headers.entries()]);
      for (const [label, secret] of forbidden) {
        assert.equal(headers.includes(secret), false, `${label} appeared in response headers`);
      }
    }

    // The cron response is metadata only: no event titles.
    const cron = await (await cronGET(new Request(`${ORIGIN}/api/cron/calendar`, { headers: { Authorization: `Bearer ${SECRET}` } }))).text();
    assert.equal(cron.includes("private fixture title"), false, "the scheduler response never contains event names");
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
    Object.assign(process.env, originalEnv);
  }
});
