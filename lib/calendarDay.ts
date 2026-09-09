import { ACTIVITY_THEME, AREA_THEME, type Theme } from "./areaTheme";
import type { CalendarEventDTO } from "./calendarProvider";
import type { TimelineStatus } from "./timeline";
import type { Task, TimeBlock } from "./types";

// TODAY を Google Calendar から組み立てる (2026-09-09, §1〜§9).
//
// これまで TODAY は「OSに登録したTaskを並べる画面」だった。だからCalendarに
// あってOSに無い予定——営業実践クラス、面談、契約手続き——は表示されず、
// 本人はCalendarとTODAYを two windows で見比べる必要があった。
//
// 今回、順番を逆にする:
//
//   第一Source  = Google Calendar（WHEN）
//   その上に    = OSのTask（WHAT / WHY / DoD）を重ねる
//
// つまり「OSにTaskが無いから出さない」は禁止。Calendarに予定があるなら、
// TODAYに出る。

// §7: Calendarの予定には4種類あり、**どれも正常**。
// CALENDAR_ONLY を「Taskが欠けている」と扱わない——営業実践クラスは参加予定
// であって、独立したTaskではない。
export type DayEntryRole =
  /** OS Taskと紐づく予定。DoD/Why/Outcomeを重ねて出す。 */
  | "LINKED_TASK"
  /** Calendarにだけある予定。偽Taskを作らない。 */
  | "CALENDAR_ONLY"
  /** OSは枠として知っているが、Taskではない（休憩・移動・定型ブロック）。 */
  | "UNLINKED_EXECUTION"
  /** 終日の締切。時間割へ入れず、TODAY DEADLINESへ出す (§9)。 */
  | "ALL_DAY_DEADLINE"
  /**
   * OS側だけにある実行枠。Calendarへまだ反映していない。
   * §7の4分類には無いが、落とすと「移動した直後のTaskが消える」ので出す。
   * Calendarが正本である以上これは未反映であって、正常ではない。
   */
  | "OS_PENDING_CALENDAR";

export const ROLE_LABEL: Record<DayEntryRole, string> = {
  LINKED_TASK: "Task",
  CALENDAR_ONLY: "予定",
  UNLINKED_EXECUTION: "枠",
  ALL_DAY_DEADLINE: "締切",
  OS_PENDING_CALENDAR: "Calendar未反映",
};

export interface DayEntry {
  /** Calendar由来なら event id、OS側だけなら block id。 */
  key: string;
  role: DayEntryRole;
  title: string;
  /** WHEN。Calendarにある予定はCalendarの時刻（§17）。 */
  startTime: string | null;
  endTime: string | null;
  status: TimelineStatus;
  /** 紐づくOS Task。CALENDAR_ONLY では null。 */
  task: Task | null;
  /** 紐づくOSの実行枠。CALENDAR_ONLY では null。 */
  timeBlock: TimeBlock | null;
  /** Calendarの色。表示テーマの正本 (§5)。 */
  colorId: string | null;
  /** Calendarの説明。DoDではない (§4)。 */
  description: string | null;
  /**
   * OSの時刻とCalendarの時刻が食い違っていた場合の、OS側の値。
   * 採用したのはCalendarの方 (§17)。何が変わったかを言えるように残す。
   */
  osTimeWas: { startTime: string; endTime: string } | null;
}

// §5: 色はCalendarのcolorIdが正本。既存の色規則をそのまま逆引きする。
const COLOR_TO_THEME: Record<string, Theme> = {
  "9": AREA_THEME["営業代行"],
  "10": AREA_THEME.RIALA,
  "3": AREA_THEME.GENESIS,
  "5": ACTIVITY_THEME.READING,
  "7": ACTIVITY_THEME.OS,
  "8": ACTIVITY_THEME.PLANNING,
};

/** Calendar colorId → 表示テーマ。未知のIDは色を主張しない。 */
export function themeForCalendarColorId(colorId: string | null): Theme | null {
  if (colorId === null) return null;
  return COLOR_TO_THEME[colorId] ?? null;
}

function classify(startTime: string | null, endTime: string | null, nowHm: string): TimelineStatus {
  if (startTime === null || endTime === null) return "LATER";
  if (endTime <= nowHm) return "PAST";
  if (startTime <= nowHm) return "NOW";
  return "LATER";
}

export interface BuildDayInput {
  date: string;
  /** その日のCalendarイベント。WHENの正本。 */
  events: CalendarEventDTO[];
  /** OSのライブな実行枠。Calendarに載っていないものも含む。 */
  planBlocks: TimeBlock[];
  tasks: Task[];
  nowHm: string;
  /** 実際に開始したTask。時刻に関係なくNOWを取る（Early Start）。 */
  startedTaskId?: string | null;
}

export interface CalendarDay {
  /** 時間割。時刻順。 */
  timed: DayEntry[];
  /** 終日の締切など。時間割へ入れない (§9)。 */
  deadlines: DayEntry[];
}

