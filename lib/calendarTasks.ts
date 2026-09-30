import type { CalendarEventDTO } from "./calendarProvider";
import type { Area } from "./types";

// Google Calendarの予定からタスクを作る (2026-10-01)。
//
// 計画はCalendarで立てている。アプリのタスクはその予定を「完了条件つきの作業」と
// して記録するためのもので、同じ内容を二度入力させない。予定の説明にある
// 「完了条件：」をそのまま完了条件にし、色から領域を決める。元の予定IDを持たせ、
// 同じ予定を二重に取り込まない。
//
// 毎日の定型枠（日報・昼のCatch-up・朝の深思考・RIALAの21:30確認）は、カレンダーの
// ○△×で振り返るもので、タスクにする必要は薄い。最初から選択しない。

const ROUTINE = /日報|Catch-up|深思考|【RIALA】21:30|睡眠|休憩|予定なし/;

const AREA_BY_COLOR: Record<string, Area> = { "9": "営業代行", "10": "RIALA", "3": "GENESIS" };
/** 色で決まらないとき（ロープレの赤など）は予定名で決める。 */
function areaOf(e: CalendarEventDTO): Area {
  const byColor = AREA_BY_COLOR[e.colorId ?? ""]; if (byColor) return byColor;
  if (/営業|ロープレ|商談/.test(e.summary)) return "営業代行";
  if (/RIALA/.test(e.summary)) return "RIALA";
  if (/GENESIS|合宿/.test(e.summary)) return "GENESIS";
  return "その他";
}

export function stripHtml(text: string): string {
  return text.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>\s*<p>/gi, "\n\n").replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
}

/** 説明から「完了条件：〜」を取り出す。「／」で区切られていれば別々の条件にする。 */
export function completionCriteria(description: string | null): string[] {
  if (!description) return [];
  const found: string[] = [];
  for (const line of stripHtml(description).split("\n")) {
    const m = /完了条件\s*[：:]\s*(.+)/.exec(line);
    if (m) found.push(...m[1].split("／").map(x => x.trim()).filter(Boolean));
  }
  return found.slice(0, 20);
}

function minutes(hm: string) { const [h, m] = hm.split(":").map(Number); return h * 60 + m; }

export interface CalendarTaskDraft {
  event: CalendarEventDTO;
  title: string;
  area: Area;
  definitionOfDone: string[];
  estimateMinutes: number | null;
  /** 最初から選択しておくか。完了条件があり、定型枠ではないもの。 */
  suggested: boolean;
}

export function calendarTaskDrafts(events: CalendarEventDTO[], existingTags: Set<string>, today: string): CalendarTaskDraft[] {
  return events
    .filter(e => !e.allDay && e.startTime && e.endTime && e.date >= today && !existingTags.has(`calendar:${e.id}`))
    .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime))
    .map(e => {
      const dod = completionCriteria(e.description);
      const span = minutes(e.endTime!) - minutes(e.startTime!);
      return { event: e, title: e.summary.slice(0, 200), area: areaOf(e), definitionOfDone: dod,
        estimateMinutes: span > 0 ? span : null, suggested: dod.length > 0 && !ROUTINE.test(e.summary) };
    });
}

/** Work APIへ送る createTask の中身。 */
export function createTaskBody(d: CalendarTaskDraft, goalId: string | null): Record<string, unknown> {
  return { command: "createTask", title: d.title, area: d.area, description: stripHtml(d.event.description ?? "").slice(0, 6000),
    definitionOfDone: d.definitionOfDone.length ? d.definitionOfDone : [`${d.event.startTime}-${d.event.endTime} の予定を実行した`],
    deadline: d.event.date, workDate: d.event.date, estimateMinutes: d.estimateMinutes, calendarEventId: d.event.id, goalId, aiCapability: "HUMAN" };
}

/** まとめて完了の候補から、最初は外しておくもの（本人が「まだできていない」と言った読書）。 */
export const KEEP_OPEN_BY_DEFAULT = /地頭力|鬼速PDCA/;
