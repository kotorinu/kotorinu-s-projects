import assert from "node:assert/strict";
import { test } from "node:test";
import { calendarActionItems, calendarDiff } from "../lib/calendarDiff";
import { calendarSnapshot } from "../lib/calendarSnapshot";
import { activeTimeBlocks } from "../lib/dummy-data";
import { liveTimeBlocks } from "../lib/livePlan";
import { makeBlock } from "./helpers";

// §41-G / §22/§23 — OS と Google Calendar の差分。
// いちばん大事なルール: calendarEventId が無いものを MATCHED と呼ばない。

const snapshot = calendarSnapshot;

test("G: a block whose event matches the calendar is MATCHED", () => {
  const block = makeBlock({
    id: "b-1",
    taskId: "t-1",
    label: "営業 17フェーズ",
    date: "2026-09-09",
    startTime: "19:00",
    endTime: "21:10",
    calendarEventId: "p0nh30q6j3join6m3ue5ehb830",
    calendarSyncEnabled: true,
  });
  const items = calendarDiff({ planBlocks: [block], supersededBlocks: [], snapshot });
  const mine = items.find((i) => i.blockId === "b-1");
  assert.equal(mine?.type, "MATCHED");
  assert.equal(mine?.calendarWhen, "9/9 19:00-21:10");
});

test("G: a time that drifted is UPDATE, and shows both sides", () => {
  const block = makeBlock({
    id: "b-1",
    taskId: "t-1",
    label: "営業 17フェーズ",
    date: "2026-09-09",
    startTime: "19:00",
    endTime: "20:00",
    calendarEventId: "p0nh30q6j3join6m3ue5ehb830",
    calendarSyncEnabled: true,
  });
  const item = calendarDiff({ planBlocks: [block], supersededBlocks: [], snapshot }).find(
    (i) => i.blockId === "b-1"
  );
  assert.equal(item?.type, "UPDATE");
  assert.equal(item?.osWhen, "9/9 19:00-20:00");
  assert.equal(item?.calendarWhen, "9/9 19:00-21:10");
});

test("G: a block with no event id is never MATCHED", () => {
  const wanted = makeBlock({
    id: "b-new",
    taskId: "t-1",
    label: "新しく決めた予定",
    date: "2026-09-10",
    startTime: "06:00",
    endTime: "07:00",
    calendarSyncEnabled: true,
  });
  const notWanted = makeBlock({
    id: "b-os-only",
    taskId: "t-2",
    label: "OS内だけの予定",
    date: "2026-09-10",
    startTime: "13:00",
    endTime: "14:00",
    calendarSyncEnabled: false,
  });
  const items = calendarDiff({ planBlocks: [wanted, notWanted], supersededBlocks: [], snapshot });
  assert.equal(items.find((i) => i.blockId === "b-new")?.type, "CREATE");
  assert.equal(items.find((i) => i.blockId === "b-os-only")?.type, "UNKNOWN");
  assert.equal(
    items.some((i) => i.blockId !== null && i.eventId === null && i.type === "MATCHED"),
    false,
    "MATCHED without an event id must be impossible"
  );
});

test("G: a rescheduled-away block leaves a DELETE on the calendar", () => {
  const moved = makeBlock({
    id: "b-new",
    taskId: "t-1",
    label: "営業 17フェーズ",
    date: "2026-09-10",
    startTime: "19:00",
    endTime: "21:10",
    calendarSyncEnabled: true,
  });
  const old = makeBlock({
    id: "b-old",
    taskId: "t-1",
    label: "営業 17フェーズ",
    date: "2026-09-09",
    startTime: "19:00",
    endTime: "21:10",
    calendarEventId: "p0nh30q6j3join6m3ue5ehb830",
    lifecycle: "SUPERSEDED",
  });
  const items = calendarDiff({ planBlocks: [moved], supersededBlocks: [old], snapshot });
  assert.equal(items.find((i) => i.blockId === "b-new")?.type, "CREATE");
  const del = items.find((i) => i.blockId === "b-old");
  assert.equal(del?.type, "DELETE");
  assert.equal(del?.calendarWhen, "9/9 19:00-21:10", "the stale event is still 9/9");
});

