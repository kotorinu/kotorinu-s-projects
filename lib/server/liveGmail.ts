import "server-only";
import { GMAIL_READ_SCOPE, gmailReadOnlyScope } from "./gmailOAuth";
import {
  buildThreads, GMAIL_API_BASE, normalizeMessage,
  type ClassifiedThread, type GmailApiMessage, type GmailMessageRecord,
} from "./gmailRead";

/**
 * The live Gmail read.
 *
 * A read counts as LIVE only when it finished: every page fetched, every
 * message normalized, no duplicate ids, no repeated page token. A partial read
 * is discarded rather than published, because half an inbox looks exactly like
 * a quiet inbox and would be acted on as if nothing needed a reply.
 *
 * Only list and get are used. Nothing here modifies a label, so opening the
 * app never marks the operator's mail as read.
 */

export type GmailReadStatus =
  | "LIVE" | "NOT_CONNECTED" | "AUTH_EXPIRED" | "AUTH_REVOKED" | "SCOPE_INVALID"
  | "GMAIL_API_ERROR" | "RATE_LIMITED" | "NETWORK_ERROR" | "PARSE_ERROR" | "VOLUME_EXCEEDED";

/**
 * Which step failed. "It failed" is not a diagnosis, and the previous version
 * collapsed six different causes — plus any unexpected exception — into one
 * message, which made a production failure impossible to place.
 *
 * These values are safe to persist and show: a step name, an HTTP status, and
 * a category. No subject, address, body, or token is carried here.
 */
export type GmailReadStage =
  | "TOKEN_EXCHANGE" | "PROFILE" | "LIST_MESSAGES" | "FETCH_MESSAGE"
  | "PARSE_MESSAGE" | "VALIDATE_RESULT" | "STORE_LAST_GOOD";

export class GmailReadError extends Error {
  constructor(
    public status: Exclude<GmailReadStatus, "LIVE">,
    message: string,
    public stage: GmailReadStage = "LIST_MESSAGES",
    public httpStatus: number | null = null,
  ) { super(message); }
}

export const GMAIL_READ_REASON: Record<Exclude<GmailReadStatus, "LIVE">, string> = {
  NOT_CONNECTED: "Gmailが接続されていません",
  AUTH_EXPIRED: "Gmailの認証が期限切れです。再接続してください",
  AUTH_REVOKED: "Gmailの許可が取り消されています。再接続してください",
  SCOPE_INVALID: "許可された権限が読み取り専用ではありません。接続していません",
  GMAIL_API_ERROR: "Gmailの読み取りに失敗しました",
  RATE_LIMITED: "Gmailの取得制限に達しました。時間をおいて再試行してください",
  NETWORK_ERROR: "Gmailへ接続できません",
  PARSE_ERROR: "Gmailの内容を解釈できませんでした",
  VOLUME_EXCEEDED: "この期間のメールが多すぎて全部は読み切れません。取得日数を短くしてください",
};

export interface GmailReadWindow { start: string; end: string; days: number }
export interface GmailReadRecord {
  sourceMode: "LIVE";
  readAt: string;
  accountMasked: string;
  window: GmailReadWindow;
  query: string;
  scope: string;
  messages: GmailMessageRecord[];
  threads: ClassifiedThread[];
}

/** Default read window (§12). Seven days is the conservative choice: no RIALA document specifies one. */
export const DEFAULT_READ_DAYS = 7;
const MAX_PAGES = 8;
/**
 * A real mailbox over seven days of inbox **and** sent is easily a few hundred
 * messages. The first cap here was 200, which failed the whole read outright —
 * the feature simply did not work for a normal amount of mail.
 */
const MAX_MESSAGES = 400;
const PAGE_SIZE = 100;
const DETAIL_CONCURRENCY = 5;
/**
 * Bodies are parsed in full so classification sees everything, then trimmed
 * before storage. Deciding whether a reply is owed does not need the twentieth
 * page of a quoted thread, and the durable store has a size limit that a few
 * hundred untrimmed bodies would blow straight through.
 */
const STORE_BODY_CHARS = 2000;
const STORE_BUDGET_BYTES = 1_000_000;

export function gmailWindow(now: number, days = DEFAULT_READ_DAYS): GmailReadWindow {
  const span = Math.min(Math.max(Math.trunc(days), 1), 30);
  return { start: new Date(now - span * 86400000).toISOString(), end: new Date(now).toISOString(), days: span };
}

/**
 * Both directions inside the window, so a reply we already sent is visible.
 * Reading only the inbox would make every thread look unanswered.
 */
export function gmailQuery(window: GmailReadWindow): string {
  const after = Math.floor(Date.parse(window.start) / 1000);
  const before = Math.ceil(Date.parse(window.end) / 1000) + 1;
  return `(in:inbox OR in:sent) after:${after} before:${before}`;
}

