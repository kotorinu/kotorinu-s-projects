import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { calendarBounds, calendarStamp, calendarWindow, jstParts, CALENDAR_FRESH_MS } from "../lib/calendarTime";
import { calendarFreshnessLabel, googleCalendarProvider, retainLastCalendar, snapshotEvents, ageCalendarResult } from "../lib/calendarProvider";
import { CalendarRefreshService, emptyCalendarState, type CalendarState, configuredCalendarStore } from "../lib/server/calendarRefresh";
import { LiveGoogleCalendarProvider, normalizeGoogleEvent, CALENDAR_READ_SCOPE, type CalendarReader } from "../lib/server/liveGoogleCalendar";
import { type JsonStore, RedisJsonStore } from "../lib/server/redisJsonStore";
import { CALENDAR_COOKIE, calendarSession, calendarAuthenticated, cronAuthenticated, CALENDAR_SESSION_MS } from "../lib/server/calendarAuth";
import { authenticated, COOKIE, session } from "../lib/riala-planner/security";
import { GET as cronGET } from "../app/api/cron/calendar/route";
import { GET, POST } from "../app/api/calendar/route";
import { buildCalendarDay, themeForCalendarColorId } from "../lib/calendarDay";
import { makeBlock, makeTask } from "./helpers";

const DAY = "2026-09-09", FOUR = Date.parse(`${DAY}T04:00:00+09:00`);
const SECRET = "fixture-only-calendar-operator-secret";
const ORIGIN = "https://fixture.example.test";
const env: NodeJS.ProcessEnv = { NODE_ENV: "test", GOOGLE_CALENDAR_CLIENT_ID: "fixture-id", GOOGLE_CALENDAR_CLIENT_SECRET: "fixture-secret", GOOGLE_CALENDAR_REFRESH_TOKEN: "fixture-read-token" };
const timed = (id = "sales", start = `${DAY}T09:00:00+09:00`, end = `${DAY}T10:00:00+09:00`, colorId = "9") => ({ id, summary: id, colorId, start: { dateTime: start }, end: { dateTime: end } });
function memoryStore(): JsonStore<CalendarState> {
  let state = emptyCalendarState();
  return { read: async () => structuredClone(state), transact: async <T>(fn: (s: CalendarState) => T) => {
    const next = structuredClone(state), result = fn(next); next.version++; state = next; return structuredClone(result);
  } };
}
function reader(clock: () => number, events = [timed()]): CalendarReader {
  return { read: async (start, end) => ({ sourceMode: "LIVE", readAt: new Date(clock()).toISOString(), coverageStart: start, coverageEnd: end,
    events: events.flatMap(e => normalizeGoogleEvent(e, start, end)) }) };
}

