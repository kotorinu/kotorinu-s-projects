import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  beginGmailAuth, decryptGmailSecret, encryptGmailSecret, gmailAuthorizeUrl, gmailOAuthClient,
  gmailReadOnlyScope, gmailRedirectUri, gmailTokenKey, verifyAuthState,
  AUTH_STATE_TTL_MS, GMAIL_CALLBACK_PATH, GMAIL_READ_SCOPE,
} from "../lib/server/gmailOAuth";
import {
  buildThreads, classifyThread, collectParts, decodeBody, extractBody, htmlToText,
  normalizeMessage, parseAddresses, parseDisplayName, replyStateOf,
  type GmailApiMessage, type GmailMessageRecord,
} from "../lib/server/gmailRead";
import { GmailReadError, gmailQuery, gmailWindow, LiveGmailReader, maskAccount, trimBodies, DEFAULT_READ_DAYS } from "../lib/server/liveGmail";
import {
  cachedGmailResult, emptyGmailLastGood, GmailRefreshService,
  GMAIL_CONNECTION_KEY, GMAIL_LAST_GOOD_KEY, type GmailLastGoodState,
} from "../lib/server/gmailStore";
import { GMAIL_COOKIE, gmailAuthenticated, gmailCookie, gmailSession } from "../lib/server/gmailAuth";
import { calendarAuthenticated, calendarSession, CALENDAR_COOKIE } from "../lib/server/calendarAuth";
import { encryptSecret as calendarEncrypt } from "../lib/server/calendarOAuth";
import { cronAuthenticated } from "../lib/server/readerSession";
import type { JsonStore } from "../lib/server/redisJsonStore";

const KEY = randomBytes(32);
const SECRET = "fixture-only-gmail-operator-secret-value";
const ORIGIN = "https://fixture.example.test";
const REFRESH = "fixture-gmail-refresh-token";
const ACCOUNT = "operator@fixture.example.test";
const CLIENT = { id: "fixture-client-id", secret: "fixture-client-secret" };

const b64 = (value: string | Buffer) => Buffer.from(value).toString("base64url");

function memoryStore<T extends { version: number }>(initial: T): JsonStore<T> {
  let state = structuredClone(initial);
  return {
    read: async () => structuredClone(state),
    transact: async <R>(fn: (s: T) => R) => {
      const next = structuredClone(state); const result = fn(next); next.version++; state = next; return structuredClone(result);
    },
  };
}

// --- OAuth ---

test("Gmail OAuth asks for exactly gmail.readonly and refuses every write-capable grant", () => {
  const { state, verifier } = beginGmailAuth("fixture-session", KEY);
  const url = new URL(gmailAuthorizeUrl(CLIENT.id, `${ORIGIN}${GMAIL_CALLBACK_PATH}`, state, verifier));
  assert.equal(url.searchParams.get("scope"), GMAIL_READ_SCOPE);
  assert.equal(url.searchParams.get("access_type"), "offline");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("code_challenge")!.includes(verifier), false, "the PKCE verifier is never sent");

  assert.equal(gmailReadOnlyScope(GMAIL_READ_SCOPE), true);
  for (const refused of [
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/gmail.compose",
    "https://www.googleapis.com/auth/gmail.send",
    "https://mail.google.com/",
    "https://www.googleapis.com/auth/gmail.metadata",
    `${GMAIL_READ_SCOPE} https://www.googleapis.com/auth/gmail.send`,
    `${GMAIL_READ_SCOPE} https://www.googleapis.com/auth/calendar`,
    "", undefined,
  ]) assert.equal(gmailReadOnlyScope(refused), false, String(refused));
});

test("Gmail OAuth state: mismatch, expiry, replay and cross-session are all refused", () => {
  const now = Date.parse("2026-09-11T09:00:00+09:00");
  const session = gmailSession(SECRET, now);
  const { state, pending } = beginGmailAuth(session, KEY, now);
  assert.equal(pending.stateHash.includes(state), false, "only the hash is stored");
  assert.equal(pending.verifierCipher.startsWith("v1."), true, "the verifier is encrypted at rest");
  assert.equal(AUTH_STATE_TTL_MS, 10 * 60 * 1000);

  assert.equal(verifyAuthState(pending, state, session, now + 60000), null);
  assert.equal(verifyAuthState(pending, state, session, now + AUTH_STATE_TTL_MS), "EXPIRED");
  assert.equal(verifyAuthState(pending, "forged", session, now), "MISMATCH");
  assert.equal(verifyAuthState(pending, state, gmailSession(SECRET, now - 1000), now), "SESSION");
  assert.equal(verifyAuthState(null, state, session, now), "MISSING", "a replay finds nothing left");
});

test("Gmail token encryption is separate from Calendar and fails closed without a key", () => {
  const cipher = encryptGmailSecret(REFRESH, KEY);
  assert.equal(decryptGmailSecret(cipher, KEY), REFRESH);
  assert.equal(cipher.includes(REFRESH), false);
  assert.notEqual(encryptGmailSecret(REFRESH, KEY), cipher, "a fresh IV each time");
  assert.throws(() => decryptGmailSecret(cipher, randomBytes(32)), undefined);

  // Different AAD: a Calendar ciphertext cannot be decrypted as a Gmail one even with the same key.
  assert.throws(() => decryptGmailSecret(calendarEncrypt(REFRESH, KEY), KEY));

  assert.equal(gmailTokenKey({ NODE_ENV: "test" }), null, "no key means no connection, never plaintext");
  assert.equal(gmailTokenKey({ NODE_ENV: "test", GMAIL_TOKEN_KEY: randomBytes(16).toString("base64") }), null);
  assert.equal(gmailTokenKey({ NODE_ENV: "test", GMAIL_TOKEN_KEY: KEY.toString("base64") })?.length, 32);
});