/**
 * その日の実行予定を、Calendarを土台に組み立てる。
 *
 * 1. Calendarの予定を全部入れる（Taskの有無に関係なく — §2）
 * 2. eventIdでOSの枠とTaskを重ねる（§8）
 * 3. Calendarに無いOSの枠も、未反映として残す
 */
export function buildCalendarDay({
  date,
  events,
  planBlocks,
  tasks,
  nowHm,
  startedTaskId = null,
}: BuildDayInput): CalendarDay {
  const dayBlocks = planBlocks.filter((b) => b.date === date && b.lifecycle === "ACTIVE");
  const blockByEventId = new Map<string, TimeBlock>();
  for (const b of dayBlocks) {
    if (b.calendarEventId !== null) blockByEventId.set(b.calendarEventId, b);
  }
  const claimedBlockIds = new Set<string>();

  const timed: DayEntry[] = [];
  const deadlines: DayEntry[] = [];

  for (const ev of events) {
    if (ev.date !== date) continue;

    if (ev.allDay) {
      deadlines.push({
        key: ev.id,
        role: "ALL_DAY_DEADLINE",
        title: ev.summary,
        startTime: null,
        endTime: null,
        status: "LATER",
        task: null,
        timeBlock: null,
        colorId: ev.colorId,
        description: ev.description,
        osTimeWas: null,
      });
      continue;
    }

    const block = blockByEventId.get(ev.id) ?? null;
    if (block) claimedBlockIds.add(block.id);
    const task = block?.taskId ? tasks.find((t) => t.id === block.taskId) ?? null : null;

    // §17: 時刻はCalendarを採用。OSが違う値を持っていたら、それは記録として残す。
    const drifted =
      block !== null && (block.startTime !== ev.startTime || block.endTime !== ev.endTime)
        ? { startTime: block.startTime, endTime: block.endTime }
        : null;

    timed.push({
      key: ev.id,
      role: task !== null ? "LINKED_TASK" : block !== null ? "UNLINKED_EXECUTION" : "CALENDAR_ONLY",
      // タイトルはOS側があればそちら。Calendarのサマリは装飾が多く、
      // 何をするTaskなのかはOSの方が正確に持っている。
      title: task?.title ?? block?.label ?? ev.summary,
      startTime: ev.startTime,
      endTime: ev.endTime,
      status: classify(ev.startTime, ev.endTime, nowHm),
      task,
      timeBlock: block,
      colorId: ev.colorId,
      description: ev.description,
      osTimeWas: drifted,
    });
  }

  // Calendarに載っていないOSの枠。移動した直後などにここへ来る。
  for (const b of dayBlocks) {
    if (claimedBlockIds.has(b.id)) continue;
    if (b.calendarEventId !== null) continue; // 範囲外イベント: 別途再照合で扱う
    const task = b.taskId ? tasks.find((t) => t.id === b.taskId) ?? null : null;
    timed.push({
      key: b.id,
      role: "OS_PENDING_CALENDAR",
      title: task?.title ?? b.label,
      startTime: b.startTime,
      endTime: b.endTime,
      status: classify(b.startTime, b.endTime, nowHm),
      task,
      timeBlock: b,
      colorId: null,
      description: null,
      osTimeWas: null,
    });
  }

  timed.sort((a, b) => ((a.startTime ?? "") < (b.startTime ?? "") ? -1 : 1));

  // Early Start: 実際に始めたTaskがNOW。時刻ベースのNOWは1つに絞る。
  if (startedTaskId !== null) {
    let assigned = false;
    for (const e of timed) {
      if (e.task?.id === startedTaskId) {
        e.status = "NOW";
        assigned = true;
      } else if (e.status === "NOW") {
        e.status = e.endTime !== null && e.endTime <= nowHm ? "PAST" : "LATER";
      }
    }
    if (!assigned) {
      // 今日の枠に無いTaskを開始した場合。呼び出し側がpinned cardで扱う。
      for (const e of timed) {
        if (e.status === "NOW") e.status = e.endTime !== null && e.endTime <= nowHm ? "PAST" : "LATER";
      }
    }
  }

  // NEXT = 時計の上で次に始まるもの。NOWの「次の行」ではない。
  const next = timed.find((e) => e.status !== "NOW" && e.startTime !== null && e.startTime > nowHm);
  if (next) next.status = "NEXT";

  return { timed, deadlines };
}

/** Calendarにある予定のうち、OSがTaskとして持っているものの数。 */
export function dayCoverage(day: CalendarDay): { linked: number; calendarOnly: number; total: number } {
  const linked = day.timed.filter((e) => e.role === "LINKED_TASK").length;
  const calendarOnly = day.timed.filter((e) => e.role === "CALENDAR_ONLY").length;
  return { linked, calendarOnly, total: day.timed.length };
}
