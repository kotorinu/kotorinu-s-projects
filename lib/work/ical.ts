import type { Task, TimeBlockOverride } from "../types";
import { ymd } from "./model";
const escape = (s: string) => s.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,");
function stamp(date: string, time: string) {
  if (!ymd(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error("予定日時を確認してください");
  return new Date(`${date}T${time}:00+09:00`).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}
function fold(line: string) {
  const lines: string[] = []; let part = "";
  for (const char of line) { if (Buffer.byteLength(part + char) > 73) { lines.push(part); part = " " + char; } else part += char; }
  lines.push(part); return lines.join("\r\n");
}
export function calendarFile(tasks: Task[], blocks: TimeBlockOverride[], now: string) {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//AI Work OS//Task Plan//JA", "CALSCALE:GREGORIAN"];
  for (const b of blocks) {
    const t = tasks.find(t => t.id === b.taskId); if (!t) continue;
    if (b.startTime >= b.endTime) throw new Error("終了時刻を確認してください");
    lines.push("BEGIN:VEVENT", `UID:${escape(b.id)}@work-os`, `DTSTAMP:${new Date(now).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")}`,
      `DTSTART:${stamp(b.date, b.startTime)}`, `DTEND:${stamp(b.date, b.endTime)}`,
      `SUMMARY:${escape(t.title)}`, `DESCRIPTION:${escape(`${t.area}\n${t.description}\nTask ID: ${t.id}`)}`, "END:VEVENT");
  }
  lines.push("END:VCALENDAR"); return lines.map(fold).join("\r\n") + "\r\n";
}