test("Gmail reader cookie is isolated from the Calendar cookie and is SameSite=Lax", () => {
  const now = Date.now();
  const gmailToken = gmailSession(SECRET, now), calendarToken = calendarSession(SECRET, now);
  assert.notEqual(gmailToken, calendarToken, "different purposes produce different signatures");
  // A Calendar cookie must not authenticate Gmail, and the reverse.
  assert.equal(gmailAuthenticated(new Request(ORIGIN, { headers: { cookie: `${GMAIL_COOKIE}=${calendarToken}` } }), SECRET, now), false);
  assert.equal(calendarAuthenticated(new Request(ORIGIN, { headers: { cookie: `${CALENDAR_COOKIE}=${gmailToken}` } }), SECRET, now), false);
  assert.equal(gmailAuthenticated(new Request(ORIGIN, { headers: { cookie: `${GMAIL_COOKIE}=${gmailToken}` } }), SECRET, now), true);

  const original = process.env.RIALA_OPERATOR_SECRET;
  process.env.RIALA_OPERATOR_SECRET = SECRET;
  try {
    const cookie = gmailCookie(new Request(`${ORIGIN}/api/riala`));
    assert.match(cookie, /SameSite=Lax/);      // the Google callback is a cross-site top-level GET
    assert.doesNotMatch(cookie, /SameSite=None|SameSite=Strict/);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /Secure/);
    assert.match(cookie, /Path=\/api\/gmail(;|$)/);
    assert.equal(GMAIL_CALLBACK_PATH.startsWith("/api/gmail/"), true, "the path covers the callback");
  } finally {
    if (original === undefined) delete process.env.RIALA_OPERATOR_SECRET; else process.env.RIALA_OPERATOR_SECRET = original;
  }
});

test("Gmail redirect URI comes from the configured origin, and the OAuth client may be shared with Calendar", () => {
  const spoofed = new Request("https://attacker.example.test/api/gmail/callback");
  assert.equal(gmailRedirectUri(spoofed, ORIGIN), `${ORIGIN}${GMAIL_CALLBACK_PATH}`);
  assert.equal(gmailOAuthClient({ NODE_ENV: "test" }), null);
  assert.deepEqual(gmailOAuthClient({ NODE_ENV: "test", GOOGLE_CALENDAR_CLIENT_ID: "shared", GOOGLE_CALENDAR_CLIENT_SECRET: "s" }), { id: "shared", secret: "s" });
  // A Gmail-specific client wins, so the two can be split later without touching Calendar.
  assert.deepEqual(gmailOAuthClient({ NODE_ENV: "test", GOOGLE_CALENDAR_CLIENT_ID: "shared", GOOGLE_CALENDAR_CLIENT_SECRET: "s", GMAIL_CLIENT_ID: "own", GMAIL_CLIENT_SECRET: "o" }), { id: "own", secret: "o" });
});

// --- Body parsing ---

test("Gmail body: text/plain wins, HTML is the fallback, and nested multipart is walked", () => {
  const nested: GmailApiMessage["payload"] = {
    mimeType: "multipart/mixed",
    parts: [
      {
        mimeType: "multipart/alternative",
        parts: [
          { mimeType: "text/html", body: { data: b64("<p>HTML version</p>") } },
          { mimeType: "text/plain", body: { data: b64("Plain version") } },
        ],
      },
      { mimeType: "application/pdf", filename: "invoice.pdf", body: { attachmentId: "att-1", size: 1024 } },
    ],
  };
  const body = extractBody(nested);
  assert.equal(body.text, "Plain version", "text/plain is preferred even when listed after HTML");
  assert.equal(body.source, "TEXT_PLAIN");

  const htmlOnly = extractBody({ mimeType: "multipart/alternative", parts: [{ mimeType: "text/html", body: { data: b64("<div>Hello<br>World</div><script>alert(1)</script>") } }] });
  assert.equal(htmlOnly.source, "TEXT_HTML");
  assert.equal(htmlOnly.text, "Hello\nWorld");
  assert.equal(htmlOnly.text.includes("alert"), false, "script contents are dropped, not merely untagged");

  const attachments = collectParts(nested).attachments;
  assert.deepEqual(attachments, [{ filename: "invoice.pdf", mimeType: "application/pdf", hasAttachmentId: true, size: 1024 }]);
  assert.equal(JSON.stringify(attachments).includes("att-1"), false, "the attachment id itself is not kept, only that one exists");

  assert.equal(extractBody({ mimeType: "text/plain" }).source, "NONE");
});

test("Gmail HTML is reduced to text with no remote resource surviving", () => {
  const html = `<html><head><style>b{color:red}</style></head><body>
    <img src="https://tracker.example/pixel.gif?id=1">
    <p>&#12371;&#12435;&#12395;&#12385;&#12399; &amp; welcome</p>
    <a href="https://example.test/x">link text</a>
    <script>fetch("https://evil.example")</script>
  </body></html>`;
  const text = htmlToText(html);
  assert.equal(text.includes("こんにちは & welcome"), true, "numeric entities decode, including Japanese");
  assert.equal(text.includes("link text"), true);
  for (const forbidden = ["<img", "tracker.example", "evil.example", "<script", "color:red", "href"] as const; ;) {
    for (const needle of forbidden) assert.equal(text.includes(needle), false, needle);
    break;
  }
});

test("Gmail decodes Base64URL and Japanese bodies in UTF-8 and ISO-2022-JP", () => {
  const utf8 = "新RIALAアプリの登録方法が分かりません。";
  assert.equal(decodeBody(b64(utf8), "UTF-8"), utf8);
  assert.equal(decodeBody(b64(utf8), null), utf8, "utf-8 is the default");
  assert.equal(decodeBody(b64(utf8), '"utf-8"'), utf8, "a quoted charset is accepted");

  // ISO-2022-JP "こんにちは": ESC $ B <JIS bytes> ESC ( B. Decoding this as UTF-8 would be mojibake.
  const jis = Buffer.from([0x1b, 0x24, 0x42, 0x24, 0x33, 0x24, 0x73, 0x24, 0x4b, 0x24, 0x41, 0x24, 0x4f, 0x1b, 0x28, 0x42]);
  assert.equal(decodeBody(jis.toString("base64url"), "iso-2022-jp"), "こんにちは");
  assert.notEqual(decodeBody(jis.toString("base64url"), "utf-8"), "こんにちは", "the charset genuinely matters");
  // An unknown charset falls back rather than throwing.
  assert.equal(decodeBody(b64(utf8), "x-not-a-charset"), utf8);
});

