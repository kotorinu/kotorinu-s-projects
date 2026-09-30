import type { CalendarEventDTO } from "./calendarProvider";
import type { CalendarDayReview } from "./calendarReview";
import type { GoalReview } from "./goalReview";
import { areaOf } from "./calendarTasks";
import { addCalendarDays } from "./calendarTime";
import { addMinutes, type CalendarDraft } from "./googleCalendarLink";
import type { Area, Goal, Task } from "./types";

// PDCAが回っているかの点検 (2026-10-01)。
//
// 9月の1か月目標が届かなかった構造を、Calendar と記録から機械的に確かめる:
//
//   P  目標があるか／目標にタスクがあるか／大事な領域に今後7日の時間が入っているか
//      週の計画・月末の振り返りの時間がCalendarにあるか
//   D  Calendarどおりに動けたか（夜の○△×の記録）
//   C  振り返りを付けた日数
//   A  「明日ひとつ変えること」を書いた日数
//
// 実データ（2026-10-01読取）では、10/9以降に営業代行の枠が0時間、週の計画・月末の
// 振り返りの枠も無かった。これは「頑張りが足りない」ではなく「時間の裏付けが無い」
// という計画側の欠陥で、アプリが毎週指摘できる。
//
// 判断材料が読めていないものは「未確認」とし、問題なしとは言わない。

export type RhythmStatus = "OK" | "WARN" | "MISSING" | "UNKNOWN";
export type RhythmStage = "P" | "D" | "C" | "A";

export interface RhythmCheck {
  id: string;
  stage: RhythmStage;
  label: string;
  status: RhythmStatus;
  detail: string;
  /** 次にやること。 */
  action: string;
  /** Calendarへ入れる案（空き時間から選んだもの）。 */
  draft?: CalendarDraft & { verified: boolean };
  /** アプリ内で直す場所。 */
  href?: string;
}

const WEEKLY_PLAN = /(週次|週の|今週の|来週の)(計画|振り返り|レビュー|見直し)|週次レビュー|Weekly/;
const MONTHLY_REVIEW = /(月次|月の|月末|今月の|来月の)(振り返り|レビュー|計画|見直し)|目標の再設計|月間レビュー/;
const NIGHTLY = /日報|実行OS|振り返り|翌日Calendar/;
const FOCUS_AREAS: Area[] = ["営業代行", "RIALA", "GENESIS"];

