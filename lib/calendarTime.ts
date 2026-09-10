export const CALENDAR_TIME_ZONE = "Asia/Tokyo";
export const CALENDAR_FRESH_MS = 15 * 60 * 1000;
const DAY = 86400000;
const JST = 9 * 3600000; // Japan has no daylight saving time.

export function validCalendarDate(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(`${date}T00:00:00Z`)) && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date;
}
export function addCalendarDays(date: string, days: number): string {
  if (!validCalendarDate(date)) throw new Error("Calendar日付が不正です");
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
}
export function jstParts(instant: string | number) {
  const ms = typeof instant === "number" ? instant : Date.parse(instant);
  if (!Number.isFinite(ms)) throw new Error("Calendar日時が不正です");
  const local = new Date(ms + JST).toISOString();
  return { date: local.slice(0, 10), time: local.slice(11, 16) };
}
export function calendarWindow(now: number) {
  const today = jstParts(now).date;
  return { coverageStart: addCalendarDays(today, -1), coverageEnd: addCalendarDays(today, 7) };
}
export function calendarBounds(start: string, end: string) {
  if (!validCalendarDate(start) || !validCalendarDate(end) || start > end || Date.parse(end) - Date.parse(start) > 8 * DAY) throw new Error("Calendar取得範囲が不正です");
  return { timeMin: `${start}T00:00:00+09:00`, timeMax: `${addCalendarDays(end, 1)}T00:00:00+09:00` };
}
export function calendarStamp(readAt: string) {
  const p = jstParts(readAt);
  return `${Number(p.date.slice(5, 7))}/${Number(p.date.slice(8, 10))} ${p.time}`;
}
