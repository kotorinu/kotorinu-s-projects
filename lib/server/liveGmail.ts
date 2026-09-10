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
  | "GMAIL_API_ERROR" | "RATE_LIMITED" | "NETWORK_ERROR" | "PARSE_ERROR";

export class GmailReadError extends Error {
  constructor(public status: Exclude<GmailReadStatus, "LIVE">, message: string) { super(message); }
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
const MAX_MESSAGES = 200;
const PAGE_SIZE = 100;
const DETAIL_CONCURRENCY = 5;

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

export class LiveGmailReader implements GmailReader {
  constructor(
    private refreshTokenSource: () => Promise<string | null>,
    private client: { id: string; secret: string },
    private http: typeof fetch = fetch,
    private clock: () => number = Date.now,
    private context: { knownMembers?: readonly string[]; excludedDomains?: readonly string[] } = {},
  ) {}

  private async accessToken(signal: AbortSignal): Promise<string> {
    const refreshToken = await this.refreshTokenSource();
    if (!refreshToken) throw new GmailReadError("NOT_CONNECTED", GMAIL_READ_REASON.NOT_CONNECTED);
    let response: Response;
    try {
      response = await this.http("https://oauth2.googleapis.com/token", {
        method: "POST", cache: "no-store", redirect: "error", signal,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "refresh_token", client_id: this.client.id, client_secret: this.client.secret, refresh_token: refreshToken }),
      });
    } catch { throw new GmailReadError("NETWORK_ERROR", GMAIL_READ_REASON.NETWORK_ERROR); }
    if (!response.ok) {
      // Only the error code is inspected, never echoed: the body can carry more than a code.
      let code = "";
      try { code = String(((await response.json()) as { error?: unknown }).error ?? ""); } catch { code = ""; }
      if (code === "invalid_grant") throw new GmailReadError("AUTH_REVOKED", GMAIL_READ_REASON.AUTH_REVOKED);
      throw new GmailReadError("AUTH_EXPIRED", GMAIL_READ_REASON.AUTH_EXPIRED);
    }
    const body = (await response.json()) as { access_token?: string; scope?: string };
    // A grant that is not exactly gmail.readonly is refused before it is used.
    if (!gmailReadOnlyScope(body.scope)) throw new GmailReadError("SCOPE_INVALID", GMAIL_READ_REASON.SCOPE_INVALID);
    if (!body.access_token) throw new GmailReadError("AUTH_EXPIRED", GMAIL_READ_REASON.AUTH_EXPIRED);
    return body.access_token;
  }

  private async get(url: string | URL, token: string, signal: AbortSignal): Promise<unknown> {
    let response: Response;
    try {
      response = await this.http(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", redirect: "error", signal });
    } catch { throw new GmailReadError("NETWORK_ERROR", GMAIL_READ_REASON.NETWORK_ERROR); }
    if (response.status === 429) throw new GmailReadError("RATE_LIMITED", GMAIL_READ_REASON.RATE_LIMITED);
    if (response.status === 401) throw new GmailReadError("AUTH_EXPIRED", GMAIL_READ_REASON.AUTH_EXPIRED);
    if (response.status === 403) {
      const text = await response.text();
      throw /rateLimitExceeded|userRateLimitExceeded/.test(text)
        ? new GmailReadError("RATE_LIMITED", GMAIL_READ_REASON.RATE_LIMITED)
        : new GmailReadError("AUTH_REVOKED", GMAIL_READ_REASON.AUTH_REVOKED);
    }
    if (!response.ok) throw new GmailReadError("GMAIL_API_ERROR", GMAIL_READ_REASON.GMAIL_API_ERROR);
    try { return await response.json(); } catch { throw new GmailReadError("PARSE_ERROR", GMAIL_READ_REASON.PARSE_ERROR); }
  }

  async read(window: GmailReadWindow): Promise<GmailReadRecord> {
    const signal = AbortSignal.timeout(60000); // One deadline across token, list and every detail.
    const token = await this.accessToken(signal);

    const profile = (await this.get(`${GMAIL_API_BASE}/profile?fields=emailAddress`, token, signal)) as { emailAddress?: string };
    if (typeof profile.emailAddress !== "string" || !profile.emailAddress.includes("@")) {
      throw new GmailReadError("PARSE_ERROR", GMAIL_READ_REASON.PARSE_ERROR);
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
      const body = (await this.get(url, token, signal)) as { messages?: { id?: string }[]; nextPageToken?: string };
      const listed = body.messages ?? [];
      if (!Array.isArray(listed) || listed.length > PAGE_SIZE) throw new GmailReadError("PARSE_ERROR", GMAIL_READ_REASON.PARSE_ERROR);
      for (const item of listed) {
        if (typeof item?.id !== "string" || !item.id) throw new GmailReadError("PARSE_ERROR", GMAIL_READ_REASON.PARSE_ERROR);
        ids.push(item.id);
      }
      if (ids.length > MAX_MESSAGES) throw new GmailReadError("GMAIL_API_ERROR", "Gmailの取得件数が上限を超えました");
      page = body.nextPageToken;
      if (!page) break;
      // A repeated token means the server is looping; publishing now would be a partial read.
      if (typeof page !== "string" || seenPages.has(page)) throw new GmailReadError("PARSE_ERROR", GMAIL_READ_REASON.PARSE_ERROR);
      seenPages.add(page);
      if (count === MAX_PAGES - 1) throw new GmailReadError("GMAIL_API_ERROR", "Gmailのページ数が上限を超えました");
    }
    if (new Set(ids).size !== ids.length) throw new GmailReadError("PARSE_ERROR", GMAIL_READ_REASON.PARSE_ERROR);

    const messages: GmailMessageRecord[] = [];
    for (let i = 0; i < ids.length; i += DETAIL_CONCURRENCY) {
      const batch = await Promise.all(ids.slice(i, i + DETAIL_CONCURRENCY).map(async id => {
        const raw = (await this.get(
          `${GMAIL_API_BASE}/messages/${encodeURIComponent(id)}?format=full&fields=id,threadId,internalDate,labelIds,snippet,payload`,
          token, signal,
        )) as GmailApiMessage;
        if (raw?.id !== id) throw new GmailReadError("PARSE_ERROR", GMAIL_READ_REASON.PARSE_ERROR);
        try { return normalizeMessage(raw, account); }
        catch { throw new GmailReadError("PARSE_ERROR", GMAIL_READ_REASON.PARSE_ERROR); }
      }));
      messages.push(...batch);
    }
    if (new Set(messages.map(m => m.messageId)).size !== messages.length) throw new GmailReadError("PARSE_ERROR", GMAIL_READ_REASON.PARSE_ERROR);

    return {
      sourceMode: "LIVE",
      readAt: new Date(this.clock()).toISOString(),
      accountMasked: maskAccount(account),
      window, query, scope: GMAIL_READ_SCOPE,
      messages,
      threads: buildThreads(messages, this.context.knownMembers ?? [], this.context.excludedDomains ?? []),
    };
  }
}
