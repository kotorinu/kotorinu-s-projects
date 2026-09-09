import assert from "node:assert/strict";
import { test } from "node:test";
import { buildCalendarDay, themeForCalendarColorId } from "../lib/calendarDay";
import { snapshotEvents } from "../lib/calendarProvider";
import { calendarSnapshot } from "../lib/calendarSnapshot";
import { tasks as allTasks } from "../lib/dummy-data";
import { liveTimeBlocks } from "../lib/livePlan";
import {
  CONFIDENCE_LABEL,
  buildDailyReview,
  buildWeeklyReview,
  estimateGroupOf,
  proposeCalendarDuration,
  proposeEstimate,
} from "../lib/pdca";
import { buildCompletionFeedback } from "../lib/completionFeedback";
import { fakeClock } from "../lib/clock";
import { validatePlan } from "../lib/planValidator";
import { isTaskOverdue } from "../lib/taskState";
import { makeBlock, makeTask, noOverlays } from "./helpers";
import type { CalendarEventDTO } from "../lib/calendarProvider";
import type { TaskCompletionRecord, VarianceReason } from "../lib/types";

const TODAY = "2026-09-09";
const live = () => liveTimeBlocks({ timeBlockOverrides: {}, supersededBlockIds: new Set() });
const todaysEvents = () => snapshotEvents(TODAY, TODAY, null).events;

// ===== Calendar-first TODAY (§1〜§9, §55〜§59) =====

test("Acceptance 1: TODAYの時間Sourceは Calendar である", () => {
  const day = buildCalendarDay({
    date: TODAY,
    events: todaysEvents(),
    planBlocks: live(),
    tasks: allTasks,
    nowHm: "07:27",
  });
  // Calendarにある今日の時間つき予定は、ひとつ残らず出る。
  const timedEvents = todaysEvents().filter((e) => !e.allDay);
  for (const ev of timedEvents) {
    assert.ok(
      day.timed.some((e) => e.key === ev.id),
      `Calendarの「${ev.summary}」がTODAYに出ていない`
    );
  }
});

test("Acceptance 2/3/55: 営業実践クラスがTaskなしでもTODAYへ出る", () => {
  const day = buildCalendarDay({
    date: TODAY,
    events: todaysEvents(),
    planBlocks: live(),
    tasks: allTasks,
    nowHm: "07:27",
  });
  const cls = day.timed.find((e) => e.title.includes("営業実践クラス"));
  assert.ok(cls, "営業実践クラスがTODAYに出ていない");
  assert.equal(cls.role, "CALENDAR_ONLY");
  assert.equal(cls.startTime, "22:30");
  assert.equal(cls.endTime, "23:30");
  // §5: colorId 9 → 営業 Blue
  assert.equal(cls.colorId, "9");
  assert.equal(themeForCalendarColorId("9")?.primary, "#5484ED");
});

test("Acceptance 4: Calendar-onlyを偽Task化しない", () => {
  const day = buildCalendarDay({
    date: TODAY,
    events: todaysEvents(),
    planBlocks: live(),
    tasks: allTasks,
    nowHm: "07:27",
  });
  for (const e of day.timed.filter((x) => x.role === "CALENDAR_ONLY")) {
    assert.equal(e.task, null, `${e.title} に偽Taskが付いている`);
    assert.equal(e.timeBlock, null);
  }
});

test("Acceptance 5/56: Task-linked EventはOSのTask（DoD/Why）を保つ", () => {
  const day = buildCalendarDay({
    date: TODAY,
    events: todaysEvents(),
    planBlocks: live(),
    tasks: allTasks,
    nowHm: "07:27",
  });
  const linked = day.timed.filter((e) => e.role === "LINKED_TASK");
  assert.ok(linked.length > 0, "Taskと紐づいた予定が1つも無い");
  for (const e of linked) {
    assert.ok(e.task, "LINKED_TASKなのにTaskが無い");
    assert.ok(e.task.definitionOfDone.length > 0, `${e.task.title} のDoDが失われている`);
    assert.ok(e.task.why.length > 0, `${e.task.title} のWhyが失われている`);
  }
});

