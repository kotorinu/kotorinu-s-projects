/**
 * Turning Gmail's wire format into something a planner can reason about.
 *
 * Three rules shape this file:
 *
 * 1. Read, never mutate. Nothing here calls a Gmail method that changes state,
 *    and fetching a message does not mark it read — only users.messages.modify
 *    does that, and it is never called.
 * 2. Keep the minimum. Google's raw response is not stored or returned; a
 *    bounded, normalized record is.
 * 3. Never conclude more than the mail supports. A classification carries the
 *    evidence that produced it, and "I cannot tell" stays UNKNOWN rather than
 *    being rounded to a guess.
 */

export const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";
export const MAX_BODY_CHARS = 20000;
const MAX_PARTS = 300;
const MAX_DEPTH = 20;

export interface GmailApiPart {
  mimeType?: string;
  filename?: string;
  headers?: { name: string; value: string }[];
  body?: { size?: number; data?: string; attachmentId?: string };
  parts?: GmailApiPart[];
}
export interface GmailApiMessage {
  id?: string;
  threadId?: string;
  internalDate?: string;
  labelIds?: string[];
  snippet?: string;
  payload?: GmailApiPart;
}

export interface GmailAttachment { filename: string; mimeType: string; hasAttachmentId: boolean; size: number | null }
export type MailDirection = "INCOMING" | "OUTGOING";
export interface GmailMessageRecord {
  messageId: string;
  threadId: string;
  direction: MailDirection;
  receivedAt: string;
  internalDate: string;
  from: string;
  fromName: string | null;
  to: string[];
  cc: string[];
  subject: string;
  snippet: string;
  bodyText: string;
  bodyTruncated: boolean;
  bodySource: "TEXT_PLAIN" | "TEXT_HTML" | "NONE";
  labels: string[];
  isUnread: boolean;
  inReplyTo: string | null;
  references: string[];
  attachments: GmailAttachment[];
}

const fail = (why: string) => new Error(`Gmail読み取りを確認できません（${why}）`);

export function headerOf(part: GmailApiPart | undefined, name: string): string {
  return part?.headers?.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
}

/** "Name <a@b.c>, d@e.f" -> ["a@b.c", "d@e.f"], lowercased and de-duplicated. */
export function parseAddresses(raw: string): string[] {
  const found = raw.match(/[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g) ?? [];
  return [...new Set(found.map(a => a.toLowerCase()))];
}

export function parseDisplayName(raw: string): string | null {
  const quoted = /"([^"]{1,100})"\s*</.exec(raw);
  if (quoted) return quoted[1].trim() || null;
  const bare = /^\s*([^<>@,"]{1,100}?)\s*</.exec(raw);
  return bare ? bare[1].trim() || null : null;
}

/**
 * Japanese mail is routinely ISO-2022-JP or Shift_JIS rather than UTF-8, and
 * decoding those as UTF-8 produces mojibake that would then be classified and
 * shown as if it were the message. The charset is taken from the part.
 */
export function decodeBody(data: string, charset: string | null): string {
  const bytes = Buffer.from(data, "base64url");
  const label = (charset ?? "utf-8").trim().toLowerCase().replace(/^["']|["']$/g, "");
  try {
    return new TextDecoder(label, { fatal: false }).decode(bytes);
  } catch {
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  }
}

function charsetOf(part: GmailApiPart): string | null {
  const value = headerOf(part, "Content-Type");
  return /charset\s*=\s*("?[^";]+"?)/i.exec(value)?.[1] ?? null;
}

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'", yen: "¥", middot: "・",
};
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (whole, name: string) => {
    if (name.startsWith("#x") || name.startsWith("#X")) {
      const code = Number.parseInt(name.slice(2), 16);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    if (name.startsWith("#")) {
      const code = Number(name.slice(1));
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[name.toLowerCase()] ?? whole;
  });
}

/**
 * HTML becomes text here and is never rendered. Scripts and styles are dropped
 * with their contents; every tag is removed, so no image, tracking pixel, or
 * remote resource survives to be requested by anything downstream.
 */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<(script|style|head|noscript)\b[\s\S]*?<\/\1\s*>/gi, "")
      .replace(/<\/(p|div|tr|li|h[1-6]|blockquote|table)\s*>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]*>/g, "")
  )
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

interface CollectedParts { plain: string[]; html: string[]; attachments: GmailAttachment[] }