test("G: outside the window we actually read, the answer is UNKNOWN", () => {
  const old = makeBlock({
    id: "b-0908",
    taskId: "t-1",
    label: "9/8の予定",
    date: "2026-09-08",
    startTime: "19:00",
    endTime: "21:10",
    calendarEventId: "jldgktf6okc5c82tke62460as4",
    calendarSyncEnabled: true,
  });
  const item = calendarDiff({ planBlocks: [old], supersededBlocks: [], snapshot }).find(
    (i) => i.blockId === "b-0908"
  );
  assert.equal(item?.type, "UNKNOWN");
  assert.match(item?.action ?? "", /範囲\(2026-09-09〜2026-09-11\)の外/);
});

test("G: a calendar event the OS knows nothing about is surfaced, not ignored", () => {
  const items = calendarDiff({ planBlocks: [], supersededBlocks: [], snapshot });
  const orphan = items.find((i) => i.eventId === "n6junh2nm14156ogrv518pqh68");
  assert.equal(orphan?.type, "UNKNOWN");
  assert.equal(orphan?.blockId, null);
  assert.equal(orphan?.title, "【参加】営業実践クラス");
});

test("G: all-day markers are not treated as missing work blocks", () => {
  const items = calendarDiff({ planBlocks: [], supersededBlocks: [], snapshot });
  assert.equal(
    items.some((i) => i.eventId === "3uuj3g1oe8tmnm6aebutpbrd5c"),
    false,
    "【読了期限】 is a note, not a block the OS failed to create"
  );
});

test("G: the real shipped plan produces a diff, and MATCHED is not assumed", () => {
  const live = liveTimeBlocks({ timeBlockOverrides: {}, supersededBlockIds: new Set() });
  const items = calendarDiff({ planBlocks: live, supersededBlocks: [], snapshot });
  assert.ok(items.length > 0);
  for (const item of items) {
    if (item.type === "MATCHED") assert.ok(item.eventId, "MATCHED always has an event id");
  }
  const actions = calendarActionItems(items);
  assert.ok(actions.length <= items.length);
  assert.equal(actions.some((i) => i.type === "MATCHED"), false);
});

test("G: every fixture event id inside the window exists in the snapshot", () => {
  const inWindow = activeTimeBlocks.filter(
    (b) =>
      b.lifecycle === "ACTIVE" &&
      b.calendarEventId !== null &&
      b.date >= snapshot.coverageStart &&
      b.date <= snapshot.coverageEnd
  );
  const known = new Set(snapshot.events.map((e) => e.id));
  const missing = inWindow.filter((b) => !known.has(b.calendarEventId as string));
  assert.deepEqual(
    missing.map((b) => b.id + " → " + b.calendarEventId),
    [],
    "a fixture claims a Calendar event that the real calendar does not have"
  );
});

test("G: yesterday's disagreements stay out of the queue", () => {
  const past = makeBlock({
    id: "b-0908",
    taskId: "t-1",
    label: "9/8の予定",
    date: "2026-09-08",
    startTime: "19:00",
    endTime: "21:10",
    calendarSyncEnabled: true,
  });
  const today = makeBlock({
    id: "b-0909",
    taskId: "t-2",
    label: "9/9の予定",
    date: "2026-09-09",
    startTime: "19:00",
    endTime: "20:00",
    calendarSyncEnabled: true,
  });
  const items = calendarDiff({
    planBlocks: [past, today],
    supersededBlocks: [],
    snapshot,
    from: "2026-09-09",
  });
  assert.equal(items.some((i) => i.blockId === "b-0908"), false, "past days are history");
  assert.equal(items.find((i) => i.blockId === "b-0909")?.type, "CREATE");
  assert.equal(
    items.some((i) => i.calendarWhen?.startsWith("9/8")),
    false,
    "and neither are the calendar's own past events"
  );
});

test("G: a stale event is reported once, as DELETE — not twice", () => {
  const moved = makeBlock({
    id: "b-new",
    taskId: "t-1",
    label: "営業 17フェーズ",
    date: "2026-09-10",
    startTime: "20:00",
    endTime: "21:00",
    calendarSyncEnabled: true,
  });
  const old = makeBlock({
    id: "b-old",
    taskId: "t-1",
    label: "営業 17フェーズ",
    date: "2026-09-09",
    startTime: "19:00",
    endTime: "21:10",
    calendarEventId: "p0nh30q6j3join6m3ue5ehb830",
    lifecycle: "SUPERSEDED",
  });
  const items = calendarDiff({
    planBlocks: [moved],
    supersededBlocks: [old],
    snapshot,
    from: "2026-09-09",
  });
  const forEvent = items.filter((i) => i.eventId === "p0nh30q6j3join6m3ue5ehb830");
  assert.equal(forEvent.length, 1, "one event, one row");
  assert.equal(forEvent[0].type, "DELETE");
});
