import { createHash, randomUUID } from "node:crypto";
import type { CalendarFetchResult } from "../calendarProvider";
import { calendarBounds, calendarWindow, CALENDAR_FRESH_MS, jstParts, validCalendarDate } from "../calendarTime";
import { RedisJsonStore, type JsonStore } from "./redisJsonStore";
import { redisCredentials } from "./redisClient";
import { LiveGoogleCalendarProvider, type CalendarReader, type CalendarSnapshotRecord } from "./liveGoogleCalendar";

export type CalendarTrigger = "OPEN" | "MANUAL" | "SCHEDULED";
export interface CalendarState {
  schemaVersion: 1;
  version: number;
  snapshot: CalendarSnapshotRecord | null;
  lastAttemptAt: string | null;
  lastAttemptTrigger?: CalendarTrigger;
  lastFailure: string | null;
  lease: { id: string; until: number } | null;
  scheduled: { lastInvokedAt: string | null; lastSucceededAt: string | null };
}
export const emptyCalendarState = (): CalendarState => ({ schemaVersion: 1, version: 0, snapshot: null, lastAttemptAt: null, lastFailure: null, lease: null, scheduled: { lastInvokedAt: null, lastSucceededAt: null } });
function validateSnapshot(s: CalendarSnapshotRecord) {
  calendarBounds(s.coverageStart, s.coverageEnd);
  if (s.sourceMode !== "LIVE" || !Number.isFinite(Date.parse(s.readAt)) || !Array.isArray(s.events) || s.events.length > 5000 ||
    s.events.some(e => !e || typeof e.id !== "string" || !e.id || typeof e.summary !== "string" || !validCalendarDate(e.date) || typeof e.allDay !== "boolean" || e.date < s.coverageStart || e.date > s.coverageEnd ||
      (e.allDay ? e.startTime !== null || e.endTime !== null : !/^([01]\d|2[0-3]):[0-5]\d$/.test(e.startTime ?? "") || !/^(?:([01]\d|2[0-3]):[0-5]\d|24:00)$/.test(e.endTime ?? "") || e.endTime! <= e.startTime!)) ||
    new Set(s.events.map(e => `${e.id}:${e.date}`)).size !== s.events.length) throw new Error("Calendar保存データが不正です");
}
function decode(raw: string | null): CalendarState {
  if (!raw) return emptyCalendarState();
  const state = JSON.parse(raw) as CalendarState;
  if (state.schemaVersion !== 1 || !Number.isSafeInteger(state.version) || !state.scheduled ||
    state.lease && (!state.lease.id || !Number.isFinite(state.lease.until))) throw new Error("Calendar Storeが不正です");
  if (state.snapshot) validateSnapshot(state.snapshot);
  return state;
}
export function configuredCalendarStore(): JsonStore<CalendarState> | null {
  const e = process.env;
  const credentials = redisCredentials(e);
  if (!credentials) return null;
  // Separate from Planner; changing the configured Calendar cannot serve another Calendar's cache.
  const source = createHash("sha256").update(JSON.stringify([e.GOOGLE_CALENDAR_CLIENT_ID ?? "", e.GOOGLE_CALENDAR_ID || "primary", e.GOOGLE_CALENDAR_REFRESH_TOKEN ?? ""])).digest("hex").slice(0, 24);
  return new RedisJsonStore(credentials.url, credentials.token, `calendar:read:v1:${source}`, decode);
}
export function cachedCalendarResult(state: CalendarState, now: number): CalendarFetchResult | null {
  const s = state.snapshot; if (!s) return null;
  const range = calendarWindow(now), age = now - Date.parse(s.readAt);
  const unfinished = !!state.lease && state.lease.until <= now;
  const failure = state.lastFailure ?? (unfinished ? "前回のCalendar更新が完了していません。最後の取得データを表示します" : null);
  const stale = !!failure || age < 0 || age >= CALENDAR_FRESH_MS || s.coverageStart > range.coverageStart || s.coverageEnd < range.coverageEnd;
  return { ...s, source: "SNAPSHOT", liveBacked: true, stale, authRequired: false, fallbackReason: failure,
    refreshing: !!state.lease && state.lease.until > now };
}
export interface RefreshOutcome { result: CalendarFetchResult | null; status: "REFRESHED" | "FRESH" | "BUSY" | "LIMITED" | "FAILED"; reason: string | null }
const FAILURE = "Calendar取得に失敗。最後に成功したデータを表示しています";
export class CalendarRefreshService {
  constructor(private store: JsonStore<CalendarState>, private provider: CalendarReader = new LiveGoogleCalendarProvider(), private clock: () => number = Date.now) {}
  async cached() { return cachedCalendarResult(await this.store.read(), this.clock()); }
  async refresh(trigger: CalendarTrigger): Promise<RefreshOutcome> {
    const now = this.clock(), at = new Date(now).toISOString(), range = calendarWindow(now), id = randomUUID();
    // Check the durable cache before a CAS; fresh opens do not write or call Google.
    const previous = await this.store.read();
    const cached = cachedCalendarResult(previous, now);
    if (trigger === "OPEN" && cached && !cached.stale) return { result: cached, status: "FRESH", reason: null };
    const claim = await this.store.transact(state => {
      const current = cachedCalendarResult(state, now);
      if (state.lease && state.lease.until > now) return "BUSY" as const;
      if (trigger === "OPEN" && current && !current.stale) return "FRESH" as const;
      if (trigger === "SCHEDULED" && state.scheduled.lastSucceededAt && jstParts(state.scheduled.lastSucceededAt).date === jstParts(now).date) return "FRESH" as const;
      // A single shared 60s cooldown prevents refresh storms and bounds manual retries.
      if (state.lastAttemptAt && now - Date.parse(state.lastAttemptAt) < 60000 && !(trigger === "SCHEDULED" && state.lastAttemptTrigger !== "SCHEDULED")) return "LIMITED" as const;
      state.lastAttemptAt = at; state.lastAttemptTrigger = trigger; state.lease = { id, until: now + 90000 };
      if (trigger === "SCHEDULED") state.scheduled.lastInvokedAt = at;
      return "CLAIMED" as const;
    });
    if (claim !== "CLAIMED") return { result: await this.cached(), status: claim, reason: claim === "LIMITED" ? "Calendarは取得直後です。1分後に再試行できます" : null };
    try {
      const snapshot = await this.provider.read(range.coverageStart, range.coverageEnd);
      validateSnapshot(snapshot);
      if (snapshot.coverageStart !== range.coverageStart || snapshot.coverageEnd !== range.coverageEnd ||
        Date.parse(snapshot.readAt) < now || Date.parse(snapshot.readAt) > this.clock() + 1000) throw new Error("Calendar取得範囲・時刻が不正です");
      const finished = this.clock();
      const saved = await this.store.transact(state => {
        if (state.lease?.id !== id || state.lease.until <= finished) return false;
        state.snapshot = snapshot; state.lastFailure = null; state.lease = null;
        if (trigger === "SCHEDULED") state.scheduled.lastSucceededAt = snapshot.readAt;
        return true;
      });
      if (!saved) return { result: await this.cached(), status: "BUSY", reason: "別のCalendar更新結果を待っています" };
      return { result: { ...snapshot, source: "LIVE", liveBacked: true, stale: false, authRequired: false, fallbackReason: null, refreshing: false }, status: "REFRESHED", reason: null };
    } catch {
      try {
        await this.store.transact(state => { if (state.lease?.id === id) { state.lastFailure = FAILURE; state.lease = null; } });
        return { result: await this.cached(), status: "FAILED", reason: FAILURE };
      } catch {
        return { result: cached ? { ...cached, stale: true, fallbackReason: FAILURE } : null, status: "FAILED", reason: FAILURE };
      }
    }
  }
}
