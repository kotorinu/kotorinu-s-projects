import assert from "node:assert/strict";
import { test } from "node:test";
import { fakeClock } from "../lib/clock";
import {
  liveReplan,
  planReadiness,
  replanChanges,
  tasksWaitingForPlan,
  timeDrifts,
} from "../lib/calendarAuthority";
import { calendarSnapshot } from "../lib/calendarSnapshot";
import { goals, tasks } from "../lib/dummy-data";
import { liveTimeBlocks } from "../lib/livePlan";
import { northStarGoals, surfaceLine } from "../lib/goalTree";
import { validatePlan } from "../lib/planValidator";
import { makeBlock, makeTask, noOverlays } from "./helpers";

// Google Calendar = WHEN の正本 (2026-09-09, §1〜§6).

const TODAY = "2026-09-09";
const live = () => liveTimeBlocks({ timeBlockOverrides: {}, supersededBlockIds: new Set() });

// --- §2 やると決めたTaskは必ずCalendarに枠を持つ ---

test("Acceptance 1: ACTIVE TaskでCalendar枠なし = 0", () => {
  const waiting = tasksWaitingForPlan(tasks, live(), noOverlays());
  assert.deepEqual(
    waiting.map((t) => `${t.id} ${t.title}`),
    [],
    "実行すると決めたのにCalendarに枠が無いTaskが残っている"
  );
});

test("§2: OSにしか枠が無いTaskは WAITING_FOR_PLAN になる", () => {
  const task = makeTask({ id: "t-x", title: "テスト", area: "営業代行", lifecycle: "ACTIVE" });
  const osOnly = makeBlock({
    id: "b-os",
    taskId: "t-x",
    date: TODAY,
    startTime: "19:00",
    endTime: "20:00",
    calendarEventId: null,
  });
  const r = planReadiness(task, [osOnly], noOverlays());
  assert.equal(r.readiness, "WAITING_FOR_PLAN");
  assert.equal(r.scheduledBlocks.length, 0);
  assert.equal(r.osOnlyBlocks.length, 1);
});

test("§2: Calendarに枠があれば SCHEDULED", () => {
  const task = makeTask({ id: "t-x", title: "テスト", area: "営業代行", lifecycle: "ACTIVE" });
  const scheduled = makeBlock({
    id: "b-cal",
    taskId: "t-x",
    date: TODAY,
    startTime: "19:00",
    endTime: "20:00",
    calendarEventId: "evt-1",
  });
  assert.equal(planReadiness(task, [scheduled], noOverlays()).readiness, "SCHEDULED");
});

test("§2: BACKLOGはCalendar枠を要求されない", () => {
  const task = makeTask({ id: "t-x", title: "あとで", area: "営業代行", lifecycle: "BACKLOG" });
  assert.equal(planReadiness(task, [], noOverlays()).readiness, "NOT_COMMITTED");
  assert.equal(tasksWaitingForPlan([task], [], noOverlays()).length, 0);
});

test("§2: Validatorが「Calendarに枠が無い」をERRORとして出す", () => {
  const task = makeTask({ id: "t-x", title: "テスト", area: "営業代行", lifecycle: "ACTIVE" });
  const osOnly = makeBlock({
    id: "b-os",
    taskId: "t-x",
    date: TODAY,
    startTime: "19:00",
    endTime: "20:00",
    calendarEventId: null,
  });
  const issues = validatePlan([task], [osOnly], noOverlays(), fakeClock(TODAY, "07:27"));
  assert.ok(issues.some((i) => i.code === "ACTIVE_WITHOUT_CALENDAR"));
});

test("§2: 出荷している計画はValidatorを0件で通る", () => {
  const issues = validatePlan(tasks, live(), noOverlays(), fakeClock(TODAY, "07:27"));
  const summary = issues.map((i) => `${i.code} ${i.taskTitle}: ${i.detail}`).join("\n");
  assert.deepEqual(issues, [], `矛盾が残っている:\n${summary}`);
});

// --- §3 時刻はCalendarが正本 ---

test("§3: 出荷している計画とCalendarの間に時刻のズレは無い", () => {
  assert.deepEqual(timeDrifts(live(), calendarSnapshot), []);
});

test("§3: ズレがあれば、採用すべき値としてCalendar側を返す", () => {
  const block = makeBlock({
    id: "b-1",
    taskId: "t-1",
    label: "営業",
    date: "2026-09-09",
    startTime: "19:00",
    endTime: "20:00", // Calendarは21:10
    calendarEventId: "p0nh30q6j3join6m3ue5ehb830",
  });
  const drift = timeDrifts([block], calendarSnapshot);
  assert.equal(drift.length, 1);
  assert.equal(drift[0].os.endTime, "20:00");
  assert.equal(drift[0].calendar.endTime, "21:10", "採用するのはCalendar側");
});

test("§3: 照合範囲の外はズレとして扱わない", () => {
  const block = makeBlock({
    id: "b-0908",
    taskId: "t-1",
    label: "9/8",
    date: "2026-09-08",
    startTime: "19:00",
    endTime: "20:00",
    calendarEventId: "jldgktf6okc5c82tke62460as4",
  });
  assert.deepEqual(timeDrifts([block], calendarSnapshot), [], "読んでいないものをズレとは言えない");
});

