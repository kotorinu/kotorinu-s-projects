import type { CatalogItem } from "./model";
import { evidenceValid, safeUrl } from "./planner";

// Browser-run test planning. This module never sends or publishes anything.
export interface ConfirmedPublication { key: string; externalId: string; confirmedAt: string }
export interface ReminderCandidate { key: string; eventId: string; stage: 7 | 3; channel: "POST_DRAFT"; draft: string }
const day = (value: string) => {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) throw new Error("Invalid observation date");
  return Math.floor((time + 9 * 3600000) / 86400000);
};
export function eventReminderCandidates(events: CatalogItem[], now: string, history: ConfirmedPublication[]): ReminderCandidate[] {
  const today = day(now);
  const confirmed = new Set(history.filter(h => h.externalId.trim() && Number.isFinite(Date.parse(h.confirmedAt))).map(h => h.key));
  return events.flatMap(event => {
    if (!event.startsAt || !Number.isFinite(Date.parse(event.startsAt)) || Date.parse(event.startsAt) <= Date.parse(now) || !safeUrl(event.url) || !evidenceValid(event.evidence)) return [];
    const remaining = day(event.startsAt) - today;
    // Catch up a missed seven-day announcement only until the three-day stage.
    // Do not burst both reminders when the PC resumes after several days.
    const stage = remaining > 3 && remaining <= 7 ? 7 : remaining >= 1 && remaining <= 3 ? 3 : null;
    if (!stage) return [];
    const key = `EVENT_POST:${event.id}:${event.startsAt}:${stage}`;
    if (confirmed.has(key)) return [];
    return [{ key, eventId: event.id, stage, channel: "POST_DRAFT" as const,
      draft: `RIALAイベントのお知らせ\n\n${event.title}\n開催日時：${event.startsAt}\n${event.summary}\n${event.url}\n\n気になる方は詳細を見てみてください。参加できる範囲で、一緒に楽しみましょう！` }];
  });
}
export function welcomeTemplate(name: string): string {
  if (!name.trim() || name.length > 100 || /[\r\n]/.test(name)) throw new Error("Member name requires review");
  return `${name.trim()}さん、RIALAへのご入会ありがとうございます！\n\nこれから一緒に学んだり、交流したりできるのを楽しみにしています。まずは気になる投稿やコンテンツを、無理のないペースでのぞいてみてください。\n\n分からないことがあれば、お気軽に声をかけてくださいね。よろしくお願いします！`;
}
