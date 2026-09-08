import type { GapItem, GapStatus, HomeArea } from "./types";

// Gap Board (2026-09-08, §4).
//
// An Area Home that only lists Tasks answers "what did I write down", not
// "what is still missing between here and the Outcome". A missing capability,
// an unanswered question, knowledge not yet absorbed, an operation not yet set
// up — those block the Outcome just as hard and never appear on a task list.
//
// WAITING is a first-class column and is never styled as failure: it means
// something outside the user is missing (product info, a reply), and treating
// that as being behind is how the numbers stopped being trusted.

export const GAP_COLUMNS: GapStatus[] = ["DOING", "READY", "WAITING", "BACKLOG", "DONE"];

export const GAP_STATUS_LABEL: Record<GapStatus, string> = {
  BACKLOG: "BACKLOG",
  READY: "READY",
  DOING: "DOING",
  WAITING: "WAITING",
  DONE: "DONE",
};

export const GAP_STATUS_HINT: Record<GapStatus, string> = {
  BACKLOG: "やると決めていない／まだ着手しない",
  READY: "着手できる状態",
  DOING: "いま進めている",
  WAITING: "自分では進められない（外部待ち）",
  DONE: "満たされた",
};

export const GAP_KIND_LABEL: Record<GapItem["kind"], string> = {
  TASK: "実行",
  CAPABILITY: "能力",
  PROBLEM: "課題",
  LEARNING: "知識",
  OPERATION: "運用",
};

export const GAP_OWNER_LABEL: Record<GapItem["owner"], string> = {
  HUMAN: "自分",
  AI: "AI",
  AI_THEN_HUMAN: "AI→自分",
  EXTERNAL: "相手待ち",
};

export function gapsByStatus(items: GapItem[], area: HomeArea): Record<GapStatus, GapItem[]> {
  const out = {
    BACKLOG: [] as GapItem[],
    READY: [] as GapItem[],
    DOING: [] as GapItem[],
    WAITING: [] as GapItem[],
    DONE: [] as GapItem[],
  };
  for (const item of items) {
    if (item.area !== area) continue;
    out[item.status].push(item);
  }
  for (const key of Object.keys(out) as GapStatus[]) {
    out[key].sort((a, b) => a.sortOrder - b.sortOrder);
  }
  return out;
}

/**
 * The one line an Area Control Card shows as "何が足りないか" (§3): whatever
 * is being worked on now, else the next thing that could be started, else
 * what is being waited on. Never a count — a number doesn't say what's missing.
 */
export function mainGap(items: GapItem[], area: HomeArea): GapItem | null {
  const byStatus = gapsByStatus(items, area);
  return byStatus.DOING[0] ?? byStatus.READY[0] ?? byStatus.WAITING[0] ?? byStatus.BACKLOG[0] ?? null;
}