test("Acceptance 6/17: Calendarの時刻が優先される", () => {
  const task = makeTask({ id: "t-x", title: "営業", area: "営業代行", lifecycle: "ACTIVE" });
  const block = makeBlock({
    id: "b-x",
    taskId: "t-x",
    label: "営業",
    date: TODAY,
    startTime: "19:00",
    endTime: "21:00",
    calendarEventId: "evt-1",
  });
  const events: CalendarEventDTO[] = [
    {
      id: "evt-1",
      summary: "営業",
      date: TODAY,
      startTime: "19:30",
      endTime: "21:30",
      colorId: "9",
      allDay: false,
      description: null,
    },
  ];
  const day = buildCalendarDay({ date: TODAY, events, planBlocks: [block], tasks: [task], nowHm: "07:00" });
  const e = day.timed[0];
  assert.equal(e.startTime, "19:30", "採用するのはCalendarの時刻");
  assert.equal(e.endTime, "21:30");
  assert.deepEqual(e.osTimeWas, { startTime: "19:00", endTime: "21:00" }, "OS側の値は記録として残す");
});

test("Acceptance 9/§9: 終日イベントは時間割へ入れずDEADLINESへ", () => {
  const day = buildCalendarDay({
    date: TODAY,
    events: todaysEvents(),
    planBlocks: live(),
    tasks: allTasks,
    nowHm: "07:27",
  });
  assert.ok(day.deadlines.length > 0, "終日イベントが1件も拾えていない");
  for (const d of day.deadlines) {
    assert.equal(d.role, "ALL_DAY_DEADLINE");
    assert.equal(d.startTime, null);
  }
  assert.equal(
    day.timed.some((e) => e.startTime === null),
    false,
    "時間の無い予定がTimelineに混ざっている"
  );
});

test("Calendarに無いOSの枠も落とさず、未反映として出す", () => {
  const task = makeTask({ id: "t-y", title: "移動したTask", area: "RIALA", lifecycle: "ACTIVE" });
  const osOnly = makeBlock({
    id: "b-y",
    taskId: "t-y",
    date: TODAY,
    startTime: "20:00",
    endTime: "21:00",
    calendarEventId: null,
  });
  const day = buildCalendarDay({ date: TODAY, events: [], planBlocks: [osOnly], tasks: [task], nowHm: "07:00" });
  assert.equal(day.timed.length, 1);
  assert.equal(day.timed[0].role, "OS_PENDING_CALENDAR");
});

test("Acceptance 7: 静的Snapshotは「最新」と名乗らない", () => {
  const r = snapshotEvents(TODAY, TODAY, null);
  assert.equal(r.source, "SNAPSHOT");
  assert.equal(r.readAt, calendarSnapshot.readAt);
  assert.notEqual(r.source, "LIVE");
});

test("§5: Calendar色IDが既存の色規則と一致する", () => {
  assert.equal(themeForCalendarColorId("9")?.label, "営業");
  assert.equal(themeForCalendarColorId("10")?.label, "RIALA");
  assert.equal(themeForCalendarColorId("3")?.label, "GENESIS");
  assert.equal(themeForCalendarColorId("5")?.label, "読書");
  assert.equal(themeForCalendarColorId("7")?.label, "AI Work OS");
  assert.equal(themeForCalendarColorId("8")?.label, "翌日計画");
  assert.equal(themeForCalendarColorId(null), null, "色が無いなら色を主張しない");
  assert.equal(themeForCalendarColorId("99"), null, "知らないIDに色を割り当てない");
});

// ===== PDCA (§33〜§50) =====

function completion(taskId: string, estimate: number | null, actual: number): TaskCompletionRecord {
  return {
    taskId,
    completedAt: `${TODAY}T21:00:00+09:00`,
    completedOnDate: TODAY,
    originalDeadline: null,
    deadlineAtCompletion: null,
    delayDays: null,
    metDefinitionOfDone: true,
    estimateMinutes: estimate,
    actualMinutes: actual,
    varianceMinutes: estimate === null ? null : actual - estimate,
  };
}

test("Acceptance 16: 実績1件でも暫定候補を出す", () => {
  const a = makeTask({ id: "t-a", title: "A", area: "RIALA", estimateGroupId: "RIALA_MEMBER_STATUS" });
  const b = makeTask({ id: "t-b", title: "B", area: "RIALA", estimateGroupId: "RIALA_MEMBER_STATUS" });
  const p = proposeEstimate(b, [a, b], { "t-a": completion("t-a", 30, 60) });
  assert.ok(p);
  assert.equal(p.samples.length, 1);
  assert.equal(p.suggestedMinutes, 60);
  assert.equal(p.confidence, "PROVISIONAL");
});

