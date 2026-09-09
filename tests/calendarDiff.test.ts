import assert from "node:assert/strict";
import { test } from "node:test";
import {
  actionableNow,
  calendarActionItems,
  calendarDiff,
  calendarOnlyItems,
  needsRecheck,
} from "../lib/calendarDiff";
import { calendarSnapshot } from "../lib/calendarSnapshot";
import { activeTimeBlocks } from "../lib/dummy-data";
import { liveTimeBlocks } from "../lib/livePlan";
import { makeBlock } from "./helpers";

// §41-G / §3・§4 — OS と Google Calendar の差分。
//
// Calendar が WHEN の正本になったので、差分の向きが決まっている:
//   時刻が違う     → OSがCalendarへ合わせる（ADOPT_CALENDAR_TIME）
//   Calendarに無い → まだ「いつやるか」が決まっていない
//   OSに無い       → Calendarの予定をOSが取り込めていない
// そして「判定できない」とは言わない。再照合すれば分かる。

const snapshot = calendarSnapshot;

test("G: 時刻が一致していれば MATCHED", () => {
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
  const mine = calendarDiff({ planBlocks: [block], supersededBlocks: [], snapshot }).find(
    (i) => i.blockId === "b-1"
  );
  assert.equal(mine?.type, "MATCHED");
  assert.equal(mine?.calendarWhen, "9/9 19:00-21:10");
});

test("G: 時刻が違えば、直す先はOS側である", () => {
  const block = makeBlock({
    id: "b-1",
    taskId: "t-1",
    label: "営業 17フェーズ",
    date: "2026-09-09",
    startTime: "19:00",
    endTime: "20:00", // OSは短くしているが、Calendarは21:10のまま
    calendarEventId: "p0nh30q6j3join6m3ue5ehb830",
    calendarSyncEnabled: true,
  });
  const item = calendarDiff({ planBlocks: [block], supersededBlocks: [], snapshot }).find(
    (i) => i.blockId === "b-1"
  );
  assert.equal(item?.type, "ADOPT_CALENDAR_TIME");
  assert.equal(item?.osWhen, "9/9 19:00-20:00");
  assert.equal(item?.calendarWhen, "9/9 19:00-21:10");
  // 「Calendarを直す」ではない。正本はCalendar。
  assert.match(item?.action ?? "", /OS側の予定をCalendarの時刻に合わせる/);
  assert.equal(/Calendarイベントの日時を.*修正/.test(item?.action ?? ""), false);
});

test("G: calendarEventIdが無いものは MATCHED にならず、枠が未定として出る", () => {
  const wanted = makeBlock({
    id: "b-new",
    taskId: "t-1",
    label: "新しく決めた予定",
    date: "2026-09-10",
    startTime: "06:00",
    endTime: "07:00",
    calendarSyncEnabled: true,
  });
  const osOnly = makeBlock({
    id: "b-os-only",
    taskId: "t-2",
    label: "OS内だけの予定",
    date: "2026-09-10",
    startTime: "13:00",
    endTime: "14:00",
    calendarSyncEnabled: false,
  });
  const items = calendarDiff({ planBlocks: [wanted, osOnly], supersededBlocks: [], snapshot });
  // syncEnabledの有無に関係なく、Calendarに枠が無いことの意味は同じ。
  assert.equal(items.find((i) => i.blockId === "b-new")?.type, "MISSING_IN_CALENDAR");
  assert.equal(items.find((i) => i.blockId === "b-os-only")?.type, "MISSING_IN_CALENDAR");
  assert.equal(
    items.some((i) => i.eventId === null && i.type === "MATCHED"),
    false,
    "イベントIDが無いのに一致と判定することは不可能でなければならない"
  );
});

test("G: 別日へ移した予定のCalendarイベントは残骸として出る", () => {
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
  assert.equal(items.find((i) => i.blockId === "b-new")?.type, "MISSING_IN_CALENDAR");
  const stale = items.find((i) => i.blockId === "b-old");
  assert.equal(stale?.type, "STALE_IN_CALENDAR");
  assert.equal(stale?.calendarWhen, "9/9 19:00-21:10");
});