test("Gmail normalization keeps the minimum, marks direction, and preserves UNREAD", () => {
  const raw: GmailApiMessage = {
    id: "m1", threadId: "t1", internalDate: String(Date.parse("2026-09-11T08:14:00+09:00")),
    labelIds: ["INBOX", "UNREAD"], snippet: "&#12371;&#12435;&#12395;&#12385;&#12399;",
    payload: {
      mimeType: "text/plain",
      headers: [
        { name: "From", value: '"山田 花子" <hanako@example.test>' },
        { name: "To", value: `RIALA <${ACCOUNT}>` },
        { name: "Cc", value: "cc@example.test" },
        { name: "Subject", value: "新RIALAアプリについて" },
        { name: "In-Reply-To", value: "<prev@example.test>" },
        { name: "Content-Type", value: "text/plain; charset=UTF-8" },
      ],
      body: { data: b64("新RIALAアプリの登録方法が分かりません。") },
    },
  };
  const record = normalizeMessage(raw, ACCOUNT);
  assert.equal(record.direction, "INCOMING");
  assert.equal(record.from, "hanako@example.test");
  assert.equal(record.fromName, "山田 花子");
  assert.deepEqual(record.to, [ACCOUNT]);
  assert.equal(record.isUnread, true, "UNREAD is observed, never removed");
  assert.equal(record.bodyText, "新RIALAアプリの登録方法が分かりません。");
  assert.equal(record.snippet, "こんにちは");
  assert.equal(record.receivedAt, new Date(Date.parse("2026-09-11T08:14:00+09:00")).toISOString());
  assert.equal("raw" in record, false, "Google's raw response is not carried through");

  // SENT, and a From matching the account, both mean outgoing.
  assert.equal(normalizeMessage({ ...raw, labelIds: ["SENT"] }, ACCOUNT).direction, "OUTGOING");
  assert.equal(normalizeMessage({ ...raw, payload: { ...raw.payload, headers: [{ name: "From", value: ACCOUNT }] } }, ACCOUNT).direction, "OUTGOING");

  for (const broken of [{ ...raw, id: undefined }, { ...raw, threadId: "" }, { ...raw, internalDate: "not-a-date" }]) {
    assert.throws(() => normalizeMessage(broken as GmailApiMessage, ACCOUNT));
  }
  assert.deepEqual(parseAddresses('A <a@b.test>, "C" <c@d.test>, a@b.test'), ["a@b.test", "c@d.test"]);
  assert.equal(parseDisplayName("<a@b.test>"), null);
});

// --- Classification and reply state ---

const message = (over: Partial<GmailMessageRecord>): GmailMessageRecord => ({
  messageId: "m", threadId: "t", direction: "INCOMING", receivedAt: "2026-09-11T00:00:00.000Z", internalDate: "1000",
  from: "someone@example.test", fromName: null, to: [ACCOUNT], cc: [], subject: "", snippet: "", bodyText: "",
  bodyTruncated: false, bodySource: "TEXT_PLAIN", labels: [], isUnread: false, inReplyTo: null, references: [], attachments: [],
  ...over,
});

test("Gmail classification keeps its evidence and never invents an exclusion", () => {
  const strong = classifyThread([message({ subject: "新RIALAアプリについて" })]);
  assert.equal(strong.relevance, "RIALA_RELEVANT");
  assert.equal(strong.evidence.some(e => e.rule === "SUBJECT_CONTAINS_RIALA"), true);

  const member = classifyThread([message({ from: "known@example.test" })], ["known@example.test"]);
  assert.equal(member.relevance, "RIALA_RELEVANT");
  assert.equal(member.evidence[0].rule, "SENDER_IS_KNOWN_MEMBER");

  const weak = classifyThread([message({ bodyText: "新アプリへの移行はどうすればいいですか" })]);
  assert.equal(weak.relevance, "POSSIBLY_RIALA");
  assert.equal(weak.evidence.length > 0, true, "a maybe still says why");

  // No signal at all stays UNKNOWN rather than being forced into a bucket.
  const silent = classifyThread([message({ subject: "請求書の件", bodyText: "お世話になっております" })]);
  assert.equal(silent.relevance, "UNKNOWN");
  assert.deepEqual(silent.evidence, []);

  // NOT_RIALA only ever comes from an explicit operator exclusion.
  assert.equal(classifyThread([message({ from: "noreply@ads.example" })]).relevance, "UNKNOWN");
  const excluded = classifyThread([message({ from: "noreply@ads.example" })], [], ["ads.example"]);
  assert.equal(excluded.relevance, "NOT_RIALA");
  assert.equal(excluded.evidence[0].rule, "EXCLUDED_DOMAIN");
});

test("Gmail reply state reports what the mail shows and never concludes 'no reply needed'", () => {
  const inbound = message({ direction: "INCOMING", internalDate: "200" });
  const outbound = message({ direction: "OUTGOING", internalDate: "100" });
  assert.equal(replyStateOf([outbound, inbound]), "AWAITING_OUR_REPLY");
  assert.equal(replyStateOf([inbound, message({ direction: "OUTGOING", internalDate: "300" })]), "AWAITING_THEIR_REPLY");
  assert.equal(replyStateOf([outbound]), "OUTGOING_ONLY");
  assert.equal(replyStateOf([]), "UNKNOWN");
  const states = ["AWAITING_OUR_REPLY", "AWAITING_THEIR_REPLY", "OUTGOING_ONLY", "UNKNOWN"];
  assert.equal(states.some(s => /NO_REPLY_NEEDED|RESOLVED|DONE/.test(s)), false);

  const threads = buildThreads([
    message({ messageId: "a", threadId: "t1", direction: "INCOMING", internalDate: "100", subject: "RIALAの件", isUnread: true }),
    message({ messageId: "b", threadId: "t1", direction: "OUTGOING", internalDate: "200" }),
    message({ messageId: "c", threadId: "t2", direction: "INCOMING", internalDate: "300", subject: "RIALA移行" }),
  ]);
  assert.equal(threads.length, 2);
  const first = threads.find(t => t.threadId === "t1")!;
  assert.equal(first.replyState, "AWAITING_THEIR_REPLY");
  assert.equal(first.unreadCount, 1);
  assert.equal(first.messageIds.length, 2);
  assert.equal(threads.find(t => t.threadId === "t2")!.replyState, "AWAITING_OUR_REPLY");
});

// --- Live read ---

