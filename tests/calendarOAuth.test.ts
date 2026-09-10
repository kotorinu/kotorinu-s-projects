import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
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
