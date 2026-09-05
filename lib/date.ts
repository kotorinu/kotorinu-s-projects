// Dev/test-only seam (2026-09-06, Day Rollover round): lets a session
// simulate crossing midnight (via browser devtools / javascript_tool)
// without waiting for real midnight. Unset (null) in normal use, where
// todayStr() falls straight through to the real wall-clock date — this
// never ships as a user-facing feature or affects production behavior
// unless explicitly poked from a console.
let clockOverride: string | null = null;

export function __setClockOverrideForTesting(date: string | null) {
  clockOverride = date;
}

export function todayStr(): string {
  return clockOverride ?? toYmd(new Date());
}

// "4時間32分" / "45分" / "3時間" — never invents precision beyond whole
// minutes.
export function formatDurationHm(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}分`;
  if (m === 0) return `${h}時間`;
  return `${h}時間${m}分`;
}

// "HH:mm" for right now, in the browser's local time.
export function nowHm(): string {
  const d = new Date();
  const h = `${d.getHours()}`.padStart(2, "0");
  const m = `${d.getMinutes()}`.padStart(2, "0");
  return `${h}:${m}`;
}

// Whole minutes elapsed from an ISO timestamp to now, minimum 1 — used to
// turn a real 開始→完了 span into actualMinutes (never a fabricated value).
export function minutesSince(startedIso: string): number {
  return Math.max(1, Math.round((Date.now() - new Date(startedIso).getTime()) / 60000));
}

export function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

export function offsetYmd(days: number): string {
  return toYmd(addDays(new Date(), days));
}

// Like offsetYmd, but relative to a given YYYY-MM-DD instead of the real
// current date — needed once "today" can be a Day Rollover's currentDate
// (or a simulated/injected one) rather than always the actual wall clock.
export function addDaysToYmd(ymd: string, days: number): string {
  return toYmd(addDays(new Date(ymd + "T00:00:00"), days));
}

// Sunday that starts the week containing `ymd` (2026-09-06, Week View).
export function startOfWeek(ymd: string): string {
  const d = new Date(ymd + "T00:00:00");
  return addDaysToYmd(ymd, -d.getDay());
}

// The 7 dates of the week starting at `startYmd` (a Sunday, from startOfWeek).
export function weekDates(startYmd: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDaysToYmd(startYmd, i));
}

export function daysBetween(fromYmd: string, toYmdStr: string): number {
  const from = new Date(fromYmd + "T00:00:00");
  const to = new Date(toYmdStr + "T00:00:00");
  return Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

export function formatMd(ymd: string | null): string {
  if (!ymd) return "期限未設定";
  const [, m, d] = ymd.split("-");
  return `${parseInt(m, 10)}/${parseInt(d, 10)}`;
}

export function monthKeyOf(offsetMonths: number): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offsetMonths);
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  return `${y}-${m}`;
}

export function monthLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-");
  return `${y}年${parseInt(m, 10)}月`;
}

export function isSameMonth(ymd: string, monthKey: string): boolean {
  return ymd.startsWith(monthKey);
}

export function daysInMonth(monthKey: string): number {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

export function dayOfMonth(ymd: string): number {
  return parseInt(ymd.split("-")[2], 10);
}