interface Fixture { pages: { messages?: { id: string }[]; nextPageToken?: string }[]; detail?: (id: string) => GmailApiMessage }
function gmailHttp(fixture: Fixture, options: { scope?: string; tokenStatus?: number; tokenError?: string; detailStatus?: number; detail403Body?: string } = {}) {
  const calls: { url: string; method: string }[] = [];
  let page = 0;
  const http: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, method: init?.method ?? "GET" });
    if (url.startsWith("https://oauth2.googleapis.com/token")) {
      if (options.tokenStatus) return new Response(JSON.stringify({ error: options.tokenError ?? "invalid_request" }), { status: options.tokenStatus });
      return Response.json({ access_token: "fixture-access-token", scope: options.scope ?? GMAIL_READ_SCOPE });
    }
    if (url.includes("/profile")) return Response.json({ emailAddress: ACCOUNT });
    if (url.includes("/messages/")) {
      if (options.detailStatus) return new Response(options.detail403Body ?? "error", { status: options.detailStatus });
      const id = decodeURIComponent(/messages\/([^?]+)/.exec(url)![1]);
      return Response.json(fixture.detail ? fixture.detail(id) : {
        id, threadId: `thread-${id}`, internalDate: "1789000000000", labelIds: ["INBOX"],
        payload: { headers: [{ name: "From", value: "a@example.test" }, { name: "Subject", value: "RIALA" }], mimeType: "text/plain", body: { data: b64("body") } },
      });
    }
    const body = fixture.pages[Math.min(page, fixture.pages.length - 1)];
    page++;
    return Response.json(body);
  };
  return { http, calls };
}

test("Gmail live read exhausts pagination, then normalizes; the window covers both directions", async () => {
  const { http, calls } = gmailHttp({
    pages: [{ messages: [{ id: "1" }, { id: "2" }], nextPageToken: "p2" }, { messages: [{ id: "3" }] }],
  });
  const reader = new LiveGmailReader(async () => REFRESH, CLIENT, http, () => Date.parse("2026-09-11T09:00:00+09:00"));
  const window = gmailWindow(Date.parse("2026-09-11T09:00:00+09:00"));
  const record = await reader.read(window);

  assert.equal(record.messages.length, 3);
  assert.equal(record.sourceMode, "LIVE");
  assert.equal(record.accountMasked, "o***@fixture.example.test");
  assert.equal(record.accountMasked.includes("perator"), false);
  assert.equal(window.days, DEFAULT_READ_DAYS);
  // Sent mail is in range too, otherwise every thread looks unanswered.
  assert.match(record.query, /in:inbox OR in:sent/);
  assert.match(record.query, /after:\d+ before:\d+/);
  // Every call is a plain GET: nothing here can change a label.
  assert.equal(calls.every(c => c.method === "GET" || c.url.includes("oauth2.googleapis.com")), true);
  assert.equal(calls.some(c => /modify|trash|send|drafts|batchModify|untrash/.test(c.url)), false);
  assert.equal(JSON.stringify(record).includes("fixture-access-token"), false);
  assert.equal(JSON.stringify(record).includes(REFRESH), false);
});

test("Gmail live read fails closed on a page loop, a duplicate id, a bad detail, and an over-broad scope", async () => {
  const window = gmailWindow(Date.now());
  const cases: [string, Fixture, Parameters<typeof gmailHttp>[1]][] = [
    ["page loop", { pages: [{ messages: [{ id: "1" }], nextPageToken: "same" }, { messages: [{ id: "2" }], nextPageToken: "same" }] }, {}],
    ["duplicate id", { pages: [{ messages: [{ id: "dup" }, { id: "dup" }] }] }, {}],
    ["mismatched detail", { pages: [{ messages: [{ id: "1" }] }], detail: () => ({ id: "other", threadId: "t", internalDate: "1" }) }, {}],
    ["broad scope", { pages: [{ messages: [] }] }, { scope: `${GMAIL_READ_SCOPE} https://www.googleapis.com/auth/gmail.send` }],
  ];
  for (const [label, fixture, options] of cases) {
    const { http } = gmailHttp(fixture, options);
    const reader = new LiveGmailReader(async () => REFRESH, CLIENT, http);
    await assert.rejects(reader.read(window), (error: unknown) => error instanceof GmailReadError, label);
  }
});

test("Gmail live read maps revoked, expired, rate-limited and disconnected to distinct states", async () => {
  const window = gmailWindow(Date.now());
  const expect = async (options: Parameters<typeof gmailHttp>[1], status: string, token: string | null = REFRESH) => {
    const { http } = gmailHttp({ pages: [{ messages: [{ id: "1" }] }] }, options);
    const reader = new LiveGmailReader(async () => token, CLIENT, http);
    await assert.rejects(reader.read(window), (error: unknown) => error instanceof GmailReadError && error.status === status, status);
  };
  await expect({}, "NOT_CONNECTED", null);
  await expect({ tokenStatus: 400, tokenError: "invalid_grant" }, "AUTH_REVOKED");
  await expect({ tokenStatus: 400, tokenError: "invalid_client" }, "AUTH_EXPIRED");
  await expect({ scope: "https://www.googleapis.com/auth/gmail.modify" }, "SCOPE_INVALID");
  await expect({ detailStatus: 429 }, "RATE_LIMITED");
  await expect({ detailStatus: 403, detail403Body: '{"error":{"errors":[{"reason":"rateLimitExceeded"}]}}' }, "RATE_LIMITED");
  await expect({ detailStatus: 403, detail403Body: "forbidden" }, "AUTH_REVOKED");
  await expect({ detailStatus: 500 }, "GMAIL_API_ERROR");
  assert.equal(maskAccount("a@b.test"), "a***@b.test");
  assert.match(gmailQuery(gmailWindow(Date.now(), 3)), /in:inbox/);
});

// --- Durable last good read ---