test("§39: 2件なら参考値", () => {
  const ts = ["t-a", "t-b", "t-c"].map((id) =>
    makeTask({ id, title: id, area: "RIALA", estimateGroupId: "RIALA_MEMBER_STATUS" })
  );
  const p = proposeEstimate(ts[2], ts, {
    "t-a": completion("t-a", 30, 55),
    "t-b": completion("t-b", 30, 65),
  });
  assert.equal(p?.confidence, "REFERENCE");
});

test("Acceptance 17: 3件以上は中央値で推奨", () => {
  const ts = ["t-a", "t-b", "t-c", "t-d"].map((id) =>
    makeTask({ id, title: id, area: "RIALA", estimateGroupId: "RIALA_MEMBER_STATUS" })
  );
  const p = proposeEstimate(ts[3], ts, {
    "t-a": completion("t-a", 60, 55),
    "t-b": completion("t-b", 60, 65),
    "t-c": completion("t-c", 60, 60),
  });
  assert.equal(p?.confidence, "RECOMMENDED");
  assert.equal(p?.suggestedMinutes, 60, "中央値。外れ値に引っ張られない");
});

test("§40: 外れ値があっても中央値なら壊れない", () => {
  const ts = ["t-a", "t-b", "t-c", "t-d"].map((id) =>
    makeTask({ id, title: id, area: "RIALA", estimateGroupId: "RIALA_MEMBER_STATUS" })
  );
  const p = proposeEstimate(ts[3], ts, {
    "t-a": completion("t-a", 60, 55),
    "t-b": completion("t-b", 60, 60),
    "t-c": completion("t-c", 60, 600), // 外れ値
  });
  assert.equal(p?.suggestedMinutes, 60, "平均なら238分になってしまう");
});

test("§41: グループが決まらないTaskには候補を出さない", () => {
  const lone = makeTask({ id: "t-lone", title: "一度きり", area: "営業代行" });
  const other = makeTask({ id: "t-other", title: "別の営業Task", area: "営業代行" });
  assert.equal(estimateGroupOf(lone), null, "areaだけで束ねない");
  assert.equal(proposeEstimate(lone, [lone, other], { "t-other": completion("t-other", 30, 90) }), null);
});

test("§42: 出荷しているデータのグループは、繰り返しTaskだけに付いている", () => {
  const grouped = allTasks.filter((t) => t.estimateGroupId !== null);
  assert.ok(grouped.length > 0);
  const byGroup = new Map<string, number>();
  for (const t of grouped) {
    byGroup.set(t.estimateGroupId as string, (byGroup.get(t.estimateGroupId as string) ?? 0) + 1);
  }
  for (const [group, count] of byGroup) {
    assert.ok(count >= 2, `${group} が1件しか無い。繰り返しでないならグループを付けない`);
  }
});

test("§36: ズレが小さいTaskはCHECKに出さない", () => {
  const small = makeTask({ id: "t-s", title: "小さいズレ", area: "RIALA", estimateMinutes: 60 });
  const big = makeTask({ id: "t-b", title: "大きいズレ", area: "RIALA", estimateMinutes: 30 });
  const review = buildDailyReview({
    date: TODAY,
    tasks: [small, big],
    completions: { "t-s": completion("t-s", 60, 65), "t-b": completion("t-b", 30, 60) },
    varianceReasons: new Map<string, VarianceReason>(),
    allTasks: [small, big],
  });
  assert.equal(review.over.length, 1, "5分のズレは説明する価値がない");
  assert.equal(review.over[0].task.id, "t-b");
  assert.equal(review.over[0].varianceMinutes, 30);
  assert.equal(review.over[0].variancePercent, 100);
});

test("§35: 実績が無ければ数字を作らない", () => {
  const t = makeTask({ id: "t-x", title: "未計測", area: "RIALA", estimateMinutes: 60 });
  const rec = { ...completion("t-x", 60, 0), actualMinutes: null };
  const review = buildDailyReview({
    date: TODAY,
    tasks: [t],
    completions: { "t-x": rec },
    varianceReasons: new Map<string, VarianceReason>(),
    allTasks: [t],
  });
  assert.equal(review.actualMinutes, null, "0分と書くと「0分で終わった」に読める");
  assert.equal(review.missingActual, 1);
});