function minutes(hm: string) { const [h, m] = hm.split(":").map(Number); return h * 60 + m; }
function duration(e: CalendarEventDTO) { return e.startTime && e.endTime ? Math.max(0, minutes(e.endTime) - minutes(e.startTime)) : 0; }
function md(date: string) { return Number(date.slice(5, 7)) + "/" + Number(date.slice(8, 10)); }
function hours(min: number) { return min % 60 ? (min / 60).toFixed(1) : String(min / 60); }
function weekday(date: string) { return new Date(`${date}T00:00:00Z`).getUTCDay(); }
function lastDayOfMonth(date: string) {
  const [y, m] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/**
 * Calendarの空きから、候補の時刻で最初に空いている枠を選ぶ。
 * 読めていない日（coverageの外）は選ばない。
 */
export function findFreeSlot(events: CalendarEventDTO[], from: string, to: string, lengthMin: number,
  starts: { weekday: string[]; weekend: string[] }): CalendarDraft | null {
  for (let date = from; date <= to; date = addCalendarDays(date, 1)) {
    const day = events.filter(e => e.date === date && !e.allDay && e.startTime && e.endTime);
    const blocked = events.some(e => e.date === date && e.allDay && !/締切|期限|保留|メモ/.test(e.summary));
    if (blocked) continue; // 合宿・旅行などの終日予定の日は避ける
    const wd = weekday(date); const list = wd === 0 || wd === 6 ? starts.weekend : starts.weekday;
    for (const start of list) {
      const s = minutes(start), e = s + lengthMin;
      if (e > 24 * 60) continue;
      if (day.every(x => minutes(x.endTime!) <= s || minutes(x.startTime!) >= e)) return { title: "", date, start, end: addMinutes(start, lengthMin) };
    }
  }
  return null;
}

export interface RhythmInput {
  today: string;
  /** 今日〜読めた範囲の予定。 */
  events: CalendarEventDTO[];
  coverageEnd: string;
  calendarRead: boolean;
  goals: Goal[];
  tasks: Task[];
  openTaskIds: Set<string>;
  calendarReviews: Record<string, CalendarDayReview>;
  goalReviews: Record<string, GoalReview>;
}

export function pdcaRhythm(input: RhythmInput): RhythmCheck[] {
  const { today, coverageEnd, calendarRead, goals, tasks, openTaskIds, calendarReviews, goalReviews } = input;
  const weekEnd = addCalendarDays(today, 6) < coverageEnd ? addCalendarDays(today, 6) : coverageEnd;
  const events = input.events.filter(e => e.date >= today && e.date <= weekEnd);
  const timed = events.filter(e => !e.allDay && e.startTime && e.endTime);
  const checks: RhythmCheck[] = [];
  const evening = { weekday: ["20:00", "19:00", "21:00", "07:00"], weekend: ["09:00", "13:00", "16:00", "19:00"] };

  // P1: 今月の目標があるか
  const monthly = goals.filter(g => g.horizon === "1M" && g.status === "進行中");
  const current = monthly.filter(g => g.targetDate && g.targetDate >= today).sort((a, b) => a.targetDate!.localeCompare(b.targetDate!))[0];
  const expired = monthly.filter(g => g.targetDate && g.targetDate < today && goalReviews[g.id]?.targetDate !== g.targetDate);
  if (current) checks.push({ id: "goal", stage: "P", label: "今月の目標", status: "OK", detail: `「${current.title}」（${md(current.targetDate!)}まで）`, action: "達成基準を毎朝ひとつ読むだけで十分です。", href: "/goals?focus=" + encodeURIComponent(current.id) });
  else checks.push({ id: "goal", stage: "P", label: "今月の目標", status: "MISSING",
    detail: expired.length ? `期限が過ぎた1か月目標が振り返られていません（${expired.map(g => md(g.targetDate!)).join("・")}）` : "期限が今日以降の1か月目標がありません",
    action: expired.length ? "期限の振り返りを記録してから、「次の1か月の目標を作る」を押してください。" : "目標画面で1か月目標を作ってください（達成基準は3つまで）。",
    href: expired.length ? "/goals?focus=" + encodeURIComponent(expired[0].id) : "/goals" });

  // P2: 目標にタスクがあるか
  if (current) {
    const linked = tasks.filter(t => t.goalId === current.id && openTaskIds.has(t.id));
    const scheduled = linked.filter(t => (t.contextTags ?? []).some(x => x.startsWith("calendar:")) || (t.workDate && t.workDate >= today));
    checks.push({ id: "goal-tasks", stage: "P", label: "目標→タスク→Calendar", status: linked.length === 0 ? "MISSING" : scheduled.length === 0 ? "WARN" : "OK",
      detail: linked.length === 0 ? "今月の目標につながる未完了タスクがありません" : `目標につながるタスク ${linked.length}件のうち、日時が決まっているのは ${scheduled.length}件`,
      action: linked.length === 0 ? "目標画面の「この目標のタスクを追加」で、達成基準ごとに1つずつ洗い出してください。" : "日時が決まっていないタスクは、タスク詳細の「Google カレンダーに入れる」で枠を取ってください。",
      href: linked.length === 0 ? "/goals?focus=" + encodeURIComponent(current.id) : "/tasks" });
  }

  // P3: 大事な領域に今後7日の時間があるか
  if (!calendarRead) checks.push({ id: "areas", stage: "P", label: "今後7日の時間配分", status: "UNKNOWN", detail: "Calendarを読めていないため確認できません", action: "TODAYの「予定を再確認」を押してください。", href: "/today" });
  else {
    const byArea = new Map<Area, number>();
    for (const e of timed) byArea.set(areaOf(e), (byArea.get(areaOf(e)) ?? 0) + duration(e));
    const active = FOCUS_AREAS.filter(a => goals.some(g => g.horizon === "AREA" && g.status === "進行中" && g.title.includes(a)));
    const zero = active.filter(a => !byArea.get(a));
    const summary = FOCUS_AREAS.map(a => `${a} ${hours(byArea.get(a) ?? 0)}時間`).join(" / ");
    const slot = zero.length ? findFreeSlot(input.events, today, weekEnd, 60, evening) : null;
    checks.push({ id: "areas", stage: "P", label: "今後7日の時間配分", status: zero.length ? "WARN" : "OK",
      detail: `${md(today)}〜${md(weekEnd)}: ${summary}`,
      action: zero.length ? `進行中の「${zero.join("・")}」に時間が入っていません。目標があっても時間が無いと進みません。まず1枠入れてください。` : "大事な領域すべてに時間が入っています。",
      draft: slot ? { ...slot, title: `【${zero[0]}】（内容を決める）`, details: "完了条件：（この枠で何ができたら終わりか）", verified: true } : undefined });
  }

  // P4: 週の計画の時間
  if (!calendarRead) checks.push({ id: "weekly", stage: "P", label: "週の計画の時間", status: "UNKNOWN", detail: "Calendarを読めていません", action: "TODAYの「予定を再確認」を押してください。" });
  else {
    const plan = timed.find(e => WEEKLY_PLAN.test(e.summary) && !/AI Work OS/.test(e.summary));
    const slot = plan ? null : findFreeSlot(input.events, today, weekEnd, 60, { weekday: ["20:00", "21:00"], weekend: ["09:00", "10:00", "19:00"] });
    checks.push({ id: "weekly", stage: "P", label: "週の計画の時間（60分）", status: plan ? "OK" : "MISSING",
      detail: plan ? `${md(plan.date)} ${plan.startTime} ${plan.summary}` : "今後7日に「週の計画・振り返り」の枠がありません",
      action: plan ? "この枠で、目標のタスクを来週のCalendarへ入れます。" : "週に1回60分、目標を見て来週の予定を入れる時間を取ってください。これが無いと、毎晩の見直しだけでは週単位のずれを直せません。",
      draft: slot ? { ...slot, title: "【週次】今週の振り返り→来週の計画をCalendarへ", details: "1. 今週の○△×と「明日ひとつ変えること」を読む\n2. 今月の目標の達成基準を読む\n3. 来週の予定に、基準ごとの時間を入れる\n完了条件：来週のCalendarに、目標の各領域の枠が入っている", verified: true } : undefined });
  }

  // P5: 月末の振り返りの時間（3時間）
  const monthEnd = lastDayOfMonth(today);
  const nextStart = addCalendarDays(monthEnd, 1);
  const windowFrom = addCalendarDays(monthEnd, -3), windowTo = addCalendarDays(nextStart, 3);
  const readable = calendarRead && windowFrom <= coverageEnd;
  const review = input.events.find(e => e.date >= windowFrom && e.date <= windowTo && MONTHLY_REVIEW.test(e.summary) && duration(e) >= 120);
  const monthlyDraft = { title: `【月次】${Number(today.slice(5, 7))}月の振り返り→来月の目標を再設計（3時間）`, date: "", start: "09:00", end: "12:00",
    details: "1. 今月の目標の達成基準を1つずつ判定（事実・理由）\n2. できなかった理由を「時間が無かった／やり方が悪かった／目標が合っていなかった」に分ける\n3. 来月の目標（基準3つまで）を作る\n4. 基準ごとのタスクを洗い出し、最初の1週間をCalendarへ\n完了条件：来月の目標とタスクがアプリに入り、最初の週の枠がCalendarにある" };
  if (review) checks.push({ id: "monthly", stage: "P", label: "月末の振り返りの時間（3時間）", status: "OK", detail: `${md(review.date)} ${review.startTime} ${review.summary}`, action: "この時間で、目標画面の期限の振り返り→次の目標を作ります。" });
  else if (readable) {
    const slot = findFreeSlot(input.events, windowFrom < today ? today : windowFrom, windowTo < coverageEnd ? windowTo : coverageEnd, 180, { weekday: ["19:00"], weekend: ["09:00", "13:00"] });
    checks.push({ id: "monthly", stage: "P", label: "月末の振り返りの時間（3時間）", status: "MISSING", detail: `月末（${md(monthEnd)}）前後に3時間の振り返り枠がありません`, action: "月末に3時間取り、振り返り→来月の目標→最初の週の予定まで一気に決めてください。", draft: slot ? { ...monthlyDraft, ...slot, title: monthlyDraft.title, verified: true } : undefined });
  } else {
    // まだ先の月末。直前の土曜を案にするが、空きはまだ読めないので未確認と明示する。
    let sat = monthEnd; while (weekday(sat) !== 6) sat = addCalendarDays(sat, -1);
    checks.push({ id: "monthly", stage: "P", label: "月末の振り返りの時間（3時間）", status: "UNKNOWN", detail: `月末（${md(monthEnd)}）はCalendarの読取範囲の外なので、枠があるか確認できません`, action: `先に入れておくのがおすすめです。案: ${md(sat)}（土）9:00〜12:00（空きは未確認）`, draft: { ...monthlyDraft, date: sat, verified: false } });
  }

  // P6: 毎晩の見直しの枠
  if (calendarRead) {
    const nights = new Set(timed.filter(e => NIGHTLY.test(e.summary)).map(e => e.date)).size;
    const days = Math.round((Date.parse(weekEnd) - Date.parse(today)) / 86400000) + 1;
    checks.push({ id: "nightly", stage: "P", label: "毎晩の見直しの枠", status: nights >= Math.min(5, days) ? "OK" : "WARN", detail: `今後${days}日のうち ${nights}日に日報・見直しの枠があります`, action: nights >= Math.min(5, days) ? "この枠で、振り返り画面の○△×を付けます。" : "夜の見直し（15〜30分）を毎日の同じ時刻に固定してください。" });
  }

  // D/C: 過去7日に○△×を付けた日
  const from = addCalendarDays(today, -7);
  const recent = Object.values(calendarReviews).filter(r => r.date >= from && r.date < today);
  const marked = recent.filter(r => Object.keys(r.blocks).length > 0);
  const blocks = marked.flatMap(r => Object.values(r.blocks));
  const done = blocks.filter(b => b.result === "DONE").length, partial = blocks.filter(b => b.result === "PARTIAL").length;
  checks.push({ id: "check", stage: "C", label: "夜の○△×（過去7日）", status: marked.length >= 5 ? "OK" : marked.length >= 3 ? "WARN" : "MISSING",
    detail: marked.length ? `${marked.length}/7日 記録・できた率 ${Math.round(((done + partial * 0.5) / blocks.length) * 100)}%（${blocks.length}件）` : "過去7日に記録がありません",
    action: marked.length >= 5 ? "続いています。" : "完璧でなくて大丈夫です。夜の枠で、今日の予定に○△×を付けるだけにしてください（3分）。", href: "/pdca" });

  // A: 「明日ひとつ変えること」
  const acts = recent.filter(r => r.nextChange.trim()).length;
  checks.push({ id: "act", stage: "A", label: "明日ひとつ変えること（過去7日）", status: acts >= 3 ? "OK" : acts >= 1 ? "WARN" : "MISSING",
    detail: `${acts}/7日 書いています`, action: acts >= 3 ? "翌日のTODAYの先頭に出ます。" : "×の理由を見て、次の日に試すことを1行だけ書いてください。", href: "/pdca" });

  return checks;
}

export function rhythmIssues(checks: RhythmCheck[]): RhythmCheck[] {
  return checks.filter(c => c.status === "MISSING" || c.status === "WARN");
}
