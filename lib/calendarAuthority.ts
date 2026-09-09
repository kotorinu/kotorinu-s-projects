import { calendarSnapshot, type CalendarSnapshot } from "./calendarSnapshot";
import { effectiveLifecycle, isTaskDone, isTaskDropped, type TaskStateOverlays } from "./taskState";
import type { Task, TimeBlock } from "./types";

// Google Calendar = WHEN の正本 (2026-09-09, §1〜§3).
//
// これまでOSとCalendarは対等で、食い違えば「どちらかを直す」だった。今回から
// 役割を固定する:
//
//   GOAL TREE        WHY / WHERE
//   TASK MAP         WHAT / GAP / いまの状態
//   Google Calendar  WHEN                    ← 時刻はここが正本
//   TODAY            Calendar上の今日を実行する
//
// つまり date / startTime / endTime が食い違ったら、**OSがCalendarへ追従する**。
// 逆向きに直すことはしない。ただし正本が移るのは時刻だけで、
// DoD / Why / Outcome / Gap / Master は引き続きOSが正本。
// これを曖昧にすると、Calendarの短いイベント名がOSの達成基準を上書きしてしまう。

/** 時刻の正本はCalendar。それ以外はOS。UIの文言もここから引く。 */
export const AUTHORITY_NOTE =
  "時刻（日付・開始・終了）はGoogle Calendarが正本です。食い違ったらOS側をCalendarに合わせます。達成基準・目的・Outcome・GapはOSが正本です。";

// --- §2 Task Lifecycle: やると決めたならCalendarに枠がある ---

/**
 * 実行計画に入っているTaskは、必ずCalendarの実行枠を持つ。持っていないものは
 * 「やると決めたのに、いつやるか決まっていない」状態なので、ACTIVEを名乗らせ
 * ずに WAITING_FOR_PLAN として扱う。
 *
 * 状態を新しく保存するのではなく毎回導出する。保存すると、枠を入れた後に
 * 戻し忘れて永遠にWAITINGのままになる。
 */
export type PlanReadiness = "SCHEDULED" | "WAITING_FOR_PLAN" | "NOT_COMMITTED";

export const PLAN_READINESS_LABEL: Record<PlanReadiness, string> = {
  SCHEDULED: "Calendarに枠あり",
  WAITING_FOR_PLAN: "実行枠が未定",
  NOT_COMMITTED: "まだ実行すると決めていない",
};

export interface PlanReadinessResult {
  readiness: PlanReadiness;
  /** Calendarに載っている枠。WAITING_FOR_PLAN のときは空。 */
  scheduledBlocks: TimeBlock[];
  /** OS内にはあるが、Calendarには無い枠。ここが埋まる＝要反映。 */
  osOnlyBlocks: TimeBlock[];
}

export function planReadiness(
  task: Task,
  planBlocks: TimeBlock[],
  overlays: TaskStateOverlays
): PlanReadinessResult {
  const blocks = planBlocks.filter((b) => b.taskId === task.id && b.lifecycle === "ACTIVE");
  const scheduledBlocks = blocks.filter((b) => b.calendarEventId !== null);
  const osOnlyBlocks = blocks.filter((b) => b.calendarEventId === null);

  if (effectiveLifecycle(task, overlays) !== "ACTIVE") {
    return { readiness: "NOT_COMMITTED", scheduledBlocks, osOnlyBlocks };
  }
  // 完了・中止したものは、もう枠が要るかを問わない。
  if (isTaskDone(task, overlays) || isTaskDropped(task, overlays)) {
    return { readiness: "SCHEDULED", scheduledBlocks, osOnlyBlocks };
  }
  return {
    readiness: scheduledBlocks.length > 0 ? "SCHEDULED" : "WAITING_FOR_PLAN",
    scheduledBlocks,
    osOnlyBlocks,
  };
}

/** 「やると決めたのにCalendarに無い」Task。ここが0であることが目標 (§2)。 */
export function tasksWaitingForPlan(
  tasks: Task[],
  planBlocks: TimeBlock[],
  overlays: TaskStateOverlays
): Task[] {
  return tasks.filter((t) => planReadiness(t, planBlocks, overlays).readiness === "WAITING_FOR_PLAN");
}

// --- §3 時刻はCalendarへ追従する ---

export interface TimeDrift {
  blockId: string;
  taskId: string | null;
  label: string;
  /** OSが持っている時刻。 */
  os: { date: string; startTime: string; endTime: string };
  /** Calendarが持っている時刻＝正しい方。 */
  calendar: { date: string; startTime: string; endTime: string };
}

/**
 * OSとCalendarで時刻が食い違っている枠。返り値の `calendar` 側が採用すべき値。
 * 照合範囲の外は対象にしない——読んでいないものについて「ズレている」とは
 * 言えない。
 */