test("Gmail keeps the last good read when a later read fails, and never publishes a partial one", async () => {
  let now = Date.parse("2026-09-11T09:00:00+09:00");
  let fail = false, reads = 0;
  const store = memoryStore<GmailLastGoodState>(emptyGmailLastGood());
  const reader = {
    read: async (window: ReturnType<typeof gmailWindow>) => {
      reads++;
      if (fail) throw new GmailReadError("GMAIL_API_ERROR", "fixture failure");
      return {
        sourceMode: "LIVE" as const, readAt: new Date(now).toISOString(), accountMasked: "o***@x.test",
        window, query: "fixture", scope: GMAIL_READ_SCOPE,
        messages: [message({ messageId: `m${reads}`, subject: "RIALA" })],
        threads: buildThreads([message({ messageId: `m${reads}`, subject: "RIALA" })]),
      };
    },
  };
  const service = new GmailRefreshService(store, reader, () => now);

  const first = await service.refresh("MANUAL");
  assert.equal(first.status, "LIVE");
  const goodReadAt = first.readAt!;
  assert.equal((await store.read()).record!.messages.length, 1);

  // Inside the cooldown a manual retry is limited rather than hammering Google.
  assert.equal((await service.refresh("MANUAL")).status, "LIMITED");
  assert.equal(reads, 1);

  now += 61000; fail = true;
  const failed = await service.refresh("MANUAL");
  assert.equal(failed.status, "FALLBACK_LAST_GOOD");
  assert.equal(failed.stale, true);
  assert.equal(failed.readAt, goodReadAt, "the failure did not move the read time");
  assert.equal((await store.read()).record!.messages[0].messageId, "m1", "the last good read is intact");
  assert.equal((await store.read()).lastFailure!.status, "GMAIL_API_ERROR");

  // A fresh open inside the TTL does not call Google at all.
  now += 61000; fail = false;
  await service.refresh("MANUAL");
  const before = reads;
  assert.equal((await service.refresh("OPEN")).status, "FRESH");
  assert.equal(reads, before);

  // An expired lease from a crashed writer is visible and retried, not trusted.
  await store.transact(s => { s.lease = { id: "crashed", until: now - 1 }; s.lastAttemptAt = new Date(now - 61000).toISOString(); });
  const stale = cachedGmailResult(await store.read(), now)!;
  assert.equal(stale.stale, true);
  assert.match(stale.reason!, /完了していません/);

  assert.equal(GMAIL_CONNECTION_KEY, "gmail:connection:v1");
  assert.equal(GMAIL_LAST_GOOD_KEY, "gmail:last-good:v1");
  assert.notEqual(GMAIL_CONNECTION_KEY, GMAIL_LAST_GOOD_KEY);
});

test("Gmail scheduled read records lastSucceededAt and a busy lease blocks a second reader", async () => {
  const now = Date.parse("2026-09-11T04:00:00+09:00");
  const store = memoryStore<GmailLastGoodState>(emptyGmailLastGood());
  let release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  let started = 0;
  const slow = {
    read: async (window: ReturnType<typeof gmailWindow>) => {
      started++; await waiting;
      return { sourceMode: "LIVE" as const, readAt: new Date(now).toISOString(), accountMasked: "o***@x.test", window, query: "q", scope: GMAIL_READ_SCOPE, messages: [], threads: [] };
    },
  };
  const first = new GmailRefreshService(store, slow, () => now).refresh("SCHEDULED");
  while (started === 0) await new Promise(resolve => setImmediate(resolve));
  const second = new GmailRefreshService(store, slow, () => now);
  assert.equal((await second.refresh("MANUAL")).status, "BUSY");
  release();
  assert.equal((await first).status, "LIVE");
  assert.equal((await store.read()).scheduled.lastSucceededAt !== null, true);
  assert.equal((await store.read()).scheduled.lastInvokedAt !== null, true);
});

// --- Boundaries ---

test("Gmail cron accepts a Bearer header only and never a query secret", () => {
  const long = "fixture-cron-secret-value-that-is-long-enough";
  assert.equal(cronAuthenticated(new Request(`${ORIGIN}/api/cron/gmail?secret=${long}`), long), false);
  assert.equal(cronAuthenticated(new Request(`${ORIGIN}/api/cron/gmail`), long), false);
  assert.equal(cronAuthenticated(new Request(`${ORIGIN}/api/cron/gmail`, { headers: { Authorization: "Bearer wrong" } }), long), false);
  assert.equal(cronAuthenticated(new Request(`${ORIGIN}/api/cron/gmail`, { headers: { Authorization: `Bearer ${long}` } }), long), true);
  assert.equal(cronAuthenticated(new Request(ORIGIN, { headers: { Authorization: "Bearer short" } }), "short"), false);
});

