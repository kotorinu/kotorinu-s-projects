import { readFile } from "node:fs/promises";
import type { CatalogItem, Evidence, Mail, Member, Provider, Providers, Source, SourceName } from "./model";
import { evidenceValid, validEmail } from "./planner";

export const unavailable = <T>(name: SourceName, reason: string): Source<T> => ({ name, sourceId: name, mode: "UNCONNECTED", readAt: null, complete: false, items: [], failure: reason });
const string = (x: unknown, limit = 500) => typeof x === "string" && x.length <= limit && x.trim().length > 0;
const date = (x: unknown) => typeof x === "string" && Number.isFinite(Date.parse(x));
const evidence = (x: unknown): x is Evidence => !!x && typeof x === "object" && evidenceValid(x as Evidence);
export function validMember(x: unknown): x is Member {
  if (!x || typeof x !== "object") return false; const m = x as Member;
  return string(m.id, 150) && string(m.name, 100) && !/[\r\n]/.test(m.name) && date(m.registeredAt) &&
    (m.email === null || (typeof m.email === "string" && validEmail(m.email))) && typeof m.emailVerified === "boolean" &&
    typeof m.isStaff === "boolean" && typeof m.active === "boolean" && evidence(m.evidence) && Array.isArray(m.interests) &&
    m.interests.length <= 12 && m.interests.every(i => string(i.topic, 50) && evidence(i.evidence));
}
export function validCatalog(x: unknown): x is CatalogItem {
  if (!x || typeof x !== "object") return false; const c = x as CatalogItem;
  return string(c.id, 150) && string(c.title, 180) && string(c.summary, 1000) &&
    (c.url === null || string(c.url, 1000)) && Array.isArray(c.topics) && c.topics.length <= 20 && c.topics.every(t => string(t, 50)) &&
    date(c.sourceUpdatedAt) && evidence(c.evidence) && (c.startsAt === undefined || date(c.startsAt)) &&
    (c.durationIfKnown == null || Number.isFinite(c.durationIfKnown) && c.durationIfKnown >= 0);
}
export function validMail(x: unknown): x is Mail {
  if (!x || typeof x !== "object") return false; const m = x as Mail;
  return string(m.id, 200) && string(m.threadId, 200) && date(m.timestamp) && string(m.subject, 500) &&
    Array.isArray(m.recipients) && m.recipients.length <= 100 && m.recipients.every(r => typeof r === "string" && validEmail(r)) &&
    Array.isArray(m.recipientNames) && m.recipientNames.every(n => typeof n === "string" && n.length <= 100) && string(m.reference, 1000);
}
export class SnapshotProvider<T> implements Provider<T> {
  constructor(private name: SourceName, private path: string, private validate: (x: unknown) => x is T) {}
  async read(): Promise<Source<T>> {
    try { return parseSource(this.name, JSON.parse(await readFile(this.path, "utf8")), this.validate, "SNAPSHOT"); }
    catch { return unavailable(this.name, "Snapshot読取失敗。形式・取得日時・完全性を確認してください"); }
  }
}
function parseSource<T>(name: SourceName, value: unknown, validate: (x: unknown) => x is T, mode: "LIVE" | "SNAPSHOT"): Source<T> {
  const s = value as Source<T>;
  if (!s || !string(s.sourceId) || !date(s.readAt) || s.complete !== true || !Array.isArray(s.items) || s.items.length > 500 || !s.items.every(validate)) throw new Error("Invalid source");
  const ids = s.items.map(item => (item as { id: string }).id);
  if (new Set(ids).size !== ids.length) throw new Error("Duplicate IDs");
  return { name, sourceId: s.sourceId, mode, readAt: s.readAt, complete: true, items: s.items, failure: null };
}
/** Contract adapter, NOT a claim that RIALA already exposes this API. Only operator-configured URLs. */
export class JsonSourceProvider<T> implements Provider<T> {
  constructor(private name: SourceName, private url: string, private token: string, private validate: (x: unknown) => x is T) {}
  async read(): Promise<Source<T>> {
    try {
      const u = new URL(this.url);
      if (u.protocol !== "https:" || u.username || u.password || !this.token) throw new Error("Unsafe source config");
      const res = await fetch(u, { headers: { Authorization: `Bearer ${this.token}` }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000) });
      if (!res.ok || Number(res.headers.get("content-length") ?? 0) > 2000000) throw new Error("Source unavailable");
      const body = await res.text(); if (body.length > 2000000) throw new Error("Too large");
      return parseSource(this.name, JSON.parse(body), this.validate, "LIVE");
    } catch { return unavailable(this.name, "Source取得失敗。認証・URL・取得完全性を確認してください"); }
  }
}
export async function gmailToken(send = false): Promise<string> {
  const e = process.env; const refresh = send ? e.RIALA_GMAIL_SEND_REFRESH_TOKEN : e.RIALA_GMAIL_READ_REFRESH_TOKEN;
  if (!e.RIALA_GMAIL_CLIENT_ID || !e.RIALA_GMAIL_CLIENT_SECRET || !refresh) throw new Error("Gmail認証未設定");
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: e.RIALA_GMAIL_CLIENT_ID, client_secret: e.RIALA_GMAIL_CLIENT_SECRET, refresh_token: refresh, grant_type: "refresh_token" }),
    cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error("Gmail認証失敗"); const body = await response.json() as { access_token?: string };
  if (!body.access_token) throw new Error("Gmail認証失敗"); return body.access_token;
}
export const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me/messages";
export interface GmailMessage { id: string; threadId: string; internalDate: string; labelIds?: string[]; payload?: { headers?: { name: string; value: string }[]; body?: { data?: string }; parts?: { mimeType: string; body?: { data?: string } }[] } }
export const header = (m: GmailMessage, name: string) => m.payload?.headers?.find(h => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
export function recipients(raw: string): string[] { return [...new Set((raw.match(/[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) ?? []).map(s => s.toLowerCase()))]; }
export class RealGmailProvider implements Provider<Mail> {
  async read(now: string): Promise<Source<Mail>> {
    try {
      const token = await gmailToken();
      const after = Math.floor((Date.parse(now) - 90 * 86400000) / 1000); const before = Math.ceil(Date.parse(now) / 1000) + 1;
      const items: Mail[] = []; let page: string | undefined;
      do {
        const url = new URL(GMAIL_API); url.searchParams.set("q", `in:sent RIALA after:${after} before:${before}`); url.searchParams.set("maxResults", "50");
        if (page) url.searchParams.set("pageToken", page);
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(10000) });
        if (!res.ok) throw new Error("Gmail read failed");
        const body = await res.json() as { messages?: { id: string }[]; nextPageToken?: string };
        for (const item of body.messages ?? []) {
          if (items.length >= 200) throw new Error("Bound exceeded");
          const detail = await fetch(`${GMAIL_API}/${encodeURIComponent(item.id)}?format=metadata&metadataHeaders=To&metadataHeaders=Bcc&metadataHeaders=Cc&metadataHeaders=Subject`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(10000) });
          if (!detail.ok) throw new Error("Gmail metadata failed"); const m = await detail.json() as GmailMessage;
          const to = [header(m, "To"), header(m, "Bcc"), header(m, "Cc")].join(",");
          items.push({ id: m.id, threadId: m.threadId, recipients: recipients(to), recipientNames: [...to.matchAll(/(?:^|,)\s*"?([^"<,]+)"?\s*</g)].map(match => match[1].trim()), timestamp: new Date(Number(m.internalDate)).toISOString(), subject: header(m, "Subject").slice(0, 500), reference: `https://mail.google.com/mail/u/0/#sent/${encodeURIComponent(m.id)}` });
        }
        page = body.nextPageToken;
      } while (page);
      return { name: "gmail", sourceId: "gmail:sent:riala:90days", mode: "LIVE", complete: true, readAt: now, items, failure: null };
    } catch { return unavailable("gmail", "Gmail履歴 未接続または取得失敗（直近90日・RIALA送信履歴・上限200件）"); }
  }
}
export function configuredProviders(): Providers {
  function source<T>(name: SourceName, validate: (x: unknown) => x is T): Provider<T> {
    const prefix = `RIALA_${name.toUpperCase()}`; const url = process.env[`${prefix}_SOURCE_URL`]; const token = process.env[`${prefix}_SOURCE_TOKEN`];
    if (url && token) return new JsonSourceProvider(name, url, token, validate);
    const path = process.env[`${prefix}_SNAPSHOT_PATH`];
    if (path && !process.env.VERCEL && process.env.NODE_ENV !== "production") return new SnapshotProvider(name, path, validate);
    return { read: async () => unavailable(name, `${name} Source未接続`) };
  }
  return { members: source("members", validMember), events: source("events", validCatalog), content: source("content", validCatalog),
    gmail: process.env.RIALA_GMAIL_READ_REFRESH_TOKEN ? new RealGmailProvider() : source("gmail", validMail) };
}

