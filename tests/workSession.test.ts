import assert from "node:assert/strict";
import { test } from "node:test";
import { bankedMinutesFor, endWorkOn, openSession, startWorkOn, type SessionLedger } from "../lib/workSession";

// §41-C — Task A を止めずに Task B を開始したとき、A の時間が B に流れ込まない。
// 「計測が信用できない」状態を作らないための最低ラインのテスト。

function empty(): SessionLedger {
  return { sessions: [], actualMinutes: new Map(), startedTaskId: null };
}

const T0 = "2026-09-09T19:00:00+09:00";
const T30 = "2026-09-09T19:30:00+09:00";
const T50 = "2026-09-09T19:50:00+09:00";

test("C: starting B closes A and banks A's minutes onto A", () => {
  let ledger = startWorkOn(empty(), "task-a", T0);
  assert.equal(ledger.startedTaskId, "task-a");
  assert.equal(openSession(ledger.sessions)?.taskId, "task-a");

  ledger = startWorkOn(ledger, "task-b", T30);

  assert.equal(ledger.startedTaskId, "task-b", "B is now the running task");
  assert.equal(openSession(ledger.sessions)?.taskId, "task-b", "only ONE session may be open");
  assert.equal(ledger.sessions.filter((w) => w.endedAt === null).length, 1);

  const a = ledger.sessions.find((w) => w.taskId === "task-a");
  assert.equal(a?.endedAt, T30, "A's session closed at the moment B started");
  assert.equal(a?.minutes, 30);
  assert.equal(a?.endReason, "SWITCH");

  assert.equal(ledger.actualMinutes.get("task-a"), 30);
  assert.equal(ledger.actualMinutes.get("task-b"), undefined, "B has banked nothing yet");
});

test("C: ending B banks only B's own span", () => {
  let ledger = startWorkOn(empty(), "task-a", T0);
  ledger = startWorkOn(ledger, "task-b", T30);
  ledger = endWorkOn(ledger, "task-b", "COMPLETE", T50);

  assert.equal(ledger.startedTaskId, null);
  assert.equal(openSession(ledger.sessions), null);
  assert.equal(ledger.actualMinutes.get("task-a"), 30);
  assert.equal(ledger.actualMinutes.get("task-b"), 20, "B gets 19:30→19:50, not 19:00→19:50");
  assert.equal(bankedMinutesFor(ledger.sessions, "task-b"), 20);
});

test("C: coming back to a task adds to it instead of replacing it", () => {
  let ledger = startWorkOn(empty(), "task-a", T0);
  ledger = endWorkOn(ledger, "task-a", "STOPPED", T30);
  ledger = startWorkOn(ledger, "task-a", T30);
  ledger = endWorkOn(ledger, "task-a", "COMPLETE", T50);

  assert.equal(ledger.actualMinutes.get("task-a"), 50, "30 + 20");
  assert.equal(bankedMinutesFor(ledger.sessions, "task-a"), 50);
  assert.equal(ledger.sessions.length, 2, "two spans, both kept");
});

test("C: a reschedule closes the running session with its own reason", () => {
  let ledger = startWorkOn(empty(), "task-a", T0);
  ledger = endWorkOn(ledger, "task-a", "RESCHEDULE", T30);
  assert.equal(ledger.sessions[0].endReason, "RESCHEDULE");
  assert.equal(ledger.startedTaskId, null, "a task moved to another day is not running");
});

test("C: ending a task that is not running changes nothing", () => {
  const ledger = startWorkOn(empty(), "task-a", T0);
  const after = endWorkOn(ledger, "task-b", "COMPLETE", T30);
  assert.equal(openSession(after.sessions)?.taskId, "task-a");
  assert.equal(after.actualMinutes.get("task-b"), undefined);
});

test("C: a session shorter than a minute still counts as one", () => {
  let ledger = startWorkOn(empty(), "task-a", T0);
  ledger = endWorkOn(ledger, "task-a", "COMPLETE", "2026-09-09T19:00:20+09:00");
  assert.equal(ledger.actualMinutes.get("task-a"), 1, "never 0 — it did happen");
});