test("Gmail read path contains no write, no send, and no label mutation", () => {
  // Comments are stripped first: naming a scope in order to say it is refused
  // is exactly what these files should do. What must not exist is a call.
  const withoutComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const files = [
    "lib/server/gmailOAuth.ts", "lib/server/gmailRead.ts", "lib/server/liveGmail.ts", "lib/server/gmailStore.ts",
    "lib/server/gmailAuth.ts", "lib/gmailSummary.ts", "app/api/gmail/route.ts", "app/api/gmail/connect/route.ts",
    "app/api/gmail/callback/route.ts", "app/api/cron/gmail/route.ts", "components/RialaGmailPanel.tsx",
  ].map(path => [path, withoutComments(readFileSync(path, "utf8"))] as const);

  for (const [path, source] of files) {
    for (const forbidden of [
      /users\.messages\.send|messages\/send/i, /users\.drafts|\/drafts\b/i, /messages\.modify|\/modify\b/i,
      /messages\.trash|\/trash\b/i, /threads\.modify/i, /batchModify/i, /removeLabelIds|addLabelIds/i,
      /auth\/gmail\.(send|modify|compose|metadata)/i, /mail\.google\.com/i,
    ]) assert.doesNotMatch(source, forbidden, `${path}: ${forbidden}`);
    // Only these HTTP methods appear, and POST only to Google's token endpoint or our own API.
    for (const method of source.match(/method:\s*["'](\w+)["']/g) ?? []) {
      assert.equal(/POST/.test(method), true, `${path}: ${method}`);
    }
  }
  // Every Google scope named across the Gmail path is the read scope.
  for (const [path, source] of files) {
    for (const scope of source.match(/auth\/[a-z.]+/g) ?? []) {
      assert.equal(scope, "auth/gmail.readonly", `${path}: ${scope}`);
    }
  }
});

test("Gmail summaries carry no message body out of the server", async () => {
  const { summarizeGmail } = await import("../lib/gmailSummary");
  const secretBody = "SECRET-BODY-CONTENT-should-not-leave";
  const records = [message({ messageId: "m1", threadId: "t1", subject: "RIALAの件", bodyText: secretBody, isUnread: true })];
  const summary = summarizeGmail({
    record: {
      readAt: "2026-09-11T00:00:00.000Z", accountMasked: "o***@x.test",
      window: { start: "2026-09-04T00:00:00.000Z", end: "2026-09-11T00:00:00.000Z", days: 7 },
      messages: records, threads: buildThreads(records),
    },
    status: "LIVE", reason: null, stale: false, readAt: "2026-09-11T00:00:00.000Z",
  });
  assert.equal(JSON.stringify(summary).includes(secretBody), false, "bodies never reach the client projection");
  assert.equal(summary.counts.relevant, 1);
  assert.equal(summary.counts.unread, 1);
  assert.equal(summary.threads[0].subject, "RIALAの件");
  assert.equal("bodyText" in summary.threads[0], false);
});

test("Gmail HTTP: connect -> callback -> live read -> durable last good; replay, cross-site and secrets all refused", async () => {
  const originalEnv = { ...process.env }, originalFetch = globalThis.fetch;
  const { POST: connectPOST } = await import("../app/api/gmail/connect/route");
  const { GET: callbackGET } = await import("../app/api/gmail/callback/route");
  const { GET: gmailGET, POST: gmailPOST } = await import("../app/api/gmail/route");
  const { GET: cronGET } = await import("../app/api/cron/gmail/route");
  const { configuredGmailConnectionStore, configuredGmailLastGoodStore } = await import("../lib/server/gmailStore");
  const CRON = "fixture-cron-secret-value-that-is-long-enough";
  Object.assign(process.env, {
    VERCEL: "1", RIALA_APP_ORIGIN: ORIGIN, RIALA_OPERATOR_SECRET: SECRET, GMAIL_TOKEN_KEY: KEY.toString("base64"),
    CRON_SECRET: CRON, GOOGLE_CALENDAR_CLIENT_ID: CLIENT.id, GOOGLE_CALENDAR_CLIENT_SECRET: CLIENT.secret,
    RIALA_REDIS_REST_URL: "https://redis.fixture.test", RIALA_REDIS_REST_TOKEN: "fixture-redis-token",
  });
  const raw = new Map<string, string>();
  const JAPANESE = "新RIALAアプリの登録方法が分かりません。";
  const SUBJECT = "新RIALAアプリについて";
  let grantedScope = GMAIL_READ_SCOPE;
  const gmailCalls: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("redis.fixture.test")) {
      const args = JSON.parse(String(init!.body)); const command = String(args[0]).toUpperCase();
      if (command === "GET") return Response.json({ result: raw.get(args[1]) ?? null });
      if ((raw.get(args[3]) ?? "") !== args[4]) return Response.json({ result: 0 });
      raw.set(args[3], args[5]); return Response.json({ result: 1 });
    }
    if (url.startsWith("https://oauth2.googleapis.com/token")) {
      const body = new URLSearchParams(String(init!.body));
      if (body.get("grant_type") === "authorization_code") {
        assert.equal(body.get("code_verifier")!.length > 20, true);
        assert.equal(body.get("redirect_uri"), `${ORIGIN}${GMAIL_CALLBACK_PATH}`);
        return Response.json({ refresh_token: REFRESH, scope: grantedScope, access_token: "fixture-access-token" });
      }
      assert.equal(body.get("refresh_token"), REFRESH, "the stored token is what refreshes the access token");
      return Response.json({ access_token: "fixture-access-token", scope: GMAIL_READ_SCOPE });
    }
    gmailCalls.push(url);
    if (url.includes("/profile")) return Response.json({ emailAddress: ACCOUNT });
    if (url.includes("/messages/")) {
      const id = decodeURIComponent(/messages\/([^?]+)/.exec(url)![1]);
      return Response.json({
        id, threadId: "thread-1", internalDate: String(Date.parse("2026-09-11T08:14:00+09:00")),
        labelIds: id === "in-1" ? ["INBOX", "UNREAD"] : ["SENT"],
        payload: {
          mimeType: "multipart/mixed",
          headers: [
            { name: "From", value: id === "in-1" ? "hanako@example.test" : ACCOUNT },
            { name: "To", value: id === "in-1" ? ACCOUNT : "hanako@example.test" },
            { name: "Subject", value: SUBJECT },
            { name: "Content-Type", value: "text/plain; charset=UTF-8" },
          ],
          parts: [
            { mimeType: "multipart/alternative", parts: [
              { mimeType: "text/html", body: { data: b64("<p>html</p>") } },
              { mimeType: "text/plain", headers: [{ name: "Content-Type", value: "text/plain; charset=UTF-8" }], body: { data: b64(JAPANESE) } },
            ] },
            { mimeType: "image/png", filename: "shot.png", body: { attachmentId: "att-9", size: 10 } },
          ],
        },
      });
    }
    return Response.json({ messages: [{ id: "in-1" }, { id: "out-1" }] });
  };
  const cookie = `${GMAIL_COOKIE}=${gmailSession(SECRET)}`;
  const connect = (headers: Record<string, string>) =>
    new Request(`${ORIGIN}/api/gmail/connect`, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: "{}" });
  const callback = (state: string, headers: Record<string, string> = {}) =>
    new Request(`${ORIGIN}${GMAIL_CALLBACK_PATH}?code=c&state=${encodeURIComponent(state)}`, { headers });
  const outcome = (response: Response) => new URL(response.headers.get("location")!).searchParams.get("gmail");
  const begin = async () => {
    const body = await (await connectPOST(connect({ origin: ORIGIN, cookie }))).json();
    return new URL(body.authorizeUrl).searchParams.get("state")!;
  };
  try {
    // Boundaries first.
    assert.equal((await connectPOST(connect({ origin: "https://evil.example.test", cookie }))).status, 403);
    assert.equal((await connectPOST(connect({ origin: ORIGIN }))).status, 401);
    assert.equal(outcome(await callbackGET(callback(await begin()))), "login-required", "no cookie, no connection");

    // A grant carrying a send scope is refused outright.
    grantedScope = `${GMAIL_READ_SCOPE} https://www.googleapis.com/auth/gmail.send`;
    assert.equal(outcome(await callbackGET(callback(await begin(), { cookie }))), "scope");
    assert.equal((await configuredGmailConnectionStore()!.read()).connection, null, "nothing was stored");

    grantedScope = GMAIL_READ_SCOPE;
    const good = await begin();
    assert.equal(outcome(await callbackGET(callback(good, { cookie }))), "connected");
    assert.equal(outcome(await callbackGET(callback(good, { cookie }))), "state", "the callback cannot be replayed");

    const connection = (await configuredGmailConnectionStore()!.read()).connection!;
    assert.equal(decryptGmailSecret(connection.refreshTokenCipher, KEY), REFRESH);
    assert.equal(connection.scope, GMAIL_READ_SCOPE);
    assert.equal(JSON.stringify([...raw.values()]).includes(REFRESH), false, "never stored in the clear");

    // The live read: real bodies, Japanese, multipart, attachment metadata, both directions.
    const read = await (await gmailPOST(new Request(`${ORIGIN}/api/gmail`, {
      method: "POST", headers: { origin: ORIGIN, cookie, "Content-Type": "application/json" }, body: JSON.stringify({ trigger: "MANUAL" }),
    }))).json();
    assert.equal(read.result.status, "LIVE");
    assert.equal(read.result.counts.messages, 2);
    assert.equal(read.result.counts.threads, 1);
    assert.equal(read.result.counts.relevant, 1);
    assert.equal(read.result.threads[0].replyState, "AWAITING_THEIR_REPLY", "our sent reply is visible in the same window");
    assert.equal(read.result.threads[0].unreadCount, 1);

    // Bodies live in Redis for the planner, and never in the response.
    const stored = (await configuredGmailLastGoodStore()!.read()).record!;
    assert.equal(stored.messages[0].bodyText, JAPANESE, "Japanese body survives the round trip");
    assert.equal(stored.messages[0].bodySource, "TEXT_PLAIN");
    assert.deepEqual(stored.messages[0].attachments, [{ filename: "shot.png", mimeType: "image/png", hasAttachmentId: true, size: 10 }]);
    assert.equal(JSON.stringify(read).includes(JAPANESE), false, "the body does not reach the client");

    // Durable across a fresh reader: this is the reload / redeploy case.
    const reloaded = await (await gmailGET(new Request(`${ORIGIN}/api/gmail`, { headers: { cookie } }))).json();
    assert.equal(reloaded.result.counts.messages, 2);
    assert.equal(reloaded.connection.connected, true);

    // Reading never asked Gmail to change anything.
    assert.equal(gmailCalls.some(u => /modify|trash|send|drafts|batchModify/.test(u)), false);
    assert.equal(gmailCalls.some(u => u.includes("format=full")), true);

    // The scheduler returns metadata only.
    assert.equal((await cronGET(new Request(`${ORIGIN}/api/cron/gmail?secret=${CRON}`))).status, 401);
    const cron = await cronGET(new Request(`${ORIGIN}/api/cron/gmail`, { headers: { Authorization: `Bearer ${CRON}` } }));
    const cronText = await cron.text();
    for (const leak of [JAPANESE, SUBJECT, "hanako@example.test", ACCOUNT]) {
      assert.equal(cronText.includes(leak), false, `cron leaked ${leak}`);
    }

    // Nothing sensitive in any Gmail response body or header.
    const responses = await Promise.all([
      gmailGET(new Request(`${ORIGIN}/api/gmail`, { headers: { cookie } })),
      gmailGET(new Request(`${ORIGIN}/api/gmail`)),
      connectPOST(connect({ origin: ORIGIN, cookie })),
      cronGET(new Request(`${ORIGIN}/api/cron/gmail`, { headers: { Authorization: `Bearer ${CRON}` } })),
    ]);
    const forbidden: [string, string][] = [
      ["refresh token", REFRESH], ["ciphertext", connection.refreshTokenCipher], ["encryption key", KEY.toString("base64")],
      ["client secret", CLIENT.secret], ["redis token", "fixture-redis-token"], ["access token", "fixture-access-token"],
      ["operator secret", SECRET], ["cron secret", CRON], ["pending auth", "pendingAuth"],
      ["state hash", "stateHash"], ["verifier", "verifierCipher"], ["message body", JAPANESE],
    ];
    for (const response of responses) {
      const body = await response.text();
      const headers = JSON.stringify([...response.headers.entries()]);
      for (const [label, secret] of forbidden) {
        assert.equal(body.includes(secret), false, `${label} appeared in a ${response.status} body`);
        assert.equal(headers.includes(secret), false, `${label} appeared in headers`);
      }
    }
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
    Object.assign(process.env, originalEnv);
  }
});