test("Acceptance 19/§46: Calendarへの提案は PROPOSED どまり", () => {
  const t = makeTask({ id: "t-a", title: "A", area: "RIALA", estimateGroupId: "RIALA_MEMBER_STATUS" });
  const u = makeTask({ id: "t-b", title: "B", area: "RIALA", estimateGroupId: "RIALA_MEMBER_STATUS" });
  const p = proposeEstimate(u, [t, u], { "t-a": completion("t-a", 30, 90) });
  assert.ok(p);
  const proposal = proposeCalendarDuration(60, p);
  assert.ok(proposal);
  assert.equal(proposal.state, "CALENDAR_CHANGE_PROPOSED");
  assert.equal(proposal.proposedMinutes, 90);
  assert.equal(/反映しました|変更しました/.test(proposal.label), false, "書き込んでいないのに完了と言わない");
});

test("Acceptance 18: 次回見積りを採用しても、過去のestimateは変わらない", () => {
  const past = makeTask({
    id: "t-past",
    title: "過去のTask",
    area: "RIALA",
    estimateMinutes: 90,
    estimateGroupId: "RIALA_MEMBER_STATUS",
  });
  const next = makeTask({
    id: "t-next",
    title: "次のTask",
    area: "RIALA",
    estimateMinutes: 90,
    estimateGroupId: "RIALA_MEMBER_STATUS",
  });
  const completions = { "t-past": completion("t-past", 90, 120) };
  const p = proposeEstimate(next, [past, next], completions);
  assert.equal(p?.suggestedMinutes, 120);
  // 提案は値を返すだけ。Taskにも完了記録にも触れない。
  assert.equal(past.estimateMinutes, 90);
  assert.equal(completions["t-past"].estimateMinutes, 90);
});

// ===== Deadline と実行予定は別概念 (§18/§53) =====

test("Acceptance 10: 期限と実行予定が違ってもIntegrity Errorにしない", () => {
  // 期限9/8のTaskを、未完了なので9/9に実行する。遅れてはいるが、
  // 計画として壊れているわけではない。
  const task = makeTask({
    id: "t-late",
    title: "期限を過ぎたTask",
    area: "営業代行",
    lifecycle: "ACTIVE",
    deadline: "2026-09-08",
    workDate: TODAY,
  });
  const block = makeBlock({
    id: "b-late",
    taskId: "t-late",
    date: TODAY,
    startTime: "19:00",
    endTime: "20:00",
    calendarEventId: "evt-late",
  });
  const issues = validatePlan([task], [block], noOverlays(), fakeClock(TODAY, "07:27"));
  assert.deepEqual(
    issues.map((i) => i.code),
    [],
    "期限 < 実行日 を PLAN INVALID として扱ってはいけない"
  );
});

test("§18: 元のDeadline履歴を消さない", () => {
  const task = makeTask({
    id: "t-late",
    title: "期限を過ぎたTask",
    area: "営業代行",
    lifecycle: "ACTIVE",
    deadline: "2026-09-08",
    workDate: TODAY,
  });
  // 実行日を動かしても、Taskのdeadlineそのものは触らない。
  assert.equal(task.deadline, "2026-09-08");
  assert.equal(isTaskOverdue(task, TODAY, noOverlays()), true, "遅れてはいる");
});

// ===== 完了の瞬間にPDCAを始める (§37/§51/§52) =====

test("§51: 完了フィードバックに次回候補が入る", () => {
  const a = makeTask({ id: "t-a", title: "A", area: "RIALA", estimateGroupId: "RIALA_MEMBER_STATUS" });
  const b = makeTask({
    id: "t-b",
    title: "B",
    area: "RIALA",
    estimateGroupId: "RIALA_MEMBER_STATUS",
    estimateMinutes: 30,
  });
  const record = completion("t-b", 30, 60);
  // 完了したそのTask自身の実績も標本に入るので、ここは2件＝参考値。
  const proposal = proposeEstimate(b, [a, b], { "t-a": completion("t-a", 30, 60), "t-b": record });
  assert.ok(proposal);
  const fb = buildCompletionFeedback({
    task: b,
    record,
    salesCoverage: null,
    remainingToday: 1,
    nextTaskTitle: "次のTask",
    streakDays: 1,
    nextEstimate: { minutes: proposal.suggestedMinutes, confidence: CONFIDENCE_LABEL[proposal.confidence] },
  });
  assert.deepEqual(fb.nextEstimate, { minutes: 60, confidence: "参考値" });
  assert.ok(fb.changed.some((c) => c.includes("30分")), "差も事実として出る");

  // 1件しか実績が無ければ「暫定」。件数で言い方が変わる (§39)。
  const lone = proposeEstimate(b, [b], { "t-b": record });
  assert.equal(lone?.confidence, "PROVISIONAL");
  assert.equal(CONFIDENCE_LABEL[lone!.confidence], "暫定");
});

