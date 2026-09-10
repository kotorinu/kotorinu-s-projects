import { calendarSnapshot } from "./calendarSnapshot";
import { calendarStamp, CALENDAR_FRESH_MS } from "./calendarTime";

// WHENをどこから読むか、を1つのinterfaceにする (2026-09-09, §11).
//
// TODAYは「Google Calendarから読んでいるのか、保存済みのSnapshotを見ているのか」
// を知らなくていい。知る必要があるのは1つだけ——**それがいつの情報か**。
// なので結果には必ず source と readAt が付いてくる。
//
// これがあると、Live読み取りが用意できた日に差し替えるのが実装ではなく設定に
// なる。そして用意できていない間は、Snapshotであることを画面が正直に言える。

export interface CalendarEventDTO {
  id: string;
  summary: string;
  /** YYYY-MM-DD（ローカル日付） */
  date: string;
  /** HH:mm。終日なら null。 */
  startTime: string | null;
  endTime: string | null;
  /** Google Calendar の colorId。色はここが正本 (§5)。 */
  colorId: string | null;
  allDay: boolean;
  /** Calendarの説明文。あれば表示に使えるが、DoDとしては扱わない (§4)。 */
  description: string | null;
}

/**
 * LIVE  = いまGoogle Calendarから読んだ。「最新」と言ってよい。
 * SNAPSHOT = 保存済みの読み取り結果。**「最新」とは絶対に言わない** (§13/§14)。
 *   Snapshotを取ったあとに本人がCalendarを編集したかどうかを、このアプリは
 *   知る手段がない。planLastChangedAt <= readAt でも「一致している」証明には
 *   ならない。
 */
export type CalendarSource = "LIVE" | "SNAPSHOT";

export const CALENDAR_SOURCE_LABEL: Record<CalendarSource, string> = {
  LIVE: "最新",
  SNAPSHOT: "Snapshot",
};

export interface CalendarFetchResult {
  events: CalendarEventDTO[];
  source: CalendarSource;
  /** この情報がいつの時点のものか。ISO8601。 */
  readAt: string;
  coverageStart: string;
  coverageEnd: string;
  /** LIVEが使えなかった理由。使えた場合は null。 */
  fallbackReason: string | null;
  stale: boolean;
  liveBacked: boolean;
  authRequired: boolean;
  refreshing?: boolean;
}

export interface CalendarProvider {
  readonly name: string;
  getEvents(startDate: string, endDate: string, options?: { trigger: "CACHE" | "OPEN" | "MANUAL" }): Promise<CalendarFetchResult>;
}

// --- Snapshot Provider ---

/** 保存済みの読み取り結果を返す。常に利用可能で、常にSNAPSHOTと名乗る。 */
export const snapshotCalendarProvider: CalendarProvider = {
  name: "snapshot",
  async getEvents(startDate, endDate) {
    return snapshotEvents(startDate, endDate, null);
  },
};

export function snapshotEvents(
  startDate: string,
  endDate: string,
  fallbackReason: string | null
): CalendarFetchResult {
  return {
    events: calendarSnapshot.events
      .filter((e) => e.date >= startDate && e.date <= endDate)
      .map((e) => ({
        id: e.id,
        summary: e.summary,
        date: e.date,
        startTime: e.startTime,
        endTime: e.endTime,
        colorId: e.colorId,
        allDay: e.allDay,
        description: null,
      })),
    source: "SNAPSHOT",
    readAt: calendarSnapshot.readAt,
    coverageStart: calendarSnapshot.coverageStart,
    coverageEnd: calendarSnapshot.coverageEnd,
    fallbackReason,
    stale: true,
    liveBacked: false,
    authRequired: false,
  };
}

// --- Google Provider ---

export interface CalendarApiResponse {
  configured: boolean;
  reason?: string;
  authRequired?: boolean;
  status?: "REFRESHED" | "FRESH" | "BUSY" | "LIMITED" | "FAILED";
  result?: CalendarFetchResult | null;
}

/**
 * サーバ側の /api/calendar 経由でGoogle Calendarを読む。
 *
 * ブラウザからGoogleを直接叩かない。tokenをクライアントへ出さないためで、
 * これは実装の都合ではなく要件（Secret/tokenをsource codeにもlocalStorageにも
 * 置かない）。認証情報が無いときサーバは configured:false を返し、ここは
 * Snapshotへ落ちる——**推測でイベントを作ることは絶対にしない**。
 */
export const googleCalendarProvider: CalendarProvider = {
  name: "google",
  async getEvents(startDate, endDate, options = { trigger: "OPEN" }) {
    try {
      const res = await fetch(
        `/api/calendar?start=${encodeURIComponent(startDate)}&end=${encodeURIComponent(endDate)}`,
        options.trigger === "CACHE" ? { cache: "no-store" } : { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ trigger: options.trigger }), cache: "no-store" }
      );
      const body = (await res.json()) as CalendarApiResponse;
      if (!body.result) {
        return { ...snapshotEvents(startDate, endDate, body.reason ?? "Calendarの保存先・接続を確認してください"), authRequired: body.authRequired === true, refreshing: body.status === "BUSY" };
      }
      return { ...body.result, events: body.result.events.filter(e => e.date >= startDate && e.date <= endDate),
        fallbackReason: body.reason ?? body.result.fallbackReason,
        stale: !res.ok || body.result.stale || body.result.coverageStart > startDate || body.result.coverageEnd < endDate };
    } catch {
      return snapshotEvents(startDate, endDate, "Calendarへ接続できません。最後の取得データを表示します");
    }
  },
};

/**
 * アプリが使うProvider。LiveをまずTryし、駄目ならSnapshotへ落ちる——
 * どちらになったかは結果の source が持っているので、画面は嘘をつけない。
 */
export const calendarProvider: CalendarProvider = googleCalendarProvider;

/** A failed refresh may never replace newer live data with the bundled snapshot. */
export function retainLastCalendar(previous: CalendarFetchResult, next: CalendarFetchResult, start: string, end: string): CalendarFetchResult {
  if (previous.liveBacked && (!next.liveBacked || Date.parse(next.readAt) < Date.parse(previous.readAt))) {
    return { ...previous, source: "SNAPSHOT", events: previous.events.filter(e => e.date >= start && e.date <= end), stale: true,
      authRequired: next.authRequired, refreshing: next.refreshing, fallbackReason: next.fallbackReason ?? "Calendar更新結果を確認できません" };
  }
  return next;
}
export function ageCalendarResult(result: CalendarFetchResult, now: number): CalendarFetchResult {
  return now - Date.parse(result.readAt) >= CALENDAR_FRESH_MS ? { ...result, source: "SNAPSHOT", stale: true } : result;
}
export function calendarFreshnessLabel(result: CalendarFetchResult): string {
  const stamp = calendarStamp(result.readAt);
  if (result.authRequired) return `Calendar snapshot・最終取得 ${stamp} JST`;
  if (result.fallbackReason) return `Calendar取得に失敗・${result.liveBacked ? "" : "snapshot・"}最後の取得 ${stamp} JST`;
  if (!result.liveBacked) return `Calendar snapshot・最終取得 ${stamp} JST`;
  return result.stale ? `Calendarを更新・最後の取得 ${stamp} JST` : `Calendar ✓ ${stamp} JST 更新`;
}