export function timeDrifts(
  planBlocks: TimeBlock[],
  snapshot: CalendarSnapshot = calendarSnapshot
): TimeDrift[] {
  const byId = new Map(snapshot.events.map((e) => [e.id, e]));
  const out: TimeDrift[] = [];
  for (const b of planBlocks) {
    if (b.lifecycle !== "ACTIVE" || b.calendarEventId === null) continue;
    const ev = byId.get(b.calendarEventId);
    if (!ev || ev.startTime === null || ev.endTime === null) continue;
    if (b.date === ev.date && b.startTime === ev.startTime && b.endTime === ev.endTime) continue;
    out.push({
      blockId: b.id,
      taskId: b.taskId,
      label: b.label,
      os: { date: b.date, startTime: b.startTime, endTime: b.endTime },
      calendar: { date: ev.date, startTime: ev.startTime, endTime: ev.endTime },
    });
  }
  return out;
}

// --- §5 Live Replan: 実際の順番へCalendarを合わせる ---

export interface ReorderInput {
  /** その日の実行枠を、Calendar上の順に。 */
  blocks: TimeBlock[];
  /** 実際に先に始めたTaskのid。 */
  startedTaskId: string;
  /** 実際の開始時刻 "HH:mm"。 */
  actualStart: string;
  /** 実際に使った分数。まだ終わっていないなら、その枠の予定分数を使う。 */
  actualMinutes: number;
}

export interface ReplanSlot {
  blockId: string;
  label: string;
  /** 変更前。 */
  from: { startTime: string; endTime: string };
  /** 変更後。Calendarへ反映すべき値。 */
  to: { startTime: string; endTime: string };
  changed: boolean;
  /**
   * 詰め直した結果、その日の元の終了時刻より後ろへはみ出した。所要時間を
   * 変えない以上これは起こりうるし、起きたなら「今日はもう入り切らない」と
   * いう事実なので、黙って通さず呼び出し側へ渡す。
   */
  overruns: boolean;
}

function toMinutes(hm: string): number {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
}

function toHm(total: number): string {
  const capped = Math.max(0, Math.min(24 * 60 - 1, total));
  return `${String(Math.floor(capped / 60)).padStart(2, "0")}:${String(capped % 60).padStart(2, "0")}`;
}

function blockMinutes(b: Pick<TimeBlock, "startTime" | "endTime">): number {
  return toMinutes(b.endTime) - toMinutes(b.startTime);
}

/**
 * 予定と違う順番で実行したときに、Calendarをどう直せば現実に合うかを計算する
 * (§5)。
 *
 *   予定  19:00 Sales / 21:30 RIALA
 *   実際  19:00-19:30 RIALA を先にやった
 *   結果  19:00-19:30 RIALA、19:30-21:30 Sales
 *
 * 元の予定を「やったことになっている」まま残さないのが目的。所要時間は動かさ
 * ず、順番と開始時刻だけを詰め直す——長さまで勝手に変えると、次にどれだけ
 * かかるかの見積もりが壊れる。
 */
export function liveReplan(input: ReorderInput): ReplanSlot[] {
  const ordered = [...input.blocks].sort((a, b) => (a.startTime < b.startTime ? -1 : 1));
  const moved = ordered.find((b) => b.taskId === input.startedTaskId);
  if (!moved) return [];

  // 実際に始めたものを先頭へ、残りは元の順のまま後ろへ。
  const rest = ordered.filter((b) => b.id !== moved.id && b.startTime >= input.actualStart);
  const untouched = ordered.filter((b) => b.id !== moved.id && b.startTime < input.actualStart);

  // その日の元の終わり。ここを越えたらはみ出しとして印をつける。
  const plannedEnd = [moved, ...rest].reduce((latest, b) => (b.endTime > latest ? b.endTime : latest), "00:00");

  const slots: ReplanSlot[] = untouched.map((b) => ({
    blockId: b.id,
    label: b.label,
    from: { startTime: b.startTime, endTime: b.endTime },
    to: { startTime: b.startTime, endTime: b.endTime },
    changed: false,
    overruns: false,
  }));

  let cursor = toMinutes(input.actualStart);
  const sequence = [{ block: moved, minutes: input.actualMinutes }, ...rest.map((b) => ({ block: b, minutes: blockMinutes(b) }))];

  for (const { block, minutes } of sequence) {
    const start = toHm(cursor);
    const end = toHm(cursor + minutes);
    slots.push({
      blockId: block.id,
      label: block.label,
      from: { startTime: block.startTime, endTime: block.endTime },
      to: { startTime: start, endTime: end },
      changed: block.startTime !== start || block.endTime !== end,
      overruns: end > plannedEnd,
    });
    cursor += minutes;
  }

  return slots;
}

/** 反映が要るものだけ。0件なら現実とCalendarが一致している。 */
export function replanChanges(slots: ReplanSlot[]): ReplanSlot[] {
  return slots.filter((s) => s.changed);
}

/** 詰め直した結果、今日の予定に入り切らなくなったかどうか。 */
export function replanOverruns(slots: ReplanSlot[]): boolean {
  return slots.some((s) => s.overruns);
}