test("§37: 提案は出すが、自動でestimateを書き換えない", () => {
  const b = makeTask({
    id: "t-b",
    title: "B",
    area: "RIALA",
    estimateGroupId: "RIALA_MEMBER_STATUS",
    estimateMinutes: 30,
  });
  const record = completion("t-b", 30, 60);
  buildCompletionFeedback({
    task: b,
    record,
    salesCoverage: null,
    remainingToday: 0,
    nextTaskTitle: null,
    streakDays: 1,
    nextEstimate: { minutes: 60, confidence: "暫定" },
  });
  assert.equal(b.estimateMinutes, 30, "Task自身の見積りは触らない");
  assert.equal(record.estimateMinutes, 30, "完了記録の予定も触らない");
});

test("§52: 実績が無い完了はそれと分かる（値を作らない）", () => {
  const t = makeTask({ id: "t-x", title: "未計測", area: "RIALA", estimateMinutes: 60 });
  const record = { ...completion("t-x", 60, 0), actualMinutes: null, varianceMinutes: null };
  const fb = buildCompletionFeedback({
    task: t,
    record,
    salesCoverage: null,
    remainingToday: 0,
    nextTaskTitle: null,
    streakDays: 1,
  });
  assert.equal(fb.nextEstimate, null);
  assert.equal(
    fb.changed.some((c) => c.includes("実績")),
    false,
    "測っていないのに実績を書かない"
  );
});

// ===== PDCA Daily/Weekly の残り (§47/§48) =====

test("§47: 今日Replanしたもの / 止まっているものが出る", () => {
  const t = makeTask({ id: "t-r", title: "動かしたTask", area: "RIALA" });
  const u = makeTask({ id: "t-b", title: "止まったTask", area: "RIALA" });
  const review = buildDailyReview({
    date: TODAY,
    tasks: [t, u],
    completions: {},
    varianceReasons: new Map<string, VarianceReason>(),
    allTasks: [t, u],
    replanFlags: {
      "t-r": {
        taskId: "t-r",
        reason: "POSTPONED",
        detail: "2026-09-09 から 2026-09-10 へ移動",
        raisedOnDate: TODAY,
        raisedAt: `${TODAY}T21:00:00+09:00`,
      },
    },
    dispositions: {
      "t-b": {
        taskId: "t-b",
        disposition: "BLOCKED",
        decidedOnDate: TODAY,
        decidedAt: `${TODAY}T21:00:00+09:00`,
        note: "商品レクチャー待ち",
      },
    },
  });
  assert.equal(review.replanned.length, 1);
  assert.equal(review.replanned[0].task.id, "t-r");
  assert.equal(review.blocked.length, 1);
  assert.equal(review.blocked[0].note, "商品レクチャー待ち");
});

test("§48: 次週へ変えることは最大3件、ズレが小さいものは出さない", () => {
  const mk = (id: string, group: string) =>
    makeTask({ id, title: id, area: "RIALA", estimateGroupId: group });
  const tasks = [
    mk("t-1", "RIALA_MEMBER_STATUS"),
    mk("t-2", "DAILY_PLANNING"),
    mk("t-3", "READING_60P"),
    mk("t-4", "GENESIS_INQUIRY"),
  ];
  const weekly = buildWeeklyReview(
    "2026-09-04",
    TODAY,
    tasks,
    {
      "t-1": completion("t-1", 30, 90), // +60 大きくズレる
      "t-2": completion("t-2", 20, 60), // +40
      "t-3": completion("t-3", 60, 100), // +40
      "t-4": completion("t-4", 60, 65), // +5 → 出さない
    },
    new Map<string, VarianceReason>(),
    {}
  );
  assert.ok(weekly.changeNextWeek.length <= 3, "全部挙げると何も変わらない");
  assert.equal(
    weekly.changeNextWeek.some((c) => c.label.includes("問い切り")),
    false,
    "5分のズレを「変えること」に入れない"
  );
  assert.equal(weekly.replanCount, 0);
});
