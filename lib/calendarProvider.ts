import { calendarSnapshot } from "./calendarSnapshot";

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
  SNAPSHOT: "照合済み（Snapshot）",
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
}

export interface CalendarProvider {
  readonly name: string;
  getEvents(startDate: string, endDate: string): Promise<CalendarFetchResult>;
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
  };
}

// --- Google Provider ---

export interface CalendarApiResponse {
  configured: boolean;
  reason?: string;
  events?: CalendarEventDTO[];
  readAt?: string;
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
  async getEvents(startDate, endDate) {
    try {
      const res = await fetch(
        `/api/calendar?start=${encodeURIComponent(startDate)}&end=${encodeURIComponent(endDate)}`,
        { cache: "no-store" }
      );
      const body = (await res.json()) as CalendarApiResponse;
      if (!res.ok || !body.configured || !body.events) {
        return snapshotEvents(startDate, endDate, body.reason ?? `Calendar API 応答 ${res.status}`);
      }
      return {
        events: body.events,
        source: "LIVE",
        readAt: body.readAt ?? new Date().toISOString(),
        coverageStart: startDate,
        coverageEnd: endDate,
        fallbackReason: null,
      };
    } catch (err) {
      return snapshotEvents(
        startDate,
        endDate,
        err instanceof Error ? `Calendarへ接続できません: ${err.message}` : "Calendarへ接続できません"
      );
    }
  },
};

/**
 * アプリが使うProvider。LiveをまずTryし、駄目ならSnapshotへ落ちる——
 * どちらになったかは結果の source が持っているので、画面は嘘をつけない。
 */
export const calendarProvider: CalendarProvider = googleCalendarProvider;