test("Gmail failures name the stage, the HTTP status and the category", async () => {
  const window = gmailWindow(Date.now());
  const at = async (options: Parameters<typeof gmailHttp>[1], fixture: Fixture, stage: string, httpStatus: number | null, status: string) => {
    const { http } = gmailHttp(fixture, options);
    const reader = new LiveGmailReader(async () => REFRESH, CLIENT, http);
    await assert.rejects(reader.read(window), (error: unknown) =>
      error instanceof GmailReadError && error.stage === stage && error.httpStatus === httpStatus && error.status === status,
      `${stage}/${httpStatus}/${status}`);
  };
  const one: Fixture = { pages: [{ messages: [{ id: "1" }] }] };
  await at({ tokenStatus: 400, tokenError: "invalid_grant" }, one, "TOKEN_EXCHANGE", 400, "AUTH_REVOKED");
  await at({ scope: "https://www.googleapis.com/auth/gmail.modify" }, one, "TOKEN_EXCHANGE", 200, "SCOPE_INVALID");
  await at({ detailStatus: 500 }, one, "FETCH_MESSAGE", 500, "GMAIL_API_ERROR");
  await at({ detailStatus: 429 }, one, "FETCH_MESSAGE", 429, "RATE_LIMITED");
  // A message that cannot be normalized is a parse failure, not an API failure.
  await at({}, { pages: [{ messages: [{ id: "1" }] }], detail: () => ({ id: "1", threadId: "t", internalDate: "bad" }) }, "PARSE_MESSAGE", null, "PARSE_ERROR");

  // Not connected never reaches the network.
  const { http } = gmailHttp(one);
  await assert.rejects(new LiveGmailReader(async () => null, CLIENT, http).read(window),
    (error: unknown) => error instanceof GmailReadError && error.stage === "TOKEN_EXCHANGE" && error.status === "NOT_CONNECTED");
});

