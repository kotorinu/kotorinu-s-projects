import assert from "node:assert/strict";
import { test } from "node:test";
import { nextBlockForArea } from "../lib/areaHome";
import { blockPhase, fakeClock } from "../lib/clock";
import { completion, disposition, makeBlock, makeTask, noOverlays } from "./helpers";

// §41-B — 22:40 に「12:00の予定」を NEXT として出さない。
// 「date >= today」だけで判定していた頃、夜になっても昼の枠が"次にやること"
// として出ていた。時計が進めば予定は過去になる、という当たり前を固定する。

const TODAY = "2026-09-09";

const lunch = makeBlock({
  id: "b-lunch",
  taskId: "t-lunch",
  label: "昼スマホ",
  date: TODAY,
  startTime: "12:00",
  endTime: "13:00",
});
const night = makeBlock({
  id: "b-night",
  taskId: "t-night",
  label: "夜の営業",
  date: TODAY,
  startTime: "19:00",
  endTime: "21:10",
});
const tomorrow = makeBlock({
  id: "b-tomorrow",
  taskId: "t-tomorrow",
  label: "翌日の営業",
  date: "2026-09-10",
  startTime: "20:00",
  endTime: "21:00",
});

const salesTasks = [
  makeTask({ id: "t-lunch", title: "昼スマホ", area: "営業代行" }),
  makeTask({ id: "t-night", title: "夜の営業", area: "営業代行" }),
  makeTask({ id: "t-tomorrow", title: "翌日の営業", area: "営業代行" }),
];

test("B: at 22:40 an ended 12:00 block is PAST, not NEXT", () => {
  const clock = fakeClock(TODAY, "22:40");
  assert.equal(blockPhase(lunch, clock), "PAST");
  assert.equal(blockPhase(night, clock), "PAST");
  assert.equal(blockPhase(tomorrow, clock), "FUTURE");

  const next = nextBlockForArea("営業代行", TODAY, [lunch, night, tomorrow], salesTasks, "22:40");
  assert.ok(next, "there is still a next block — tomorrow's");
  assert.equal(next.block.id, "b-tomorrow", "22:40 must skip both of today's finished blocks");
});

test("B: at 07:27 the same data offers the 12:00 block", () => {
  const clock = fakeClock(TODAY, "07:27");
  assert.equal(blockPhase(lunch, clock), "FUTURE");
  const next = nextBlockForArea("営業代行", TODAY, [lunch, night, tomorrow], salesTasks, "07:27");
  assert.equal(next?.block.id, "b-lunch");
});

test("B: a block that is running right now is NOW", () => {
  assert.equal(blockPhase(night, fakeClock(TODAY, "19:00")), "NOW", "inclusive at the start");
  assert.equal(blockPhase(night, fakeClock(TODAY, "20:00")), "NOW");
  assert.equal(blockPhase(night, fakeClock(TODAY, "21:10")), "PAST", "exclusive at the end");
});

test("B: a running block is still offered as NEXT until it ends", () => {
  const next = nextBlockForArea("営業代行", TODAY, [lunch, night, tomorrow], salesTasks, "19:30");
  assert.equal(next?.block.id, "b-night", "the block you are inside is what to do now");
});

test("E: a DONE task is never offered as NEXT", () => {
  const overlays = noOverlays();
  const before = nextBlockForArea("営業代行", TODAY, [night, tomorrow], salesTasks, "07:00", overlays);
  assert.equal(before?.block.id, "b-night");

  overlays.completions["t-night"] = completion("t-night", TODAY);

  const after = nextBlockForArea("営業代行", TODAY, [night, tomorrow], salesTasks, "07:00", overlays);
  assert.equal(after?.block.id, "b-tomorrow", "finishing a task must move NEXT on");
});

test("E: a dropped task is never offered as NEXT", () => {
  const overlays = noOverlays();
  overlays.dispositions["t-night"] = disposition("t-night", "DROPPED", TODAY, "今回はやらないと決めた");

  const next = nextBlockForArea("営業代行", TODAY, [night, tomorrow], salesTasks, "07:00", overlays);
  assert.equal(next?.block.id, "b-tomorrow");
});
