import { daysBetween } from "./date";

// "あと○日" for a Milestone/Goal targetDate, computed fresh from today —
// never hardcoded. For a multi-day Milestone, targetDate should already be
// set to its startDate (the countdown basis), not its end date.
export function countdownLabel(targetDate: string, today: string): string {
  const days = daysBetween(today, targetDate);
  if (days < 0) return "終了";
  if (days === 0) return "当日";
  return `あと${days}日`;
}

// Visual intensity tier, deliberately muted — no red/danger color here.
// 3日以内: 強調 / 7日以内: やや強調 / 14・30日以内: 通常 / それ以外: 薄め
export function countdownTone(targetDate: string, today: string): "urgent" | "soon" | "normal" | "far" {
  const days = daysBetween(today, targetDate);
  if (days <= 3) return "urgent";
  if (days <= 7) return "soon";
  if (days <= 30) return "normal";
  return "far";
}

export const countdownToneClass: Record<ReturnType<typeof countdownTone>, string> = {
  urgent: "text-accent-dark",
  soon: "text-accent",
  normal: "text-stone-600",
  far: "text-stone-400",
};