test("Gmail tells a disabled Gmail API apart from a revoked grant", async () => {
  const window = gmailWindow(Date.now());
  const disabled = '{"error":{"code":403,"message":"Gmail API has not been used in project 123 before or it is disabled","status":"PERMISSION_DENIED","details":[{"reason":"SERVICE_DISABLED"}]}}';
  const { http } = gmailHttp({ pages: [{ messages: [{ id: "1" }] }] }, { detailStatus: 403, detail403Body: disabled });
  await assert.rejects(new LiveGmailReader(async () => REFRESH, CLIENT, http).read(window), (error: unknown) =>
    error instanceof GmailReadError && error.status === "GMAIL_API_ERROR" && error.httpStatus === 403 &&
    /Gmail APIが有効になっていません/.test(error.message));

  // A plain 403 still means the grant is gone.
  const { http: revoked } = gmailHttp({ pages: [{ messages: [{ id: "1" }] }] }, { detailStatus: 403, detail403Body: "forbidden" });
  await assert.rejects(new LiveGmailReader(async () => REFRESH, CLIENT, revoked).read(window), (error: unknown) =>
    error instanceof GmailReadError && error.status === "AUTH_REVOKED");
});

test("Gmail volume: a mailbox too busy to read completely says so instead of failing as an API error", async () => {
  const window = gmailWindow(Date.now());
  // 5 pages x 100 = 500 ids, past the 400 cap.
  const pages = Array.from({ length: 5 }, (_, page) => ({
    messages: Array.from({ length: 100 }, (_, i) => ({ id: `p${page}-m${i}` })),
    ...(page < 4 ? { nextPageToken: `page-${page + 1}` } : {}),
  }));
  const { http } = gmailHttp({ pages });
  await assert.rejects(new LiveGmailReader(async () => REFRESH, CLIENT, http).read(window), (error: unknown) =>
    error instanceof GmailReadError && error.status === "VOLUME_EXCEEDED" && error.stage === "LIST_MESSAGES",
    "too much mail is its own answer, not GMAIL_API_ERROR");

  // 200 messages used to fail outright; that was the bug.
  const twoHundred = [
    { messages: Array.from({ length: 100 }, (_, i) => ({ id: `a${i}` })), nextPageToken: "p2" },
    { messages: Array.from({ length: 100 }, (_, i) => ({ id: `b${i}` })) },
  ];
  const { http: ok } = gmailHttp({ pages: twoHundred });
  const record = await new LiveGmailReader(async () => REFRESH, CLIENT, ok).read(window);
  assert.equal(record.messages.length, 200);
});

test("Gmail trims stored bodies without dropping a message, and records the truncation", async () => {
  const long = "あ".repeat(9000);
  const trimmed = trimBodies([message({ messageId: "m1", bodyText: long }), message({ messageId: "m2", bodyText: "short" })], 2000);
  assert.equal(trimmed.length, 2, "no message is dropped");
  assert.equal(trimmed[0].bodyText.length, 2001, "2000 characters plus the ellipsis");
  assert.equal(trimmed[0].bodyTruncated, true);
  assert.equal(trimmed[1].bodyText, "short");
  assert.equal(trimmed[1].bodyTruncated, false);

  // A read of many long messages stays inside the durable store's budget.
  const window = gmailWindow(Date.now());
  const pages = [{ messages: Array.from({ length: 100 }, (_, i) => ({ id: `m${i}` })) }];
  const { http } = gmailHttp({
    pages,
    detail: (id) => ({
      id, threadId: `t${id}`, internalDate: "1789000000000", labelIds: ["INBOX"],
      payload: {
        mimeType: "text/plain",
        headers: [{ name: "From", value: "a@example.test" }, { name: "Subject", value: "RIALA" }],
        body: { data: Buffer.from("字".repeat(15000)).toString("base64url") },
      },
    }),
  });
  const record = await new LiveGmailReader(async () => REFRESH, CLIENT, http).read(window);
  assert.equal(record.messages.length, 100);
  const bytes = Buffer.byteLength(JSON.stringify(record));
  assert.equal(bytes < 1_000_000, true, `stored payload must fit the budget, got ${bytes}`);
  // Classification still saw the full text before trimming.
  assert.equal(record.threads.length, 100);
});

test("Gmail records the failing stage durably and shows it to the operator", async () => {
  let now = Date.parse("2026-09-11T09:00:00+09:00");
  const store = memoryStore<GmailLastGoodState>(emptyGmailLastGood());
  const reader = { read: async () => { throw new GmailReadError("VOLUME_EXCEEDED", "too much", "LIST_MESSAGES", null); } };
  const outcome = await new GmailRefreshService(store, reader, () => now).refresh("MANUAL");
  assert.equal(outcome.status, "VOLUME_EXCEEDED");
  assert.deepEqual(outcome.diagnostic, { stage: "LIST_MESSAGES", httpStatus: null, category: "VOLUME_EXCEEDED" });
  const saved = (await store.read()).lastFailure!;
  assert.equal(saved.stage, "LIST_MESSAGES");
  assert.equal(saved.status, "VOLUME_EXCEEDED");

  // An unexpected throw — the durable write is the usual culprit — is attributed there
  // rather than being reported as a Gmail API error with no stage.
  now += 61000;
  const store2 = memoryStore<GmailLastGoodState>(emptyGmailLastGood());
  const exploding = { read: async () => { throw new Error("Store保存上限です"); } };
  const second = await new GmailRefreshService(store2, exploding, () => now).refresh("MANUAL");
  assert.equal(second.diagnostic!.stage, "STORE_LAST_GOOD");
  assert.equal((await store2.read()).lastFailure!.stage, "STORE_LAST_GOOD");

  // The diagnostic is a step name, a status and a category — nothing more.
  assert.deepEqual(Object.keys(second.diagnostic!).sort(), ["category", "httpStatus", "stage"]);
});