/** Depth-first walk over multipart/alternative, /mixed, /related and anything nested inside them. */
export function collectParts(payload: GmailApiPart | undefined): CollectedParts {
  const out: CollectedParts = { plain: [], html: [], attachments: [] };
  let seen = 0;
  const walk = (part: GmailApiPart | undefined, depth: number) => {
    if (!part || depth > MAX_DEPTH) return;
    if (++seen > MAX_PARTS) throw fail("構造が大きすぎます");
    const mime = (part.mimeType ?? "").toLowerCase();
    const filename = typeof part.filename === "string" ? part.filename : "";
    const isAttachment = filename.length > 0 || !!part.body?.attachmentId;
    if (isAttachment) {
      // Metadata only. The attachment bytes are never downloaded.
      out.attachments.push({
        filename: filename.slice(0, 300), mimeType: mime || "application/octet-stream",
        hasAttachmentId: !!part.body?.attachmentId,
        size: Number.isFinite(part.body?.size) ? Number(part.body!.size) : null,
      });
    } else if (part.body?.data) {
      const decoded = decodeBody(part.body.data, charsetOf(part));
      if (mime === "text/plain") out.plain.push(decoded);
      else if (mime === "text/html") out.html.push(decoded);
    }
    for (const child of part.parts ?? []) walk(child, depth + 1);
  };
  walk(payload, 0);
  return out;
}

export function extractBody(payload: GmailApiPart | undefined): { text: string; source: GmailMessageRecord["bodySource"]; truncated: boolean } {
  const { plain, html } = collectParts(payload);
  // text/plain wins wherever it exists: it is what the sender's client meant to
  // be read, and it needs no stripping.
  let text = plain.join("\n").replace(/\r\n?/g, "\n").trim();
  let source: GmailMessageRecord["bodySource"] = text ? "TEXT_PLAIN" : "NONE";
  if (!text && html.length > 0) {
    text = htmlToText(html.join("\n"));
    source = text ? "TEXT_HTML" : "NONE";
  }
  const truncated = text.length > MAX_BODY_CHARS;
  return { text: truncated ? `${text.slice(0, MAX_BODY_CHARS)}…` : text, source, truncated };
}

export function normalizeMessage(raw: GmailApiMessage, account: string): GmailMessageRecord {
  if (!raw || typeof raw !== "object") throw fail("応答が不正です");
  if (typeof raw.id !== "string" || !raw.id || raw.id.length > 200) throw fail("message idが不正です");
  if (typeof raw.threadId !== "string" || !raw.threadId || raw.threadId.length > 200) throw fail("thread idが不正です");
  const millis = Number(raw.internalDate);
  if (!Number.isFinite(millis) || millis <= 0) throw fail("受信日時が不正です");
  const labels = (raw.labelIds ?? []).filter(l => typeof l === "string").slice(0, 50);
  const from = parseAddresses(headerOf(raw.payload, "From"))[0] ?? "";
  const body = extractBody(raw.payload);
  const references = parseAddresses(headerOf(raw.payload, "References"));
  return {
    messageId: raw.id,
    threadId: raw.threadId,
    // SENT is authoritative; the From address is the fallback when a message
    // was filed without it.
    direction: labels.includes("SENT") || (!!account && from === account) ? "OUTGOING" : "INCOMING",
    receivedAt: new Date(millis).toISOString(),
    internalDate: String(millis),
    from,
    fromName: parseDisplayName(headerOf(raw.payload, "From")),
    to: parseAddresses(headerOf(raw.payload, "To")),
    cc: parseAddresses(headerOf(raw.payload, "Cc")),
    subject: headerOf(raw.payload, "Subject").slice(0, 500),
    snippet: decodeEntities(typeof raw.snippet === "string" ? raw.snippet : "").slice(0, 500),
    bodyText: body.text,
    bodyTruncated: body.truncated,
    bodySource: body.source,
    labels,
    isUnread: labels.includes("UNREAD"),
    inReplyTo: headerOf(raw.payload, "In-Reply-To").slice(0, 500) || null,
    references: references.slice(0, 50),
    attachments: collectParts(raw.payload).attachments.slice(0, 50),
  };
}

// --- Classification (§17/§18) ---

export type RialaRelevance = "RIALA_RELEVANT" | "POSSIBLY_RIALA" | "NOT_RIALA" | "UNKNOWN";
export interface RelevanceEvidence { rule: string; detail: string }
export interface ClassifiedThread {
  threadId: string;
  relevance: RialaRelevance;
  evidence: RelevanceEvidence[];
  subject: string;
  participants: string[];
  messageIds: string[];
  lastMessageAt: string;
  lastIncomingAt: string | null;
  lastOutgoingAt: string | null;
  replyState: ReplyState;
  unreadCount: number;
}

/**
 * What the mail can support, and nothing further. In particular there is no
 * "no reply needed": Gmail alone cannot establish that, so the planner is
 * given the facts and decides.
 */
export type ReplyState =
  | "AWAITING_OUR_REPLY"   // their message is the most recent
  | "AWAITING_THEIR_REPLY" // ours is the most recent, and they had written
  | "OUTGOING_ONLY"        // we wrote; nothing has come back in this window
  | "UNKNOWN";

const STRONG_TOKENS = [/riala/i, /リアラ/];
const WEAK_TOKENS = [/移行/, /新アプリ/, /登録方法/, /コミュニティ/, /招待/, /退会/];

/**
 * Evidence names the term that matched, not the passage around it.
 *
 * A surrounding quote would explain the decision slightly better and would
 * carry message content into every response that shows it. The matched term is
 * enough to justify the label, so the body stays on the server.
 */