export const maskAccount = (email: string) => {
  const [name, domain] = email.split("@");
  return name && domain ? `${name[0]}***@${domain}` : "***";
};

export interface GmailReader { read(window: GmailReadWindow): Promise<GmailReadRecord> }

/** Shorten stored bodies without losing a message. Truncation is recorded, never silent. */
export function trimBodies(messages: GmailMessageRecord[], limit: number): GmailMessageRecord[] {
  return messages.map(message => message.bodyText.length <= limit ? message : {
    ...message, bodyText: `${message.bodyText.slice(0, limit)}…`, bodyTruncated: true,
  });
}

export class LiveGmailReader implements GmailReader {
  constructor(
    private refreshTokenSource: () => Promise<string | null>,
    private client: { id: string; secret: string },
    private http: typeof fetch = fetch,
    private clock: () => number = Date.now,
    private context: { knownMembers?: readonly string[]; excludedDomains?: readonly string[] } = {},
  ) {}

  private async accessToken(signal: AbortSignal): Promise<string> {
    const stage: GmailReadStage = "TOKEN_EXCHANGE";
    const refreshToken = await this.refreshTokenSource();
    if (!refreshToken) throw new GmailReadError("NOT_CONNECTED", GMAIL_READ_REASON.NOT_CONNECTED, stage);
    let response: Response;
    try {
      response = await this.http("https://oauth2.googleapis.com/token", {
        method: "POST", cache: "no-store", redirect: "error", signal,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "refresh_token", client_id: this.client.id, client_secret: this.client.secret, refresh_token: refreshToken }),
      });
    } catch { throw new GmailReadError("NETWORK_ERROR", GMAIL_READ_REASON.NETWORK_ERROR, stage); }
    if (!response.ok) {
      // Only the error code is inspected, never echoed: the body can carry more than a code.
      let code = "";
      try { code = String(((await response.json()) as { error?: unknown }).error ?? ""); } catch { code = ""; }
      if (code === "invalid_grant") throw new GmailReadError("AUTH_REVOKED", GMAIL_READ_REASON.AUTH_REVOKED, stage, response.status);
      throw new GmailReadError("AUTH_EXPIRED", GMAIL_READ_REASON.AUTH_EXPIRED, stage, response.status);
    }
    const body = (await response.json()) as { access_token?: string; scope?: string };
    // A grant that is not exactly gmail.readonly is refused before it is used.
    if (!gmailReadOnlyScope(body.scope)) throw new GmailReadError("SCOPE_INVALID", GMAIL_READ_REASON.SCOPE_INVALID, stage, response.status);
    if (!body.access_token) throw new GmailReadError("AUTH_EXPIRED", GMAIL_READ_REASON.AUTH_EXPIRED, stage, response.status);
    return body.access_token;
  }

  private async get(url: string | URL, token: string, signal: AbortSignal, stage: GmailReadStage): Promise<unknown> {
    let response: Response;
    try {
      response = await this.http(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", redirect: "error", signal });
    } catch { throw new GmailReadError("NETWORK_ERROR", GMAIL_READ_REASON.NETWORK_ERROR, stage); }
    const status = response.status;
    if (status === 429) throw new GmailReadError("RATE_LIMITED", GMAIL_READ_REASON.RATE_LIMITED, stage, status);
    if (status === 401) throw new GmailReadError("AUTH_EXPIRED", GMAIL_READ_REASON.AUTH_EXPIRED, stage, status);
    if (status === 403) {
      // 403 covers three different problems, and telling them apart is the
      // difference between "wait" and "enable the API in Google Cloud".
      const text = await response.text();
      if (/rateLimitExceeded|userRateLimitExceeded/.test(text)) throw new GmailReadError("RATE_LIMITED", GMAIL_READ_REASON.RATE_LIMITED, stage, status);
      if (/accessNotConfigured|SERVICE_DISABLED|has not been used in project/.test(text)) {
        throw new GmailReadError("GMAIL_API_ERROR", "Google CloudでGmail APIが有効になっていません", stage, status);
      }
      throw new GmailReadError("AUTH_REVOKED", GMAIL_READ_REASON.AUTH_REVOKED, stage, status);
    }
    if (!response.ok) throw new GmailReadError("GMAIL_API_ERROR", GMAIL_READ_REASON.GMAIL_API_ERROR, stage, status);
    try { return await response.json(); } catch { throw new GmailReadError("PARSE_ERROR", GMAIL_READ_REASON.PARSE_ERROR, stage, status); }
  }

  async read(window: GmailReadWindow): Promise<GmailReadRecord> {
    const signal = AbortSignal.timeout(60000); // One deadline across token, list and every detail.
    const token = await this.accessToken(signal);

    const profile = (await this.get(`${GMAIL_API_BASE}/profile?fields=emailAddress`, token, signal, "PROFILE")) as { emailAddress?: string };
    if (typeof profile.emailAddress !== "string" || !profile.emailAddress.includes("@")) {
      throw new GmailReadError("PARSE_ERROR", GMAIL_READ_REASON.PARSE_ERROR, "PROFILE");
    }
    const account = profile.emailAddress.toLowerCase();

    const query = gmailQuery(window);
    const ids: string[] = [];
    const seenPages = new Set<string>();
    let page: string | undefined;
    for (let count = 0; count < MAX_PAGES; count++) {
      const url = new URL(`${GMAIL_API_BASE}/messages`);
      url.searchParams.set("q", query);
      url.searchParams.set("maxResults", String(PAGE_SIZE));
      url.searchParams.set("fields", "messages(id),nextPageToken");
      if (page) url.searchParams.set("pageToken", page);
      const body = (await this.get(url, token, signal, "LIST_MESSAGES")) as { messages?: { id?: string }[]; nextPageToken?: string };
      const listed = body.messages ?? [];
      if (!Array.isArray(listed) || listed.length > PAGE_SIZE) throw new GmailReadError("PARSE_ERROR", GMAIL_READ_REASON.PARSE_ERROR, "LIST_MESSAGES");
      for (const item of listed) {
        if (typeof item?.id !== "string" || !item.id) throw new GmailReadError("PARSE_ERROR", GMAIL_READ_REASON.PARSE_ERROR, "LIST_MESSAGES");
        ids.push(item.id);
      }
      // Too much mail to read completely is a real answer, and a different one
      // from "the API broke": the window has to shrink.
      if (ids.length > MAX_MESSAGES) throw new GmailReadError("VOLUME_EXCEEDED", GMAIL_READ_REASON.VOLUME_EXCEEDED, "LIST_MESSAGES");
      page = body.nextPageToken;
      if (!page) break;
      // A repeated token means the server is looping; publishing now would be a partial read.
      if (typeof page !== "string" || seenPages.has(page)) throw new GmailReadError("PARSE_ERROR", GMAIL_READ_REASON.PARSE_ERROR, "LIST_MESSAGES");
      seenPages.add(page);
      if (count === MAX_PAGES - 1) throw new GmailReadError("VOLUME_EXCEEDED", GMAIL_READ_REASON.VOLUME_EXCEEDED, "LIST_MESSAGES");
    }
    if (new Set(ids).size !== ids.length) throw new GmailReadError("PARSE_ERROR", GMAIL_READ_REASON.PARSE_ERROR, "LIST_MESSAGES");

    const messages: GmailMessageRecord[] = [];
    for (let i = 0; i < ids.length; i += DETAIL_CONCURRENCY) {
      const batch = await Promise.all(ids.slice(i, i + DETAIL_CONCURRENCY).map(async id => {
        const raw = (await this.get(
          `${GMAIL_API_BASE}/messages/${encodeURIComponent(id)}?format=full&fields=id,threadId,internalDate,labelIds,snippet,payload`,
          token, signal, "FETCH_MESSAGE",
        )) as GmailApiMessage;
        if (raw?.id !== id) throw new GmailReadError("PARSE_ERROR", GMAIL_READ_REASON.PARSE_ERROR, "FETCH_MESSAGE");
        try { return normalizeMessage(raw, account); }
        catch { throw new GmailReadError("PARSE_ERROR", GMAIL_READ_REASON.PARSE_ERROR, "PARSE_MESSAGE"); }
      }));
      messages.push(...batch);
    }
    if (new Set(messages.map(m => m.messageId)).size !== messages.length) throw new GmailReadError("PARSE_ERROR", GMAIL_READ_REASON.PARSE_ERROR, "PARSE_MESSAGE");

    // Classify against the full text, then trim what gets stored. Every message
    // is still present, so the read stays complete — only bodies are shortened,
    // which each record already reports through bodyTruncated.
    const threads = buildThreads(messages, this.context.knownMembers ?? [], this.context.excludedDomains ?? []);
    const record: GmailReadRecord = {
      sourceMode: "LIVE",
      readAt: new Date(this.clock()).toISOString(),
      accountMasked: maskAccount(account),
      window, query, scope: GMAIL_READ_SCOPE,
      messages: trimBodies(messages, STORE_BODY_CHARS),
      threads,
    };
    if (Buffer.byteLength(JSON.stringify(record)) > STORE_BUDGET_BYTES) {
      record.messages = trimBodies(record.messages, 400);
      if (Buffer.byteLength(JSON.stringify(record)) > STORE_BUDGET_BYTES) {
        throw new GmailReadError("VOLUME_EXCEEDED", GMAIL_READ_REASON.VOLUME_EXCEEDED, "VALIDATE_RESULT");
      }
    }
    return record;
  }
}
