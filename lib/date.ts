export function todayStr(): string {
  return toYmd(new Date());
}

// "HH:mm" for right now, in the browser's local time.
export function nowHm(): string {
  const d = new Date();
  const h = `${d.getHours()}`.padStart(2, "0");
  const m = `${d.getMinutes()}`.padStart(2, "0");
  return `${h}:${m}`;
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
