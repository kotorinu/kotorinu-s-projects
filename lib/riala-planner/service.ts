import { randomUUID } from "node:crypto";
import type { Action, Facts, Ledger, Providers, Sender, Store } from "./model";
import { approvalHash, fingerprint, plan, previousMail, resolveIdentity, safeUrl, sourceProblem } from "./planner";

const mutable = (a: Action) => ["PROPOSED", "NEEDS_REVIEW", "APPROVED"].includes(a.status);
export async function readFacts(p: Providers, now: string): Promise<Facts> {
  const [members, gmail, events, content] = await Promise.all([p.members.read(now), p.gmail.read(now), p.events.read(now), p.content.read(now)]);
  return { members, gmail, events, content };
}
export async function scan(store: Store, providers: Providers, now = new Date().toISOString()) {
  const facts = await readFacts(providers, now); const id = randomUUID();
  return store.transact(ledger => plan(ledger, facts, now, id));
}
function preflight(a: Action, facts: Facts, ledger: Ledger, now: string) {
  const problems = Object.values(facts).map(s => sourceProblem(s, now, ledger.settings.maxSourceAgeMinutes, true)).filter(Boolean);
  if (problems.length) throw new Error(problems.join(" / "));
  if (a.type !== "EMAIL" || a.identity.confidence !== "HIGH" || !a.identity.email) throw new Error("HIGH以外・全体投稿は送信不可");
  const member = facts.members.items.find(m => m.id === a.subjectId);
  if (!member || !member.active || member.isStaff) throw new Error("参加者の状態を確認できません");
  const identity = resolveIdentity(member, facts);
  if (identity.confidence !== "HIGH" || identity.email !== a.identity.email) throw new Error("Identityが変わりました。再確認が必要です");
  const catalog = [...facts.events.items, ...facts.content.items];
  const recs = a.recommendations.map(old => catalog.find(c => c.id === old.id));
  if (recs.some(c => !c || !safeUrl(c.url) || c.startsAt && Date.parse(c.startsAt) <= Date.parse(now))) throw new Error("推薦情報が未確認または期限切れです");
  if (fingerprint(member, recs as Action["recommendations"]) !== a.sourceFingerprint) throw new Error("根拠が変更されています。再作成・再承認が必要です");
  if (previousMail(member, facts, a.workflow === "WELCOME" ? "welcome" : "event", recs[0])) throw new Error("外部履歴に送信済みの可能性があります");
  if (a.stopReason) throw new Error(a.stopReason);
}
export async function approveAndSend(store: Store, providers: Providers, sender: Sender, selections: { id: string; hash: string }[], now = new Date().toISOString()) {
  if (!sender.enabled) throw new Error("送信Adapter未接続。まだ送信できません");
  if (!selections.length || selections.length > 10 || new Set(selections.map(s => s.id)).size !== selections.length) throw new Error("承認対象は1〜10件で指定してください");
  const facts = await readFacts(providers, now);
  // All-or-nothing batch approval. There are no external effects inside a retryable transaction.
  await store.transact(ledger => {
    const actions = selections.map(s => {
      const a = ledger.actions.find(x => x.id === s.id);
      if (!a || !mutable(a) || approvalHash(a) !== s.hash) throw new Error("承認対象が変わりました。再読み込みしてください");
      preflight(a, facts, ledger, now); return a;
    });
    for (const a of actions) {
      a.status = "APPROVED"; a.approvedHash = approvalHash(a); a.approvedAt = now; a.updatedAt = now;
      ledger.audit.push({ at: now, actionId: a.id, operation: "APPROVED", reason: "operator approved exact recipient, message and evidence" });
    }
  });
  for (const selection of selections) {
    // Re-read immediately before each send, including between batch items.
    const currentTime = new Date().toISOString();
    const latest = await readFacts(providers, currentTime);
    let action: Action;
    try {
      action = await store.transact(ledger => {
        const a = ledger.actions.find(x => x.id === selection.id)!;
        if (a.status !== "APPROVED" || a.approvedHash !== approvalHash(a)) throw new Error("承認不一致・重複送信の可能性");
        preflight(a, latest, ledger, currentTime);
        a.status = "EXECUTING"; a.updatedAt = currentTime;
        a.nextAction = "送信結果を確認中。再送せずRead Backしてください";
        ledger.audit.push({ at: currentTime, actionId: a.id, operation: "EXECUTING", reason: "durable claim before external send" });
        return structuredClone(a);
      });
    } catch {
      await store.transact(ledger => {
        const a = ledger.actions.find(x => x.id === selection.id)!;
        if (a.status === "APPROVED") { a.status = "NEEDS_REVIEW"; a.approvedHash = null; a.stopReason = "送信直前の再確認に失敗。Source・本人・既送信を確認してください"; }
      });
      continue;
    }
    try {
      const result = await sender.send(action);
      await store.transact(ledger => {
        const a = ledger.actions.find(x => x.id === action.id)!;
        a.externalId = result.id; a.status = "EXECUTED"; a.updatedAt = new Date().toISOString();
      });
    } catch {
      await store.transact(ledger => {
        const a = ledger.actions.find(x => x.id === action.id)!; a.status = "UNKNOWN_RESULT";
        a.stopReason = "送信結果が不明です。外部履歴を確認できるまで再送禁止";
      });
    }
    await reconcile(store, sender, action.id);
  }
}
export async function reconcile(store: Store, sender: Sender, id: string) {
  const state = await store.read(); const action = state.actions.find(a => a.id === id);
  if (!action || !["EXECUTING", "EXECUTED", "UNKNOWN_RESULT"].includes(action.status)) throw new Error("Read Back対象ではありません");
  let result = { confirmed: false, id: action.externalId };
  try { result = await sender.readBack(action); } catch { /* Failure is not evidence of non-delivery. */ }
  return store.transact(ledger => {
    const a = ledger.actions.find(x => x.id === id)!;
    if (a.status === "READ_BACK_CONFIRMED") return;
    a.status = result.confirmed ? "READ_BACK_CONFIRMED" : "UNKNOWN_RESULT";
    a.externalId = result.id; a.updatedAt = new Date().toISOString();
    a.stopReason = result.confirmed ? null : "Read Back未確認。再送せず外部履歴を確認してください";
    a.nextAction = result.confirmed ? "送信済み。返信・活動を次回確認（移行完了とは別状態）" : "Gmailの送信済みを確認し、Read Backを再実行してください";
    ledger.audit.push({ at: a.updatedAt, actionId: a.id, operation: a.status, reason: result.confirmed ? "external message, recipient and body verified" : "delivery remains uncertain" });
  });
}
export function publicAction(a: Action) {
  return { id: a.id, name: a.name, workflow: a.workflow, status: a.status, confidence: a.identity.confidence,
    email: a.identity.email ? a.identity.email.replace(/^(.{2}).*(@.*)$/, "$1***$2") : null,
    candidateCount: a.identity.candidates.length, identityReason: a.identity.reason,
    reason: a.reason, evidence: a.evidence.slice(0, 8).map(e => ({ ...e, quote: e.quote.replace(/[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[Email非表示]") })),
    draft: a.draft, subject: a.subject, recommendations: a.recommendations.map(c => ({ id: c.id, title: c.title, url: c.url, reason: c.topics.join("・") })),
    stopReason: a.stopReason, nextAction: a.nextAction, hash: approvalHash(a), updatedAt: a.updatedAt };
}
export type ActionCard = ReturnType<typeof publicAction>;

