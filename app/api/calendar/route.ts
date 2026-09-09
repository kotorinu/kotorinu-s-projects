import type { NextRequest } from "next/server";
import type { CalendarEventDTO } from "@/lib/calendarProvider";

// Google Calendar read-only 取得 (2026-09-09, §12).
//
// なぜサーバ側なのか: refresh token をブラウザへ出さないため。要件どおり、
// Secret は source code にも localStorage にも置かない——**環境変数のみ**、
// そしてこのファイルはその値を返さない（イベントだけを返す）。
//
// Scope は calendar.readonly のみ。書き込みは行わないし、行える権限も要求
// しない。「Calendarへ反映しました」と言えない状態を、権限のレベルで保証する。
//
// 認証情報が無い場合は configured:false を返す。ここで固定のイベントを返したり
// 推測したりはしない——それは fake 実装であって、禁止されている。
//
// 必要な環境変数（Vercel の Project Settings → Environment Variables。
// git管理下のファイルには絶対に置かない）:
//   GOOGLE_CALENDAR_CLIENT_ID
//   GOOGLE_CALENDAR_CLIENT_SECRET
//   GOOGLE_CALENDAR_REFRESH_TOKEN
//   GOOGLE_CALENDAR_ID           (任意。既定は "primary")

export const dynamic = "force-dynamic";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3/calendars";

interface GoogleEventTime {
  date?: string;
  dateTime?: string;
}

interface GoogleEvent {
  id: string;
  summary?: string;
  description?: string;
  colorId?: string;
  status?: string;
  start?: GoogleEventTime;
  end?: GoogleEventTime;
}

function missingCredentials(): string | null {
  const missing = [
    "GOOGLE_CALENDAR_CLIENT_ID",
    "GOOGLE_CALENDAR_CLIENT_SECRET",
    "GOOGLE_CALENDAR_REFRESH_TOKEN",
  ].filter((key) => !process.env[key]);
  return missing.length === 0 ? null : missing.join(", ");
}

async function accessToken(): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CALENDAR_CLIENT_ID as string,
      client_secret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET as string,
      refresh_token: process.env.GOOGLE_CALENDAR_REFRESH_TOKEN as string,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    // 本文にはtokenが含まれうるので、そのまま外へ出さない。
    throw new Error(`token refresh failed (${res.status})`);
  }
  const body = (await res.json()) as { access_token?: string };
  if (!body.access_token) throw new Error("token refresh returned no access_token");
  return body.access_token;
}

/** "2026-09-09T19:00:00+09:00" → { date, time } をローカル表記のまま切り出す。 */
function splitLocal(dateTime: string): { date: string; time: string } {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(dateTime);
  if (!m) return { date: dateTime.slice(0, 10), time: "00:00" };
  return { date: m[1], time: m[2] };
}

function toDto(ev: GoogleEvent): CalendarEventDTO | null {
  if (ev.status === "cancelled") return null;
  const summary = ev.summary ?? "(無題の予定)";
  if (ev.start?.date) {
    return {
      id: ev.id,
      summary,
      date: ev.start.date,
      startTime: null,
      endTime: null,
      colorId: ev.colorId ?? null,
      allDay: true,
      description: ev.description ?? null,
    };
  }
  if (!ev.start?.dateTime || !ev.end?.dateTime) return null;
  const start = splitLocal(ev.start.dateTime);
  const end = splitLocal(ev.end.dateTime);
  return {
    id: ev.id,
    summary,
    date: start.date,
    startTime: start.time,
    endTime: end.time,
    colorId: ev.colorId ?? null,
    allDay: false,
    description: ev.description ?? null,
  };
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const start = params.get("start");
  const end = params.get("end");
  if (!start || !end || !/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    return Response.json({ configured: false, reason: "start / end は YYYY-MM-DD で指定してください" }, { status: 400 });
  }

  const missing = missingCredentials();
  if (missing !== null) {
    // 200で返す。「設定されていますか？」への答えが「いいえ」なのは正常な
    // 応答であって、失敗ではない。エラーstatusにするとブラウザのconsoleへ
    // 赤い行が出続け、本物のエラーが埋もれる。呼び出し側はこれを見て
    // Snapshotへ落ちる。
    return Response.json({
      configured: false,
      reason: `Google Calendarの認証情報が未設定です（${missing}）`,
    });
  }

  try {
    const token = await accessToken();
    const calendarId = process.env.GOOGLE_CALENDAR_ID ?? "primary";
    const timeZone = process.env.GOOGLE_CALENDAR_TIMEZONE ?? "Asia/Tokyo";
    const url = new URL(`${CALENDAR_API}/${encodeURIComponent(calendarId)}/events`);
    url.searchParams.set("timeMin", `${start}T00:00:00Z`);
    // 終端は翌日の頭まで見ないと、その日の予定が落ちる。
    url.searchParams.set("timeMax", `${end}T23:59:59Z`);
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");
    url.searchParams.set("maxResults", "250");
    url.searchParams.set("timeZone", timeZone);

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`calendar api ${res.status}`);
    const body = (await res.json()) as { items?: GoogleEvent[] };
    const events = (body.items ?? [])
      .map(toDto)
      .filter((e): e is CalendarEventDTO => e !== null)
      .filter((e) => e.date >= start && e.date <= end);

    return Response.json({ configured: true, events, readAt: new Date().toISOString() });
  } catch (err) {
    // 例外の中身にtokenが混ざる可能性を考え、種類だけを返す。
    // ここも200——読めなかったという事実を本文で伝え、呼び出し側は
    // Snapshotへ落ちる。呼び出しそのものは成功している。
    return Response.json({
      configured: false,
      reason: `Google Calendarの読み取りに失敗しました（${err instanceof Error ? err.message : "unknown"}）`,
    });
  }
}