function matchedTerm(text: string, pattern: RegExp): string {
  return pattern.exec(text)?.[0] ?? "";
}

/**
 * Known member addresses come from the Members source, which is not connected
 * yet. Until it is, classification rests on what the mail itself says, and the
 * evidence records exactly that — it never implies a member match happened.
 */
export function classifyThread(messages: GmailMessageRecord[], knownMembers: readonly string[] = [], excludedDomains: readonly string[] = []): { relevance: RialaRelevance; evidence: RelevanceEvidence[] } {
  const evidence: RelevanceEvidence[] = [];
  const members = new Set(knownMembers.map(m => m.toLowerCase()));
  for (const message of messages) {
    for (const address of [message.from, ...message.to, ...message.cc]) {
      if (address && members.has(address)) {
        evidence.push({ rule: "SENDER_IS_KNOWN_MEMBER", detail: `既知メンバーのアドレスと一致: ${address}` });
        break;
      }
    }
    for (const pattern of STRONG_TOKENS) {
      if (pattern.test(message.subject)) { evidence.push({ rule: "SUBJECT_CONTAINS_RIALA", detail: `件名に「${matchedTerm(message.subject, pattern)}」が含まれます` }); break; }
    }
    for (const pattern of STRONG_TOKENS) {
      if (pattern.test(message.bodyText)) { evidence.push({ rule: "BODY_CONTAINS_RIALA", detail: `本文に「${matchedTerm(message.bodyText, pattern)}」が含まれます` }); break; }
    }
    for (const pattern of WEAK_TOKENS) {
      const term = matchedTerm(message.subject, pattern) || matchedTerm(message.bodyText, pattern);
      if (term) { evidence.push({ rule: "TOPIC_KEYWORD", detail: `関連しうる語「${term}」が含まれます` }); break; }
    }
  }
  // Exclusion is only ever explicit and configured. Nothing is dropped on a guess.
  const senders = messages.map(m => m.from).filter(Boolean);
  if (excludedDomains.length > 0 && senders.length > 0 &&
    senders.every(s => excludedDomains.some(d => s.endsWith(`@${d.toLowerCase()}`)))) {
    return { relevance: "NOT_RIALA", evidence: [{ rule: "EXCLUDED_DOMAIN", detail: "運用者が除外指定した送信元です" }] };
  }
  const unique = [...new Map(evidence.map(e => [`${e.rule}:${e.detail}`, e])).values()].slice(0, 12);
  const strong = unique.some(e => ["SENDER_IS_KNOWN_MEMBER", "SUBJECT_CONTAINS_RIALA", "BODY_CONTAINS_RIALA"].includes(e.rule));
  if (strong) return { relevance: "RIALA_RELEVANT", evidence: unique };
  if (unique.length > 0) return { relevance: "POSSIBLY_RIALA", evidence: unique };
  // No signal either way. Saying UNKNOWN keeps it visible instead of quietly discarding it.
  return { relevance: "UNKNOWN", evidence: [] };
}

export function replyStateOf(messages: GmailMessageRecord[]): ReplyState {
  if (messages.length === 0) return "UNKNOWN";
  const sorted = [...messages].sort((a, b) => Number(a.internalDate) - Number(b.internalDate));
  const incoming = sorted.filter(m => m.direction === "INCOMING");
  const last = sorted[sorted.length - 1];
  if (last.direction === "INCOMING") return "AWAITING_OUR_REPLY";
  return incoming.length > 0 ? "AWAITING_THEIR_REPLY" : "OUTGOING_ONLY";
}

export function buildThreads(messages: GmailMessageRecord[], knownMembers: readonly string[] = [], excludedDomains: readonly string[] = []): ClassifiedThread[] {
  const byThread = new Map<string, GmailMessageRecord[]>();
  for (const message of messages) {
    const bucket = byThread.get(message.threadId);
    if (bucket) bucket.push(message); else byThread.set(message.threadId, [message]);
  }
  const threads: ClassifiedThread[] = [];
  for (const [threadId, group] of byThread) {
    const sorted = [...group].sort((a, b) => Number(a.internalDate) - Number(b.internalDate));
    const incoming = sorted.filter(m => m.direction === "INCOMING");
    const outgoing = sorted.filter(m => m.direction === "OUTGOING");
    const { relevance, evidence } = classifyThread(sorted, knownMembers, excludedDomains);
    threads.push({
      threadId, relevance, evidence,
      subject: sorted.find(m => m.subject)?.subject ?? "",
      participants: [...new Set(sorted.flatMap(m => [m.from, ...m.to, ...m.cc]).filter(Boolean))].slice(0, 50),
      messageIds: sorted.map(m => m.messageId),
      lastMessageAt: sorted[sorted.length - 1].receivedAt,
      lastIncomingAt: incoming.at(-1)?.receivedAt ?? null,
      lastOutgoingAt: outgoing.at(-1)?.receivedAt ?? null,
      replyState: replyStateOf(sorted),
      unreadCount: sorted.filter(m => m.isUnread).length,
    });
  }
  return threads.sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
}
