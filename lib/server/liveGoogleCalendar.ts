import type { CalendarEventDTO } from "../calendarProvider";
import { addCalendarDays, calendarBounds, CALENDAR_TIME_ZONE, jstParts, validCalendarDate } from "../calendarTime";

// One definition of the scope, shared with the OAuth flow that requests it.
export { CALENDAR_READ_SCOPE } from "./calendarOAuth";
import { readOnlyScope } from "./calendarOAuth";
export interface CalendarSnapshotRecord {
  sourceMode: "LIVE";
  readAt: string;
  coverageStart: string;
  coverageEnd: string;
  events: CalendarEventDTO[];
}
export interface CalendarReader {
  read(start: string, end: string): Promise<CalendarSnapshotRecord>;
}
type GoogleEvent = { id?: string; status?: string; summary?: string; colorId?: string; description?: string; eventType?: string; start?: { date?: string; dateTime?: string }; end?: { date?: string; dateTime?: string } };
/**
 * 説明文は読む (2026-10-01 変更)。本人がCalendarの説明に書いた「完了条件：」を、
 * TODAYの「ここまでできたら完了」とタスクの完了条件に使うため。参加者・メール
 * アドレス・添付は今も読まない。保存量を抑えるため、1件と全体に上限を置く。
 */
export const DESCRIPTION_MAX = 1500;
export const DESCRIPTION_BUDGET = 300_000;
const fail = () => new Error("Calendarの完全な読み取りを確認できません");

/** Split spanning events into JST day segments while retaining the original Google ID for OS links. */
export function normalizeGoogleEvent(event: GoogleEvent, start: string, end: string): CalendarEventDTO[] {
  if (!event || typeof event !== "object") throw fail();
  if (event.status === "cancelled") return [];
  if (typeof event.id !== "string" || !event.id || event.id.length > 1024 || !event.start || !event.end ||
    event.summary != null && (typeof event.summary !== "string" || event.summary.length > 10000) ||
    event.colorId != null && (typeof event.colorId !== "string" || !/^\d{1,2}$/.test(event.colorId))) throw fail();
  if (event.description != null && typeof event.description !== "string") throw fail();
  const description = event.description ? event.description.slice(0, DESCRIPTION_MAX) : null;
  const base = { id: event.id, summary: event.summary || "（タイトルなし）", colorId: event.colorId ?? null, description,
    ...(event.eventType === "fromGmail" ? { fromGmail: true } : {}) };
  const result: CalendarEventDTO[] = [];
  if (event.start.date && event.end.date) {
    if (!validCalendarDate(event.start.date) || !validCalendarDate(event.end.date) || event.end.date <= event.start.date) throw fail();
    for (let day = start; day <= end; day = addCalendarDays(day, 1)) {
      if (day >= event.start.date && day < event.end.date) result.push({ ...base, date: day, allDay: true, startTime: null, endTime: null });
    }
    return result;
  }
  const from = event.start.dateTime, to = event.end.dateTime;
  const offset = /T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
  if (!from || !to || !offset.test(from) || !offset.test(to) || !validCalendarDate(from.slice(0, 10)) || !validCalendarDate(to.slice(0, 10)) || !Number.isFinite(Date.parse(from)) || !Number.isFinite(Date.parse(to)) || Date.parse(to) <= Date.parse(from)) throw fail();
  for (let day = start; day <= end; day = addCalendarDays(day, 1)) {
    const dayStart = Date.parse(`${day}T00:00:00+09:00`), dayEnd = dayStart + 86400000;
    const clippedStart = Math.max(Date.parse(from), dayStart), clippedEnd = Math.min(Date.parse(to), dayEnd);
    if (clippedStart < clippedEnd) result.push({ ...base, date: day, allDay: false,
      startTime: jstParts(clippedStart).time, endTime: clippedEnd === dayEnd ? "24:00" : jstParts(clippedEnd).time });
  }
  return result;
}

