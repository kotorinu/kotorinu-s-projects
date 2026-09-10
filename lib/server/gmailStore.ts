import "server-only";
import { randomUUID } from "node:crypto";
import { RedisJsonStore, type JsonStore } from "./redisJsonStore";
import { redisCredentials } from "./redisClient";
import { decryptGmailSecret, gmailOAuthClient, gmailTokenKey, type OAuthConnection, type PendingAuth } from "./gmailOAuth";
import {
  DEFAULT_READ_DAYS, GMAIL_READ_REASON, GmailReadError, gmailWindow, LiveGmailReader,
  type GmailReader, type GmailReadRecord, type GmailReadStatus,
} from "./liveGmail";

/**
 * Durable Gmail state, in two keys because they have different lifetimes:
 * a connection lasts until it is revoked, a read is replaced every time one
 * succeeds. Both use the same server-only @upstash/redis client and the same
 * compare-and-swap the Planner store was verified with — there is no second
 * Redis implementation.
 */
export const GMAIL_CONNECTION_KEY = "gmail:connection:v1";
export const GMAIL_LAST_GOOD_KEY = "gmail:last-good:v1";
export const GMAIL_FRESH_MS = 15 * 60 * 1000;

export interface GmailConnectionState {
  schemaVersion: 1;
  version: number;
  pendingAuth: PendingAuth | null;
  connection: OAuthConnection | null;
}
export const emptyGmailConnection = (): GmailConnectionState => ({ schemaVersion: 1, version: 0, pendingAuth: null, connection: null });

export interface GmailLastGoodState {
  schemaVersion: 1;
  version: number;
  record: GmailReadRecord | null;
  lastAttemptAt: string | null;
  lastFailure: { status: Exclude<GmailReadStatus, "LIVE">; reason: string; at: string } | null;
  lease: { id: string; until: number } | null;
  scheduled: { lastInvokedAt: string | null; lastSucceededAt: string | null };
}
export const emptyGmailLastGood = (): GmailLastGoodState => ({
  schemaVersion: 1, version: 0, record: null, lastAttemptAt: null, lastFailure: null, lease: null,
  scheduled: { lastInvokedAt: null, lastSucceededAt: null },
});

function decodeConnection(raw: string | null): GmailConnectionState {
  if (!raw) return emptyGmailConnection();
  const state = JSON.parse(raw) as GmailConnectionState;
  if (state.schemaVersion !== 1 || !Number.isSafeInteger(state.version)) throw new Error("Gmail接続情報が不正です");
  if (state.pendingAuth && (!/^[a-f0-9]{64}$/.test(state.pendingAuth.stateHash) || !/^[a-f0-9]{64}$/.test(state.pendingAuth.sessionHash) ||
    typeof state.pendingAuth.verifierCipher !== "string" || !Number.isFinite(state.pendingAuth.expiresAt))) throw new Error("Gmail接続情報が不正です");
  if (state.connection && (typeof state.connection.refreshTokenCipher !== "string" || !state.connection.refreshTokenCipher ||
    typeof state.connection.scope !== "string")) throw new Error("Gmail接続情報が不正です");
  return state;
}

function validateRecord(record: GmailReadRecord) {
  if (record.sourceMode !== "LIVE" || !Number.isFinite(Date.parse(record.readAt)) ||
    !Array.isArray(record.messages) || !Array.isArray(record.threads) || record.messages.length > 500 ||
    new Set(record.messages.map(m => m.messageId)).size !== record.messages.length) throw new Error("Gmail保存データが不正です");
}

function decodeLastGood(raw: string | null): GmailLastGoodState {
  if (!raw) return emptyGmailLastGood();
  const state = JSON.parse(raw) as GmailLastGoodState;
  if (state.schemaVersion !== 1 || !Number.isSafeInteger(state.version) || !state.scheduled) throw new Error("Gmail保存データが不正です");
  if (state.record) validateRecord(state.record);
  return state;
}

export function configuredGmailConnectionStore(): JsonStore<GmailConnectionState> | null {
  const credentials = redisCredentials(process.env);
  return credentials ? new RedisJsonStore(credentials.url, credentials.token, GMAIL_CONNECTION_KEY, decodeConnection) : null;
}
export function configuredGmailLastGoodStore(): JsonStore<GmailLastGoodState> | null {
  const credentials = redisCredentials(process.env);
  return credentials ? new RedisJsonStore(credentials.url, credentials.token, GMAIL_LAST_GOOD_KEY, decodeLastGood) : null;
}

/** Booleans and a timestamp. Never the token, its ciphertext, or the key. */
export function gmailConnectionStatus(state: GmailConnectionState) {
  return {
    connected: !!state.connection,
    connectedAt: state.connection?.connectedAt ?? null,
    scope: state.connection?.scope ?? null,
    keyConfigured: !!gmailTokenKey(),
    clientConfigured: !!gmailOAuthClient(),
  };
}

