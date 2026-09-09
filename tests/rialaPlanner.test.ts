import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyLedger, type CatalogItem, type Facts, type Mail, type Member, type Source } from "../lib/riala-planner/model";
import { plan, resolveIdentity } from "../lib/riala-planner/planner";

const NOW = "2026-09-10T00:00:00.000Z";
const ev = (sourceId: string, quote: string) => ({ sourceId, reference: `https://community.riala.jp/${sourceId}`, quote, observedAt: NOW });
const source = <T,>(name: Source<T>["name"], sourceId: string, items: T[]): Source<T> => ({ name, sourceId, mode: "LIVE", readAt: NOW, complete: true, items, failure: null });
const member = (id: string, name: string, email: string | null, interests = ["AI副業"]): Member => ({ id, name, email, emailVerified: Boolean(email), isStaff: false, active: true, registeredAt: "2026-09-09T00:00:00.000Z", evidence: ev("member", `${name}の自己紹介`), interests: interests.map(topic => ({ topic, evidence: ev("member", topic) })) });
const catalog = (id: string, title: string, topic = "AI副業"): CatalogItem => ({ id, title, url: "https://community.riala.jp/content/" + id, topics: [topic], summary: title, sourceUpdatedAt: NOW, evidence: ev("content", title) });
const facts = (members: Member[], mails: Mail[] = [], events = [catalog("event-1", "AI副業イベント")], content = [catalog("content-1", "AI副業の基礎")]): Facts => ({ members: source("members", "riala-members", members), gmail: source("gmail", "gmail-sent", mails), events: source("events", "riala-events", events), content: source("content", "riala-content", content) });

test("RIALA: first run is a baseline and a later exact match creates an evidence-backed welcome", () => {
  const baseline = emptyLedger();
  const first = plan(baseline, facts([member("m1", "田中", "tanaka@gmail.com")]), NOW, "run-1");
  assert.equal(baseline.actions.length, 0); assert.equal(baseline.baselineAt, NOW); assert.equal(first.actionIds.length, 0);
  const second = plan(baseline, facts([member("m1", "田中", "tanaka@gmail.com"), member("m2", "佐藤", "sato@gmail.com")], [{ id: "mail", threadId: "t", recipients: ["sato@gmail.com"], recipientNames: ["佐藤"], timestamp: NOW, subject: "RIALA移行", reference: "https://mail.google.com/mail/u/0/#sent/t" }]), NOW, "run-2");
  const action = baseline.actions.find(a => a.workflow === "WELCOME"); assert.ok(action, "a real new member after baseline is prepared"); assert.equal(action.identity.confidence, "HIGH"); assert.match(action.draft, /AI副業/); assert.ok(action.evidence.length > 0);
});

test("RIALA: exact-name ambiguity is MEDIUM and does not create a sendable action", () => {
  const m = member("m1", "佐藤", null);
  const f = facts([m], [{ id: "mail-1", threadId: "t", recipients: ["a@example.com", "b@example.com"], recipientNames: ["佐藤", "佐藤"], timestamp: NOW, subject: "RIALA移行", reference: "https://mail.google.com/mail/u/0/#sent/t" }]);
  const identity = resolveIdentity(m, f); assert.equal(identity.confidence, "MEDIUM"); assert.equal(identity.candidates.length, 2);
  const ledger = emptyLedger(); const out = plan(ledger, f, NOW, "run"); assert.equal(out.actionIds.length, 0); assert.equal(ledger.actions.length, 0); assert.match(out.outcome, /Baseline/);
});

test("RIALA: no explicit interest produces no individual welcome recommendation", () => {
  const m = member("m1", "山田", "yamada@example.com", []);
  const ledger = { ...emptyLedger(), baselineAt: "2026-09-01T00:00:00.000Z", seenMemberIds: [] };
  const out = plan(ledger, facts([m]), NOW, "run"); const action = ledger.actions.find(a => a.workflow === "WELCOME"); assert.ok(action); assert.equal(action.recommendations.length, 0); assert.doesNotMatch(action.draft, /おすすめ/);
});

test("RIALA: previously sent welcome is skipped by business history", () => {
  const m = member("m1", "田中", "tanaka@gmail.com");
  const mail = { id: "mail-1", threadId: "t", recipients: ["tanaka@gmail.com"], recipientNames: ["田中"], timestamp: NOW, subject: "RIALA Welcome", reference: "https://mail.google.com/mail/u/0/#sent/t" };
  const ledger = { ...emptyLedger(), baselineAt: "2026-09-01T00:00:00.000Z", seenMemberIds: [] };
  const out = plan(ledger, facts([m], [mail]), NOW, "run"); const action = ledger.actions.find(a => a.workflow === "WELCOME"); assert.ok(action); assert.equal(action.status, "SKIPPED");
});

test("RIALA: event T-3 prepares only members without an existing invite", () => {
  const event = { ...catalog("event-3", "実践イベント"), startsAt: "2026-09-12T09:00:00.000Z", topics: ["AI副業"] };
  const members = [member("m1", "一", "one@example.com"), member("m2", "二", "two@example.com")];
  const sent: Mail = { id: "sent", threadId: "t", recipients: ["one@example.com"], recipientNames: ["一"], timestamp: NOW, subject: "RIALAのご案内：実践イベント", reference: "https://mail.google.com/mail/u/0/#sent/t" };
  const ledger = { ...emptyLedger(), baselineAt: "2026-09-01T00:00:00.000Z", seenMemberIds: members.map(m => m.id) };
  plan(ledger, facts(members, [sent], [event]), NOW, "run");
  const invites = ledger.actions.filter(a => a.workflow === "EVENT"); assert.equal(invites.length, 1); assert.equal(invites[0].subjectId, "m2");
});

test("RIALA: stale source stops the run before any action is prepared", () => {
  const f = facts([member("m1", "田中", "tanaka@example.com")]);
  f.members.readAt = "2026-09-01T00:00:00.000Z";
  const ledger = emptyLedger(); const run = plan(ledger, f, NOW, "run");
  assert.equal(ledger.actions.length, 0); assert.match(run.stopReason ?? "", /members/);
});