test("G: 同じイベントを2行に分けて出さない", () => {
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
  const forEvent = calendarDiff({
    planBlocks: [moved],
    supersededBlocks: [old],
    snapshot,
    from: "2026-09-09",
  }).filter((i) => i.eventId === "p0nh30q6j3join6m3ue5ehb830");
  assert.equal(forEvent.length, 1, "1つのイベントにつき1行");
  assert.equal(forEvent[0].type, "STALE_IN_CALENDAR");
});

test("§4: 照合範囲の外は「判定できない」ではなく「再照合が必要」", () => {
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
  assert.equal(item?.type, "NEEDS_RECHECK");
  assert.match(item?.action ?? "", /Calendarを読み直す/);
});

test("§4: 差分の種類に「判定できない」という語が残っていない", () => {
  const items = calendarDiff({ planBlocks: [], supersededBlocks: [], snapshot });
  for (const i of items) {
    assert.equal(/判定できない/.test(i.action), false, `"${i.action}" に判定できないが残っている`);
  }
});

test("§7: CalendarにあってOSにTaskが無いのは正常。ERRORにしない", () => {
  const items = calendarDiff({ planBlocks: [], supersededBlocks: [], snapshot });
  const orphan = items.find((i) => i.eventId === "n6junh2nm14156ogrv518pqh68");
  assert.equal(orphan?.type, "MISSING_IN_OS");
  assert.equal(orphan?.blockId, null);
  assert.equal(orphan?.title, "【参加】営業実践クラス");
  // 参加予定は独立したTaskではない。直すべきものとして数えない。
  assert.match(orphan?.action ?? "", /対応不要/);
  assert.equal(
    actionableNow(items).some((i) => i.type === "MISSING_IN_OS"),
    false,
    "Calendar-onlyを「いま直すもの」に混ぜない"
  );
  assert.equal(calendarOnlyItems(items).length > 0, true);
});

test("G: 終日イベントは実行枠として扱わない", () => {
  const items = calendarDiff({ planBlocks: [], supersededBlocks: [], snapshot });
  assert.equal(
    items.some((i) => i.eventId === "3uuj3g1oe8tmnm6aebutpbrd5c"),
    false,
    "【読了期限】はメモであって、OSが作り忘れた枠ではない"
  );
});

test("G: 昨日の食い違いはqueueに入れない", () => {
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
  assert.equal(items.some((i) => i.blockId === "b-0908"), false, "過ぎた日は履歴");
  assert.equal(items.find((i) => i.blockId === "b-0909")?.type, "MISSING_IN_CALENDAR");
  assert.equal(items.some((i) => i.calendarWhen?.startsWith("9/8")), false);
});

test("G: 出荷している計画は、一致をIDなしで名乗らない", () => {
  const live = liveTimeBlocks({ timeBlockOverrides: {}, supersededBlockIds: new Set() });
  const items = calendarDiff({ planBlocks: live, supersededBlocks: [], snapshot });
  assert.ok(items.length > 0);
  for (const item of items) {
    if (item.type === "MATCHED") assert.ok(item.eventId, "MATCHEDには必ずイベントIDがある");
  }
});

test("actionableNow は再照合待ちもCalendar-onlyも含まない", () => {
  const real = liveTimeBlocks({ timeBlockOverrides: {}, supersededBlockIds: new Set() });
  const items = calendarDiff({ planBlocks: real, supersededBlocks: [], snapshot });
  const now = actionableNow(items);
  const later = needsRecheck(items);
  const normal = calendarOnlyItems(items);
  const all = calendarActionItems(items);
  assert.equal(now.some((i) => i.type === "NEEDS_RECHECK"), false);
  assert.equal(now.some((i) => i.type === "MATCHED"), false);
  assert.equal(now.some((i) => i.type === "MISSING_IN_OS"), false);
  assert.equal(
    now.length + later.length + normal.length,
    all.length,
    "一致以外は、いま直す / 再照合 / 正常なCalendar-only のどれか"
  );
});

test("出荷しているfixtureのイベントIDは、実Calendarに存在する", () => {
  const inWindow = activeTimeBlocks.filter(
    (b) =>
      b.lifecycle === "ACTIVE" &&
      b.calendarEventId !== null &&
      b.date >= snapshot.coverageStart &&
      b.date <= snapshot.coverageEnd
  );
  const known = new Set(snapshot.events.map((e) => e.id));
  const missing = inWindow.filter((b) => !known.has(b.calendarEventId as string));
  assert.deepEqual(missing.map((b) => b.id + " → " + b.calendarEventId), []);
});