// --- §5 Live Replan ---

test("§5: 予定と違う順で始めたら、Calendarをその順に詰め直す", () => {
  // 仕様の例そのまま:
  //   予定 19:00 Sales（120分）
  //   実際 19:00-19:30 RIALA
  //   結果 19:00-19:30 RIALA / 19:30-21:30 Sales
  const sales = makeBlock({
    id: "b-sales",
    taskId: "t-sales",
    label: "Sales",
    date: TODAY,
    startTime: "19:00",
    endTime: "21:00",
  });
  const riala = makeBlock({
    id: "b-riala",
    taskId: "t-riala",
    label: "RIALA",
    date: TODAY,
    startTime: "21:00",
    endTime: "21:30",
  });

  const slots = liveReplan({
    blocks: [sales, riala],
    startedTaskId: "t-riala",
    actualStart: "19:00",
    actualMinutes: 30,
  });
  const byId = new Map(slots.map((s) => [s.blockId, s]));

  assert.equal(byId.get("b-riala")?.to.startTime, "19:00");
  assert.equal(byId.get("b-riala")?.to.endTime, "19:30");
  assert.equal(byId.get("b-sales")?.to.startTime, "19:30");
  assert.equal(byId.get("b-sales")?.to.endTime, "21:30", "Salesの長さ120分は変えない");
});

test("§5: 所要時間は勝手に変えない", () => {
  const a = makeBlock({ id: "b-a", taskId: "t-a", label: "A", date: TODAY, startTime: "19:00", endTime: "20:00" });
  const b = makeBlock({ id: "b-b", taskId: "t-b", label: "B", date: TODAY, startTime: "20:00", endTime: "21:30" });
  const slots = liveReplan({ blocks: [a, b], startedTaskId: "t-b", actualStart: "19:00", actualMinutes: 90 });
  const byId = new Map(slots.map((s) => [s.blockId, s]));
  const minutes = (s: { startTime: string; endTime: string }) => {
    const [sh, sm] = s.startTime.split(":").map(Number);
    const [eh, em] = s.endTime.split(":").map(Number);
    return eh * 60 + em - (sh * 60 + sm);
  };
  assert.equal(minutes(byId.get("b-b")!.to), 90);
  assert.equal(minutes(byId.get("b-a")!.to), 60);
});

test("§5: 予定どおりに始めたなら、変更は出ない", () => {
  const a = makeBlock({ id: "b-a", taskId: "t-a", label: "A", date: TODAY, startTime: "19:00", endTime: "20:00" });
  const b = makeBlock({ id: "b-b", taskId: "t-b", label: "B", date: TODAY, startTime: "20:00", endTime: "21:00" });
  const slots = liveReplan({ blocks: [a, b], startedTaskId: "t-a", actualStart: "19:00", actualMinutes: 60 });
  assert.deepEqual(replanChanges(slots), []);
});

test("§5: すでに終わった枠は動かさない", () => {
  const morning = makeBlock({
    id: "b-am",
    taskId: "t-am",
    label: "朝",
    date: TODAY,
    startTime: "05:30",
    endTime: "06:30",
  });
  const evening = makeBlock({
    id: "b-pm",
    taskId: "t-pm",
    label: "夜",
    date: TODAY,
    startTime: "19:00",
    endTime: "20:00",
  });
  const later = makeBlock({
    id: "b-late",
    taskId: "t-late",
    label: "遅く",
    date: TODAY,
    startTime: "21:00",
    endTime: "22:00",
  });
  const slots = liveReplan({
    blocks: [morning, evening, later],
    startedTaskId: "t-late",
    actualStart: "19:00",
    actualMinutes: 60,
  });
  const byId = new Map(slots.map((s) => [s.blockId, s]));
  assert.equal(byId.get("b-am")?.changed, false, "朝の枠は触らない");
  assert.equal(byId.get("b-late")?.to.startTime, "19:00");
  assert.equal(byId.get("b-pm")?.to.startTime, "20:00");
});

// --- §7/§10 North Star ---

test("§7: North Starは Life → Work → Direction の3枚", () => {
  const stars = northStarGoals(goals);
  assert.deepEqual(stars.map((g) => g.isNorthStar), ["LIFE", "WORK", "DIRECTION"]);
});

test("§10: 期間Goalとエリア Goal は必ずNorth Starへ繋がる", () => {
  for (const g of goals) {
    if (g.isNorthStar === "LIFE") continue; // 最上位なので繋ぎ先は無い
    assert.ok(g.northStars.length > 0, `${g.title} がどのNorth Starにも繋がっていない`);
  }
});

test("§10: 営業の成約1件は Direction → Work へ繋がる", () => {
  const sales = goals.find((g) => g.id === "g-sales-agency");
  assert.ok(sales);
  assert.deepEqual(sales.northStars, ["DIRECTION", "WORK"]);
});

// --- §8 カード表面は1行 ---

test("§8: カード表面の行は Evidence か Gap のどちらか1つ", () => {
  for (const g of goals) {
    const line = surfaceLine(g);
    if (g.nextEvidence !== null) assert.equal(line.kind, "EVIDENCE");
    else if (g.currentGap !== null) assert.equal(line.kind, "GAP");
    else assert.equal(line.kind, "NONE");
  }
});
