import { effectiveLifecycle, isTaskBlocked, isTaskDone, type TaskStateOverlays } from "./taskState";
import type { GapItem, GapStatus, HomeArea, Task } from "./types";

// Gap Board (2026-09-08, §4 / 第5ラウンド §30-§33).
//
// A list of Tasks answers "what did I write down", not "what is still missing
// between here and the Outcome". A missing capability, an unanswered question,
// knowledge not yet absorbed, an operation not yet set up — those block the
// Outcome just as hard and never appear on a task list.
//
// 待ち is a first-class column and never styled as failure: it means something
// outside the user is missing (product info, a reply). Treating that as being
// behind is how the numbers stopped being trusted.

// Order is the reading order, not a pipeline: what is moving, then what could
// move, then what cannot, then what is parked, then what is finished.
export const GAP_COLUMNS: GapStatus[] = ["DOING", "READY", "WAITING", "BACKLOG", "DONE"];

/** Columns shown by default on a phone (§31); the rest collapse. */
export const GAP_COLUMNS_PRIMARY: GapStatus[] = ["DOING", "READY", "WAITING"];
export const GAP_COLUMNS_SECONDARY: GapStatus[] = ["BACKLOG", "DONE"];

// §60: Japanese first. "未着手" told the user nothing about whether they could
// start; "次にやれる" does.
export const GAP_STATUS_LABEL: Record<GapStatus, string> = {
  DOING: "進行中",
  READY: "次にやれる",
  WAITING: "待ち",
  BACKLOG: "あとで",
  DONE: "完了",
};

export const GAP_STATUS_HINT: Record<GapStatus, string> = {
  DOING: "いま手をつけている",
  READY: "すぐ着手できる",
  WAITING: "自分では動かせない",
  BACKLOG: "今週はやらない",
  DONE: "満たされた",
};

export const GAP_STATUS_EMPTY: Record<GapStatus, string> = {
  DOING: "いま進めているものはありません",
  READY: "今すぐ着手できるものはありません",
  WAITING: "外部待ちはありません",
  BACKLOG: "あとで回すものはありません",
  DONE: "満たしたものはここに残ります",
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

/**
 * §33: a Gap backed by a real Task takes its status from that Task. Keeping a
 * second hand-maintained status would mean updating the same fact twice and
 * having the board quietly disagree with the tasks.
 */
export function resolveGapStatus(
  item: GapItem,
  tasks: Task[],
  overlays: TaskStateOverlays,
  startedTaskIds: Set<string>
): GapStatus {
  if (!item.taskId) return item.status;
  const task = tasks.find((t) => t.id === item.taskId);
  if (!task) return item.status;
  if (isTaskDone(task, overlays)) return "DONE";
  if (isTaskBlocked(task, overlays)) return "WAITING";
  if (startedTaskIds.has(task.id)) return "DOING";
  const lifecycle = effectiveLifecycle(task, overlays);
  if (lifecycle === "ACTIVE") return "READY";
  if (lifecycle === "BACKLOG") return "BACKLOG";
  return "DONE";
}

export interface ResolvedGap extends GapItem {
  resolvedStatus: GapStatus;
  /** True when the status came from a Task rather than the fixture. */
  fromTask: boolean;
}

export function resolveGaps(
  items: GapItem[],
  area: HomeArea,
  tasks: Task[],
  overlays: TaskStateOverlays,
  startedTaskIds: Set<string>
): ResolvedGap[] {
  return items
    .filter((i) => i.area === area)
    .map((i) => ({
      ...i,
      resolvedStatus: resolveGapStatus(i, tasks, overlays, startedTaskIds),
      fromTask: i.taskId !== null && tasks.some((t) => t.id === i.taskId),
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export function groupGaps(gaps: ResolvedGap[]): Record<GapStatus, ResolvedGap[]> {
  const out: Record<GapStatus, ResolvedGap[]> = {
    BACKLOG: [],
    READY: [],
    DOING: [],
    WAITING: [],
    DONE: [],
  };
  for (const g of gaps) out[g.resolvedStatus].push(g);
  return out;
}

/**
 * The one line an Area Control Card shows as "足りないもの" (§15): whatever is
 * being worked on now, else the next thing that could start, else what is
 * being waited on. Never a count — a number doesn't say what is missing.
 */
export function mainGap(gaps: ResolvedGap[]): ResolvedGap | null {
  const byStatus = groupGaps(gaps);
  return byStatus.DOING[0] ?? byStatus.READY[0] ?? byStatus.WAITING[0] ?? byStatus.BACKLOG[0] ?? null;
}
