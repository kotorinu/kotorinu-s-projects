import test from "node:test";
import assert from "node:assert/strict";
import { calendarFile } from "../lib/work/ical";
import { createTask } from "../lib/work/model";
test("Calendar file uses only explicit times, converts JST, and escapes embedded line breaks", () => {
  const now = "2026-09-17T00:00:00.000Z";
  const task = createTask({ title: "確認,行動", description: "入力\nEND:VEVENT" }, "t", now);
  const block = { id: "b", taskId: "t", label: task.title, date: "2026-09-17", startTime: "11:30", endTime: "12:30", createdOnDate: "2026-09-17", createdAt: now, replacesBlockId: null, reason: "本人" };
  const file = calendarFile([task], [block], now);
  assert.ok(file.includes("DTSTART:20260917T023000Z")); assert.ok(file.includes("DTEND:20260917T033000Z"));
  assert.ok(file.includes("SUMMARY:確認\\,行動"));
  assert.equal(file.split("\r\n").filter(l => l === "END:VEVENT").length, 1);
  assert.throws(() => calendarFile([task], [{ ...block, endTime: "11:00" }], now));
  assert.throws(() => calendarFile([task], [{ ...block, startTime: "25:00" }], now));
});
