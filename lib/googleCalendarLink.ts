// Google Calendar の「予定を作成」画面を、内容入りで開くリンク (2026-10-01)。
//
// このアプリは Calendar への書き込み権限を持たない（読み取りのみ）。代わりに
// Google 公式の作成画面を開き、本人が「保存」を押して入れる。権限を広げずに、
// アプリで見つけた「時間が入っていない」をその場で直せる。

function utcStamp(date: string, hm: string): string {
  // JST（+09:00固定、夏時間なし）→ UTC の YYYYMMDDTHHMMSSZ
  return new Date(`${date}T${hm}:00+09:00`).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export interface CalendarDraft {
  title: string;
  date: string; // YYYY-MM-DD (JST)
  start: string; // HH:mm
  end: string; // HH:mm（開始より後。日付をまたがない）
  details?: string;
}

export function googleCalendarCreateUrl(d: CalendarDraft): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: d.title,
    dates: `${utcStamp(d.date, d.start)}/${utcStamp(d.date, d.end)}`,
    ctz: "Asia/Tokyo",
  });
  if (d.details) params.set("details", d.details);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function addMinutes(hm: string, minutes: number): string {
  const [h, m] = hm.split(":").map(Number);
  const t = h * 60 + m + minutes;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}