test("Calendar 04:00 JST = previous UTC day 19:00; midnight through 05:00 retains local day", () => {
  const config = JSON.parse(readFileSync("vercel.json", "utf8"));
  assert.deepEqual(config.crons, [{ path: "/api/cron/calendar", schedule: "0 19 * * *" }]);
  assert.equal(new Date(FOUR).toISOString(), "2026-09-08T19:00:00.000Z");
  for (const hour of ["00", "01", "02", "03", "04", "05"]) {
    const now = Date.parse(`${DAY}T${hour}:00:00+09:00`);
    assert.equal(jstParts(now).date, DAY);
    assert.deepEqual(calendarWindow(now), { coverageStart: "2026-09-08", coverageEnd: "2026-09-16" });
    assert.equal(calendarStamp(new Date(now).toISOString()), `9/9 ${hour}:00`);
  }
  assert.deepEqual(calendarBounds("2026-09-08", "2026-09-16"), { timeMin: "2026-09-08T00:00:00+09:00", timeMax: "2026-09-17T00:00:00+09:00" });
  for (const range of [["2026-02-30", DAY], [DAY, "2026-09-30"], [DAY, "2026-09-08"]]) assert.throws(() => calendarBounds(range[0], range[1]));
});
test("Calendar midnight carryover, offsets, all-day end exclusivity, and colors survive normalization", () => {
  const segments = normalizeGoogleEvent(timed("overnight", "2026-09-08T14:30:00Z", "2026-09-08T16:30:00Z", "10"), "2026-09-08", DAY);
  assert.deepEqual(segments.map(e => [e.id, e.date, e.startTime, e.endTime]), [["overnight", "2026-09-08", "23:30", "24:00"], ["overnight", DAY, "00:00", "01:30"]]);
  assert.equal(segments[1].colorId, "10");
  const allDay = normalizeGoogleEvent({ id: "all", start: { date: "2026-09-08" }, end: { date: "2026-09-10" } }, "2026-09-08", "2026-09-10");
  assert.deepEqual(allDay.map(e => e.date), ["2026-09-08", DAY]);
  assert.deepEqual(normalizeGoogleEvent({ status: "cancelled" }, DAY, DAY), []);
  assert.throws(() => normalizeGoogleEvent(timed("bad", "2026-09-09T01:00:00", "2026-09-09T02:00:00"), DAY, DAY));
  for (const color of ["9", "10", "3", "5", "7", "8"]) assert.ok(themeForCalendarColorId(color));
});
test("Calendar overnight edit at 01:30: 03:59 old, 04:00 refresh, 04:01 new; reload and OS time precedence", async () => {
  let now = Date.parse(`${DAY}T00:30:00+09:00`);
  const store = memoryStore();
  await new CalendarRefreshService(store, reader(() => now), () => now).refresh("OPEN");
  // Fixture source edited at 01:30; no real Calendar writes.
  const edited = reader(() => now, [timed("riala", `${DAY}T09:00:00+09:00`, `${DAY}T09:30:00+09:00`, "10"), timed("sales", `${DAY}T09:30:00+09:00`, `${DAY}T10:00:00+09:00`)]);
  const service = new CalendarRefreshService(store, edited, () => now);
  now = FOUR - 60000;
  assert.equal((await service.cached())!.events[0].startTime, "09:00");
  now = FOUR;
  assert.equal((await service.refresh("SCHEDULED")).status, "REFRESHED");
  now = FOUR + 60000;
  const reloaded = await new CalendarRefreshService(store, edited, () => now).cached();
  assert.equal(reloaded!.source, "SNAPSHOT"); assert.equal(reloaded!.stale, false);
  const task = makeTask({ id: "sales-task", title: "Sales", area: "営業代行" });
  const block = makeBlock({ id: "old-sales", taskId: task.id, date: DAY, startTime: "09:00", endTime: "10:00", calendarEventId: "sales" });
  const day = buildCalendarDay({ date: DAY, events: reloaded!.events, planBlocks: [block], tasks: [task], nowHm: "04:01" });
  assert.deepEqual(day.timed.map(e => [e.key, e.startTime]), [["riala", "09:00"], ["sales", "09:30"]]);
  assert.equal(day.timed[0].role, "CALENDAR_ONLY"); assert.equal(day.timed[1].osTimeWas!.startTime, "09:00");
  assert.equal((await store.read()).scheduled.lastSucceededAt, new Date(FOUR).toISOString());
});
test("Calendar real adapter exhausts pagination before returning LIVE and uses one bounded JST window", async () => {
  let pages = 0; const signals: AbortSignal[] = [];
  const http: typeof fetch = async (input, init) => {
    const u = new URL(String(input)); signals.push(init!.signal!);
    assert.equal(init!.redirect, "error"); assert.equal(init!.cache, "no-store");
    if (u.hostname === "oauth2.googleapis.com") return Response.json({ access_token: "fixture-access", scope: CALENDAR_READ_SCOPE });
    assert.equal(init!.method, undefined);
    assert.equal(u.searchParams.get("timeMin"), "2026-09-08T00:00:00+09:00");
    assert.equal(u.searchParams.get("timeMax"), "2026-09-17T00:00:00+09:00");
    assert.equal(u.searchParams.get("timeZone"), "Asia/Tokyo"); assert.equal(u.searchParams.get("singleEvents"), "true");
    assert.equal(u.searchParams.get("fields")!.includes("description"), false);
    pages++;
    return Response.json({ items: [timed(`event-${pages}`)], ...(pages === 1 ? { nextPageToken: "p2" } : {}) });
  };
  const result = await new LiveGoogleCalendarProvider(env, http, () => FOUR).read("2026-09-08", "2026-09-16");
  assert.equal(pages, 2); assert.equal(result.events.length, 2); assert.equal(result.sourceMode, "LIVE");
  assert.equal(new Set(signals).size, 1); assert.equal(JSON.stringify(result).includes("fixture-access"), false);
});
test("Calendar partial page, duplicate ID, loop, malformed event, and broad OAuth scope all fail atomically", async () => {
  for (const mode of ["page-failure", "duplicate", "loop", "malformed", "broad-scope", "page-limit"]) {
    let now = FOUR - 60000; const store = memoryStore();
    await new CalendarRefreshService(store, reader(() => now), () => now).refresh("OPEN");
    const before = (await store.read()).snapshot;
    now = FOUR; let pages = 0;
    const http: typeof fetch = async input => {
      const u = new URL(String(input));
      if (u.hostname === "oauth2.googleapis.com") return Response.json({ access_token: "fixture", scope: mode === "broad-scope" ? "https://www.googleapis.com/auth/calendar" : CALENDAR_READ_SCOPE });
      pages++;
      if (mode === "page-failure" && pages === 2) return new Response("error", { status: 503 });
      return Response.json({ items: [mode === "malformed" ? { id: "bad" } : timed(mode === "duplicate" ? "same" : `e${pages}`)],
        nextPageToken: mode === "loop" ? "same" : `page-${pages}` });
    };
    const failed = await new CalendarRefreshService(store, new LiveGoogleCalendarProvider(env, http, () => now), () => now).refresh("SCHEDULED");
    assert.equal(failed.status, "FAILED", mode); assert.equal(failed.result!.stale, true);
    assert.deepEqual((await store.read()).snapshot, before, mode); assert.ok(pages <= 20);
  }
});
test("Calendar 15-minute open TTL, manual bypass, durable cooldown, daily dedupe, and failure retry", async () => {
  let now = FOUR, calls = 0, fail = false;
  const store = memoryStore(), base = reader(() => now);
  const provider: CalendarReader = { read: async (a, b) => { calls++; if (fail) throw new Error("fixture"); return base.read(a, b); } };
  const service = new CalendarRefreshService(store, provider, () => now);
  await service.refresh("SCHEDULED");
  now += 60000; await service.refresh("OPEN"); assert.equal(calls, 1);
  await service.refresh("MANUAL"); assert.equal(calls, 2);
  assert.equal((await service.refresh("MANUAL")).status, "LIMITED");
  now += 60000; assert.equal((await service.refresh("SCHEDULED")).status, "FRESH"); assert.equal(calls, 2);
  now += CALENDAR_FRESH_MS; fail = true;
  assert.equal((await service.refresh("OPEN")).status, "FAILED");
  now += 60000; fail = false;
  assert.equal((await service.refresh("OPEN")).status, "REFRESHED"); assert.equal(calls, 4);
});
test("Calendar concurrent instances share one lease; crashed/expired writer cannot overwrite a newer snapshot", async () => {
  let now = FOUR, release!: () => void, calls = 0;
  const store = memoryStore(), waiting = new Promise<void>(resolve => { release = resolve; });
  const slow: CalendarReader = { read: async (a, b) => { calls++; await waiting; return reader(() => now).read(a, b); } };
  const first = new CalendarRefreshService(store, slow, () => now).refresh("MANUAL");
  while (calls === 0) await new Promise(resolve => setImmediate(resolve));
  const second = new CalendarRefreshService(store, reader(() => now, [timed("new")]), () => now);
  assert.equal((await second.refresh("OPEN")).status, "BUSY");
  now += 91000; assert.equal((await second.refresh("MANUAL")).status, "REFRESHED");
  release(); assert.equal((await first).status, "BUSY"); assert.equal((await store.read()).snapshot!.events[0].id, "new");
});
test("Calendar 04:00 scheduled read is not suppressed by a completed 03:59 manual read", async () => {
  let now = FOUR - 30000; const store = memoryStore();
  const service = new CalendarRefreshService(store, reader(() => now), () => now);
  await service.refresh("MANUAL"); now = FOUR;
  assert.equal((await service.refresh("SCHEDULED")).status, "REFRESHED");
});
test("Calendar midnight expands the window; an expired crashed refresh is stale and retried", async () => {
  let now = Date.parse(`${DAY}T23:59:00+09:00`); const store = memoryStore();
  const service = new CalendarRefreshService(store, reader(() => now), () => now);
  await service.refresh("OPEN"); now += 60000;
  assert.equal((await service.cached())!.stale, true);
  await service.refresh("OPEN"); assert.equal((await store.read()).snapshot!.coverageEnd, "2026-09-17");
  await store.transact(s => { s.lease = { id: "crashed", until: now - 1 }; s.lastAttemptAt = new Date(now - 61000).toISOString(); });
  assert.equal((await service.cached())!.stale, true); assert.match((await service.cached())!.fallbackReason!, /完了していません/);
  assert.equal((await service.refresh("OPEN")).status, "REFRESHED");
});
test("Calendar failed client fetch retains last good data, ages freshness, and never calls a static snapshot latest", async () => {
  const store = memoryStore(), service = new CalendarRefreshService(store, reader(() => FOUR), () => FOUR);
  const good = (await service.refresh("OPEN")).result!;
  const fallback = snapshotEvents(DAY, DAY, "failed");
  const retained = retainLastCalendar(good, fallback, DAY, DAY);
  assert.deepEqual(retained.events, good.events); assert.equal(retained.stale, true); assert.equal(retained.source, "SNAPSHOT");
  assert.match(calendarFreshnessLabel(retained), /取得に失敗/);
  assert.equal(ageCalendarResult(good, FOUR + CALENDAR_FRESH_MS).stale, true);
  assert.match(calendarFreshnessLabel(snapshotEvents(DAY, DAY, null)), /snapshot/);
  assert.doesNotMatch(calendarFreshnessLabel(fallback), /最新|一致済み|照合済み/);
  const original = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("fixture access_token=must-not-reflect"); };
  try { assert.doesNotMatch(JSON.stringify(await googleCalendarProvider.getEvents(DAY, DAY)), /must-not-reflect/); }
  finally { globalThis.fetch = original; }
});
test("Calendar reader cookie is isolated from operator/send authorization, expires, and cron ignores query secrets", () => {
  const token = calendarSession(SECRET, FOUR);
  const req = new Request(ORIGIN, { headers: { cookie: `${CALENDAR_COOKIE}=${token}` } });
  assert.equal(calendarAuthenticated(req, SECRET, FOUR + 86400000), true);
  assert.equal(calendarAuthenticated(req, SECRET, FOUR + CALENDAR_SESSION_MS), false);
  assert.equal(calendarAuthenticated(new Request(ORIGIN, { headers: { cookie: `${CALENDAR_COOKIE}=${token}.extra` } }), SECRET, FOUR), false);
  assert.equal(authenticated(new Request(ORIGIN, { headers: { cookie: `${COOKIE}=${token}` } }), SECRET, FOUR), false);
  assert.equal(calendarAuthenticated(new Request(ORIGIN, { headers: { cookie: `${CALENDAR_COOKIE}=${session(SECRET, FOUR)}` } }), SECRET, FOUR), false);
  assert.equal(cronAuthenticated(new Request(`${ORIGIN}?secret=${SECRET}`), SECRET), false);
  assert.equal(cronAuthenticated(new Request(ORIGIN, { headers: { Authorization: "Bearer undefined" } }), ""), false);
  assert.equal(cronAuthenticated(new Request(ORIGIN, { headers: { Authorization: `Bearer ${SECRET}` } }), SECRET), true);
});
test("Calendar HTTP path: cron -> Google read -> Redis CAS -> independent request -> open/manual; auth and last-good fallback", async () => {
  const originalEnv = { ...process.env }, originalFetch = globalThis.fetch;
  Object.assign(process.env, env, { VERCEL: "1", RIALA_APP_ORIGIN: ORIGIN, RIALA_OPERATOR_SECRET: SECRET, CRON_SECRET: SECRET,
    RIALA_REDIS_REST_URL: "https://redis.fixture.test", RIALA_REDIS_REST_TOKEN: "fixture-token" });
  const now = Date.now(), today = jstParts(now).date;
  const raw = new Map<string, string>(); let googleCalls = 0, failGoogle = false;
  globalThis.fetch = async (input, init) => {
    const u = new URL(String(input));
    if (u.hostname === "redis.fixture.test") {
      // The @upstash/redis SDK issues lowercase command names.
      const args = JSON.parse(String(init!.body));
      const command = String(args[0]).toUpperCase();
      if (command === "GET") return Response.json({ result: raw.get(args[1]) ?? null });
      assert.equal(command, "EVAL");
      assert.doesNotMatch(args[1], /EXPIRE|SETEX/); // Calendar cache must never carry a TTL.
      if ((raw.get(args[3]) ?? "") !== args[4]) return Response.json({ result: 0 });
      raw.set(args[3], args[5]); return Response.json({ result: 1 });
    }
    if (u.hostname === "oauth2.googleapis.com") return Response.json({ access_token: "fixture", scope: CALENDAR_READ_SCOPE });
    assert.equal(u.hostname, "www.googleapis.com"); googleCalls++;
    if (failGoogle) return new Response("fixture failure", { status: 503 });
    return Response.json({ items: [timed("private fixture", `${today}T09:30:00+09:00`, `${today}T10:00:00+09:00`)] });
  };
  const url = `${ORIGIN}/api/calendar?start=${today}&end=${today}`;
  const cookie = `${CALENDAR_COOKIE}=${calendarSession(SECRET)}`;
  const post = (trigger: string, origin = ORIGIN, c = cookie) => new Request(url, { method: "POST", headers: { origin, cookie: c, "Content-Type": "application/json" }, body: JSON.stringify({ trigger }) });
  try {
    assert.equal((await cronGET(new Request(`${ORIGIN}/api/cron/calendar`))).status, 401); assert.equal(raw.size, 0);
    const cron = await cronGET(new Request(`${ORIGIN}/api/cron/calendar`, { headers: { Authorization: `Bearer ${SECRET}` } }));
    assert.equal(cron.status, 200); assert.doesNotMatch(await cron.text(), /private fixture|fixture-token/); assert.equal(googleCalls, 1);
    const read = await GET(new Request(url, { headers: { cookie } }));
    assert.match(read.headers.get("cache-control")!, /no-store/);
    const saved = await read.json(); assert.equal(saved.result.events[0].startTime, "09:30"); assert.equal(saved.result.source, "SNAPSHOT");
    assert.equal((await (await POST(post("OPEN"))).json()).status, "FRESH"); assert.equal(googleCalls, 1);
    assert.equal((await (await POST(post("MANUAL"))).json()).status, "LIMITED");
    assert.equal((await POST(post("OPEN", "https://cross.example.test"))).status, 403);
    assert.equal((await POST(post("OPEN", ORIGIN, ""))).status, 401);
    assert.equal((await (await GET(new Request(url))).json()).authRequired, true);
    const independent = configuredCalendarStore()!;
    assert.equal((await independent.read()).snapshot!.events.length, 1);
    await independent.transact(s => { s.lastAttemptAt = new Date(now - 61000).toISOString(); });
    assert.equal((await (await POST(post("MANUAL"))).json()).status, "REFRESHED"); assert.equal(googleCalls, 2);
    const lastGood = (await independent.read()).snapshot;
    await independent.transact(s => { s.lastAttemptAt = new Date(now - 61000).toISOString(); });
    failGoogle = true;
    const failure = await (await POST(post("MANUAL"))).json();
    assert.equal(failure.status, "FAILED"); assert.equal(failure.result.stale, true);
    assert.deepEqual((await configuredCalendarStore()!.read()).snapshot, lastGood);
    assert.equal((await (await GET(new Request(url, { headers: { cookie } }))).json()).result.events[0].startTime, "09:30");
    assert.equal([...raw.keys()].some(k => k.startsWith("riala:planner")), false);
    assert.throws(() => new RedisJsonStore("http://insecure.test", "fixture", "key", () => emptyCalendarState()));
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
    Object.assign(process.env, originalEnv);
  }
});
