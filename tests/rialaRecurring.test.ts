import assert from "node:assert/strict";
import { test } from "node:test";
import { eventReminderCandidates, welcomeTemplate } from "../lib/riala-planner/recurring";
import type { CatalogItem } from "../lib/riala-planner/model";
const event: CatalogItem = { id: "e1", title: "学習会", url: "https://community.riala.jp/events#e1", topics: [], summary: "一緒に学ぶ会", sourceUpdatedAt: null, startsAt: "2026-09-24T14:30:00+09:00", evidence: { sourceId: "events", reference: "https://community.riala.jp/events", quote: "学習会", observedAt: "2026-09-17T00:00:00+09:00" } };
test("recurring: seven and three day stages use JST, not UTC midnight", () => {
  assert.equal(eventReminderCandidates([event], "2026-09-16T15:01:00Z", [])[0]?.stage, 7);
  assert.equal(eventReminderCandidates([event], "2026-09-20T15:01:00Z", [])[0]?.stage, 3);
});
test("recurring: PC catch-up avoids a burst of both stages", () => {
  assert.equal(eventReminderCandidates([event], "2026-09-22T09:00:00+09:00", []).length, 1);
  assert.equal(eventReminderCandidates([event], "2026-09-22T09:00:00+09:00", [])[0]?.stage, 3);
});
test("recurring: only confirmed external history excludes a publication", () => {
  const now = "2026-09-17T09:00:00+09:00";
  const candidate = eventReminderCandidates([event], now, [])[0];
  assert.equal(eventReminderCandidates([event], now, [{ key: candidate.key, externalId: "post1", confirmedAt: now }]).length, 0);
  assert.equal(eventReminderCandidates([event], now, [{ key: candidate.key, externalId: "", confirmedAt: now }]).length, 1);
});
test("recurring: cancelled/past, unknown date, untrusted URL and missing evidence stop candidates", () => {
  const now = "2026-09-25T00:00:00+09:00";
  assert.equal(eventReminderCandidates([event], now, []).length, 0);
  for (const item of [{ ...event, startsAt: undefined }, { ...event, url: "https://example.com" }, { ...event, evidence: { ...event.evidence, quote: "" } }]) assert.equal(eventReminderCandidates([item], "2026-09-17T00:00:00+09:00", []).length, 0);
});
test("recurring: changed event date gets a distinct reminder key", () => {
  const now = "2026-09-17T09:00:00+09:00";
  const old = eventReminderCandidates([event], now, [])[0];
  const revised = { ...event, startsAt: "2026-09-23T14:30:00+09:00" };
  assert.notEqual(eventReminderCandidates([revised], now, [{ key: old.key, externalId: "post1", confirmedAt: now }])[0]?.key, old.key);
});
test("recurring: welcome is a fixed template with a validated name", () => {
  assert.match(welcomeTemplate("田中"), /^田中さん、RIALAへのご入会ありがとうございます/);
  assert.throws(() => welcomeTemplate("")); assert.throws(() => welcomeTemplate("田中\n別人"));
});
