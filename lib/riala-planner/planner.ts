import { createHash } from "node:crypto";
import type { Action, CatalogItem, Evidence, Facts, Identity, Ledger, Member, Run, Source } from "./model";

export function hash(value: unknown): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
export const validEmail = (v: string) => /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(v) && v.length <= 254;
export const emailKey = (v: string) => v.trim().toLowerCase();
export const safeUrl = (v: string | null): boolean => {
  try { const u = new URL(v ?? ""); return u.protocol === "https:" && !u.username && !u.password && u.hostname === "community.riala.jp"; } catch { return false; }
};
export function evidenceValid(e: Evidence): boolean {
  try { return !!e.sourceId && !!e.quote.trim() && e.quote.length <= 600 && new URL(e.reference).protocol === "https:" && Number.isFinite(Date.parse(e.observedAt)); } catch { return false; }
}
export function sourceProblem(source: Source<unknown>, now: string, minutes: number, live = false): string | null {
  if (source.failure || !source.complete || source.mode === "UNCONNECTED") return `${source.name}: 未接続または取得不完全`;
  const age = Date.parse(now) - Date.parse(source.readAt ?? "");
  if (!Number.isFinite(age) || age < -60000 || age > minutes * 60000) return `${source.name}: Sourceが古い、または取得日時が不正`;
  if (live && source.mode !== "LIVE") return `${source.name}: Snapshotからは送信できません`;
  return null;
}
export function resolveIdentity(member: Member, facts: Facts): Identity {
  const mails = facts.gmail.items;
  const exact = member.email && member.emailVerified && validEmail(member.email)
    ? mails.filter(m => m.recipients.some(r => emailKey(r) === emailKey(member.email!))) : [];
  const mailEvidence = (id: string, reference: string, timestamp: string, subject: string): Evidence => ({ sourceId: id, reference, observedAt: timestamp, quote: subject.slice(0, 600) });
  if (exact.length) return { confidence: "HIGH", email: emailKey(member.email!), reason: "新RIALAで検証されたEmailとGmail送信先が一致", candidates: [{ email: emailKey(member.email!), evidence: [member.evidence, ...exact.slice(0, 3).map(m => mailEvidence(m.id, m.reference, m.timestamp, m.subject))] }] };
  // A name or a BCC list is a candidate, never proof of identity.
  const candidates = mails.filter(m => m.recipientNames.some(n => n.trim() === member.name.trim()))
    .flatMap(m => m.recipients.filter(validEmail).map(email => ({ email: emailKey(email), evidence: [mailEvidence(m.id, m.reference, m.timestamp, m.subject)] })));
  const unique = [...new Map(candidates.map(c => [c.email, c])).values()].slice(0, 5);
  return { confidence: unique.length ? "MEDIUM" : "LOW", email: null, candidates: unique,
    reason: unique.length ? "名前が一致する候補です。登録Emailとの確実な対応確認が必要" : "検証済み登録EmailとRIALA関連Gmailの対応を確認できません" };
}
export function matches(member: Member, items: CatalogItem[], now: string): CatalogItem[] {
  const topics = member.interests.filter(i => evidenceValid(i.evidence)).map(i => i.topic.toLowerCase());
  return items.filter(i => safeUrl(i.url) && evidenceValid(i.evidence) &&
    (!i.startsAt || Date.parse(i.startsAt) > Date.parse(now)) &&
    i.topics.some(t => topics.includes(t.toLowerCase())))
    .sort((a, b) => a.id.localeCompare(b.id)).slice(0, 2);
}
export function welcomeDraft(member: Member, recommendations: CatalogItem[]): { draft: string; evidence: Evidence[] } {
  const relevant = member.interests.filter(i => evidenceValid(i.evidence) && recommendations.some(r => r.topics.includes(i.topic)));
  const personal = relevant[0];
  const lines = [`${member.name}さん、RIALAへのご参加ありがとうございます。`];
  if (personal) lines.push(`自己紹介で「${personal.evidence.quote}」と書かれていたので、まずはこちらがおすすめです。`);
  for (const item of recommendations) lines.push(`${item.title}\n${item.url}`);
  lines.push("RIALAでの学びや交流に、ぜひご活用ください。よろしくお願いいたします。");
  return { draft: lines.join("\n\n"), evidence: [member.evidence, ...relevant.map(i => i.evidence), ...recommendations.map(r => r.evidence)] };
}
export function fingerprint(member: Member, recommendations: CatalogItem[]): string {
  // Observation time is intentionally excluded: rereading the same facts does not revoke approval.
  return hash({ id: member.id, name: member.name, email: member.email, verified: member.emailVerified,
    active: member.active, staff: member.isStaff, interests: member.interests.map(i => [i.topic, i.evidence.quote]),
    recommendations: recommendations.map(i => [i.id, i.title, i.url, i.sourceUpdatedAt, i.startsAt]) });
}
export const approvalHash = (a: Action) => hash([a.id, a.businessKey, a.identity.email, a.type, a.subject, a.draft, a.sourceFingerprint, a.revision]);
export function previousMail(member: Member, facts: Facts, kind: "welcome" | "event", event?: CatalogItem): boolean {
  if (!member.email) return false;
  return facts.gmail.items.some(m => m.recipients.some(r => emailKey(r) === emailKey(member.email!)) &&
    (kind === "welcome" ? /welcome|ようこそ|参加ありがとうございます|ご参加ありがとう/i.test(m.subject) : !!event && m.subject.includes(event.title)));
}
export function plan(ledger: Ledger, facts: Facts, now: string, runId: string): Run {
  const problems = Object.values(facts).map(s => sourceProblem(s, now, ledger.settings.maxSourceAgeMinutes)).filter((s): s is string => !!s);
  const run: Run = { id: runId, workflow: "RIALA", startedAt: now, completedAt: now,
    sourcesRead: Object.values(facts).map(({ items: _items, ...meta }) => meta),
    facts: [], decisions: [], actionIds: [], stopReason: problems.join(" / ") || null,
    outcome: "停止", humanVerificationMinutes: null, humanCorrections: 0, managementMinutes: {}, measurementMode: null,
    cost: null, boundaryViolations: 0, reproducibility: hash(facts) };
  if (problems.length) { ledger.runs.push(run); return run; }
  if (!ledger.baselineAt) {
    ledger.baselineAt = now; ledger.seenMemberIds = facts.members.items.map(m => m.id);
    run.outcome = "初回Baselineを記録。既存会員への一括Welcomeは作成しません";
    run.facts.push(`参加者Source ${facts.members.items.length}件を基準として記録`);
    ledger.runs.push(run); return run;
  }
  const add = (member: Member, workflow: Action["workflow"], key: string, recs: CatalogItem[], reason: string, stop: string | null = null) => {
    if (ledger.actions.some(a => a.businessKey === key)) { run.decisions.push(`${workflow}: 処理済み、保留、または既存候補のため除外`); return; }
    const identity = resolveIdentity(member, facts);
    const content = welcomeDraft(member, recs);
    const action: Action = { id: hash(key).slice(0, 32), businessKey: key, runId, workflow, subjectId: member.id, name: member.name,
      type: "EMAIL", reason, evidence: [...content.evidence, ...identity.candidates.flatMap(c => c.evidence)], identity,
      riskLevel: "EXTERNAL_SEND", permissionRequired: "HUMAN_APPROVAL", draft: content.draft,
      subject: workflow === "WELCOME" ? "RIALAへのご参加ありがとうございます" : `RIALAのご案内：${recs[0]?.title ?? "要確認"}`,
      recommendations: recs, status: stop || identity.confidence !== "HIGH" ? "NEEDS_REVIEW" : "PROPOSED",
      createdAt: now, updatedAt: now, sourceFingerprint: fingerprint(member, recs), revision: 1,
      stopReason: stop ?? (identity.confidence !== "HIGH" ? identity.reason : null),
      nextAction: "根拠と宛先を確認して承認してください", externalId: null, externalMessageId: null, approvedHash: null, approvedAt: null, edited: false };
    if (workflow === "EVENT") action.draft = `${member.name}さん、RIALAのイベントをご案内します。\n\n${recs.map(r => `${r.title}\n${r.startsAt}\n${r.url}`).join("\n\n")}\n\n${member.interests.filter(i => recs.some(r => r.topics.includes(i.topic)) && evidenceValid(i.evidence)).slice(0, 1).map(i => `「${i.evidence.quote}」というご関心に関連する内容です。`).join("")}`;
    ledger.actions.push(action); run.actionIds.push(action.id);
  };
  const newMembers = facts.members.items.filter(m => !ledger.seenMemberIds.includes(m.id));
  run.facts.push(`前回以降に見つかった参加者 ${newMembers.length}件`);
  for (const member of newMembers.filter(m => m.active && !m.isStaff)) {
    const recs = matches(member, [...facts.events.items, ...facts.content.items], now);
    const sent = previousMail(member, facts, "welcome");
    const old = Date.parse(member.registeredAt) < Date.parse(ledger.baselineAt);
    add(member, "WELCOME", `WELCOME:${member.id}`, recs, "前回確認以降に参加者Sourceへ追加",
      old ? "登録日はBaseline以前です。新規参加か移行・再取得か確認してください" : null);
    if (sent) {
      const a = ledger.actions.find(a => a.businessKey === `WELCOME:${member.id}`)!;
      a.status = "SKIPPED"; a.stopReason = "GmailにWelcomeの送信履歴あり"; a.nextAction = "再送しません";
    }
  }
  ledger.seenMemberIds = [...new Set([...ledger.seenMemberIds, ...facts.members.items.map(m => m.id)])];
  for (const event of facts.events.items) {
    if (!event.startsAt) continue;
    const days = Math.ceil((Date.parse(event.startsAt) - Date.parse(now)) / 86400000);
    if (days < 1 || days > ledger.settings.eventLeadDays) continue;
    for (const member of facts.members.items.filter(m => m.active && !m.isStaff && matches(m, [event], now).length)) {
      if (previousMail(member, facts, "event", event)) { run.decisions.push(`EVENT ${event.id}: 外部履歴に案内済みの対象を除外`); continue; }
      // Stable across reminder stages; v0 never sends all stages to every member.
      add(member, "EVENT", `EVENT_INVITE:${member.id}:${event.id}`, [event], `開催まで${days}日・明示された関心と一致`);
    }
  }
  const daily = facts.content.items.find(c => safeUrl(c.url) && evidenceValid(c.evidence));
  if (daily) {
    const key = `CONTENT_DAILY:${now.slice(0, 10)}`;
    if (!ledger.actions.some(a => a.businessKey === key)) {
      const synthetic: Member = { id: "community", name: "全体投稿", registeredAt: now, email: null, emailVerified: false, isStaff: false, active: true, interests: [], evidence: daily.evidence };
      add(synthetic, "CONTENT", key, [daily], "全体向けおすすめ候補。個別DMは作成しません", "投稿チャネル未接続。内部Draftのみ");
      const a = ledger.actions.find(a => a.businessKey === key)!; a.type = "POST_DRAFT";
      a.draft = `今日のおすすめ\n\n${daily.title}\n${daily.summary}\n${daily.url}`;
    }
  }
  run.outcome = `${run.actionIds.length}件の候補を準備（送信0件）`; ledger.runs.push(run); return run;
}