export class LiveGoogleCalendarProvider implements CalendarReader {
  constructor(private env: NodeJS.ProcessEnv = process.env, private http: typeof fetch = fetch, private clock: () => number = Date.now,
    /** Where the refresh token comes from. Defaults to the environment; the connected flow supplies the decrypted one. */
    private refreshTokenSource?: () => Promise<string | null>) {}
  async read(start: string, end: string): Promise<CalendarSnapshotRecord> {
    const bounds = calendarBounds(start, end);
    const e = this.env;
    const refreshToken = this.refreshTokenSource ? await this.refreshTokenSource() : e.GOOGLE_CALENDAR_REFRESH_TOKEN ?? null;
    if (!e.GOOGLE_CALENDAR_CLIENT_ID || !e.GOOGLE_CALENDAR_CLIENT_SECRET || !refreshToken) throw fail();
    const signal = AbortSignal.timeout(30000); // One deadline across token + every page.
    const tokenResponse = await this.http("https://oauth2.googleapis.com/token", { method: "POST", cache: "no-store", redirect: "error", signal,
      headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "refresh_token", client_id: e.GOOGLE_CALENDAR_CLIENT_ID,
        client_secret: e.GOOGLE_CALENDAR_CLIENT_SECRET, refresh_token: refreshToken }) });
    if (!tokenResponse.ok) throw fail();
    const token = await tokenResponse.json() as { access_token?: string; scope?: string };
    // An independent read credential; never reuse a Calendar write token or send credential.
    if (!token.access_token || !readOnlyScope(token.scope)) throw fail();
    const events: CalendarEventDTO[] = [], seenPages = new Set<string>(), ids = new Set<string>();
    let page: string | undefined;
    for (let count = 0; count < 20; count++) {
      const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(e.GOOGLE_CALENDAR_ID || "primary")}/events`);
      for (const [key, value] of Object.entries({ ...bounds, timeZone: CALENDAR_TIME_ZONE, singleEvents: "true", orderBy: "startTime", maxResults: "250",
        fields: "items(id,status,summary,colorId,description,eventType,start,end),nextPageToken" })) url.searchParams.set(key, value);
      if (page) url.searchParams.set("pageToken", page);
      const response = await this.http(url, { headers: { Authorization: `Bearer ${token.access_token}` }, cache: "no-store", redirect: "error", signal });
      if (!response.ok || Number(response.headers.get("content-length")) > 2000000) throw fail();
      const raw = await response.text(); if (raw.length > 2000000) throw fail();
      const body = JSON.parse(raw) as { items?: GoogleEvent[]; nextPageToken?: string };
      if (!Array.isArray(body.items) || body.items.length > 250 || body.nextPageToken != null && (typeof body.nextPageToken !== "string" || !body.nextPageToken)) throw fail();
      for (const item of body.items) {
        if (item.status === "cancelled") continue;
        if (!item.id || ids.has(item.id)) throw fail();
        ids.add(item.id); events.push(...normalizeGoogleEvent(item, start, end));
      }
      if (events.length > 5000) throw fail();
      page = body.nextPageToken;
      if (!page) return { sourceMode: "LIVE", readAt: new Date(this.clock()).toISOString(), coverageStart: start, coverageEnd: end, events: withinDescriptionBudget(events) };
      if (seenPages.has(page)) throw fail();
      seenPages.add(page);
    }
    throw fail(); // Never publish the first N pages as complete.
  }
}

/** 説明文の合計が上限を超えたら、日付の遠い予定から説明文を落とす（予定そのものは残す）。 */
export function withinDescriptionBudget(events: CalendarEventDTO[], budget = DESCRIPTION_BUDGET): CalendarEventDTO[] {
  let used = 0;
  const order = events.map((e, i) => ({ e, i })).sort((a, b) => (a.e.date + (a.e.startTime ?? "")).localeCompare(b.e.date + (b.e.startTime ?? "")));
  const keep = new Set<number>();
  for (const { e, i } of order) { const n = e.description?.length ?? 0; if (n && used + n <= budget) { used += n; keep.add(i); } }
  return events.map((e, i) => e.description && !keep.has(i) ? { ...e, description: null } : e);
}