export function gmailReaderFor(connectionStore: JsonStore<GmailConnectionState>, context: { knownMembers?: readonly string[]; excludedDomains?: readonly string[] } = {}): GmailReader {
  const client = gmailOAuthClient();
  if (!client) {
    return { read: async () => { throw new GmailReadError("NOT_CONNECTED", GMAIL_READ_REASON.NOT_CONNECTED); } };
  }
  return new LiveGmailReader(async () => {
    const key = gmailTokenKey();
    if (!key) return null;
    const connection = (await connectionStore.read()).connection;
    return connection ? decryptGmailSecret(connection.refreshTokenCipher, key) : null;
  }, client, fetch, Date.now, context);
}

export interface GmailReadResult {
  record: GmailReadRecord | null;
  status: GmailReadStatus | "FALLBACK_LAST_GOOD" | "FRESH" | "BUSY" | "LIMITED";
  reason: string | null;
  stale: boolean;
  readAt: string | null;
}

export function cachedGmailResult(state: GmailLastGoodState, now: number): GmailReadResult | null {
  if (!state.record) return null;
  const age = now - Date.parse(state.record.readAt);
  const unfinished = !!state.lease && state.lease.until <= now;
  const failure = state.lastFailure?.reason ?? (unfinished ? "前回のGmail取得が完了していません。最後の取得結果を表示します" : null);
  return {
    record: state.record,
    status: failure ? "FALLBACK_LAST_GOOD" : "LIVE",
    reason: failure,
    stale: !!failure || age < 0 || age >= GMAIL_FRESH_MS,
    readAt: state.record.readAt,
  };
}

export type GmailTrigger = "OPEN" | "MANUAL" | "SCHEDULED";

export class GmailRefreshService {
  constructor(
    private lastGood: JsonStore<GmailLastGoodState>,
    private reader: GmailReader,
    private clock: () => number = Date.now,
    private days = DEFAULT_READ_DAYS,
  ) {}

  async cached() { return cachedGmailResult(await this.lastGood.read(), this.clock()); }

  async refresh(trigger: GmailTrigger): Promise<GmailReadResult> {
    const now = this.clock(), at = new Date(now).toISOString(), id = randomUUID();
    const previous = await this.lastGood.read();
    const cached = cachedGmailResult(previous, now);
    if (trigger === "OPEN" && cached && !cached.stale) return { ...cached, status: "FRESH" };

    const claim = await this.lastGood.transact(state => {
      const current = cachedGmailResult(state, now);
      if (state.lease && state.lease.until > now) return "BUSY" as const;
      if (trigger === "OPEN" && current && !current.stale) return "FRESH" as const;
      // A shared 60s cooldown bounds manual retries and prevents refresh storms.
      if (state.lastAttemptAt && now - Date.parse(state.lastAttemptAt) < 60000 && trigger !== "SCHEDULED") return "LIMITED" as const;
      state.lastAttemptAt = at;
      state.lease = { id, until: now + 120000 };
      if (trigger === "SCHEDULED") state.scheduled.lastInvokedAt = at;
      return "CLAIMED" as const;
    });
    if (claim !== "CLAIMED") {
      const current = await this.cached();
      return current ? { ...current, status: claim } : { record: null, status: claim, reason: null, stale: true, readAt: null };
    }

    try {
      const record = await this.reader.read(gmailWindow(now, this.days));
      validateRecord(record);
      const finished = this.clock();
      const saved = await this.lastGood.transact(state => {
        // A writer whose lease expired must not overwrite a newer successful read.
        if (state.lease?.id !== id || state.lease.until <= finished) return false;
        state.record = record; state.lastFailure = null; state.lease = null;
        if (trigger === "SCHEDULED") state.scheduled.lastSucceededAt = record.readAt;
        return true;
      });
      if (!saved) {
        const current = await this.cached();
        return current ? { ...current, status: "BUSY" } : { record: null, status: "BUSY", reason: null, stale: true, readAt: null };
      }
      return { record, status: "LIVE", reason: null, stale: false, readAt: record.readAt };
    } catch (error) {
      const status = error instanceof GmailReadError ? error.status : "GMAIL_API_ERROR";
      const reason = GMAIL_READ_REASON[status];
      // The previous successful read is deliberately left in place.
      try {
        await this.lastGood.transact(state => {
          if (state.lease?.id === id) { state.lastFailure = { status, reason, at: new Date(this.clock()).toISOString() }; state.lease = null; }
        });
      } catch { /* the failure record is best-effort; the last good read still stands */ }
      const current = await this.cached();
      return current
        ? { ...current, status: "FALLBACK_LAST_GOOD", reason, stale: true }
        : { record: null, status, reason, stale: true, readAt: null };
    }
  }
}
