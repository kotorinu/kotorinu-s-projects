export type Workflow = "WELCOME" | "EVENT" | "CONTENT";
export type Status = "PROPOSED" | "NEEDS_REVIEW" | "APPROVED" | "EXECUTING" | "EXECUTED" | "READ_BACK_CONFIRMED" | "FAILED" | "UNKNOWN_RESULT" | "SKIPPED";
export type SourceName = "members" | "gmail" | "events" | "content";
export interface Evidence { sourceId: string; reference: string; quote: string; observedAt: string }
export interface Interest { topic: string; evidence: Evidence }
export interface Member {
  id: string; name: string; registeredAt: string | null; email: string | null;
  emailVerified: boolean | null; isStaff: boolean | null; active: boolean | null;
  interests: Interest[]; evidence: Evidence;
}
export interface Mail {
  id: string; threadId: string; recipients: string[]; recipientNames: string[];
  timestamp: string; subject: string; reference: string;
}
export interface CatalogItem {
  id: string; title: string; url: string | null; topics: string[];
  summary: string; sourceUpdatedAt: string | null; evidence: Evidence;
  startsAt?: string; durationIfKnown?: number | null;
}
export interface Source<T> {
  name: SourceName; sourceId: string; mode: "LIVE" | "SNAPSHOT" | "UNCONNECTED";
  readAt: string | null; complete: boolean; items: T[]; failure: string | null;
  diagnostics?: { messageCount: number; latestMessageAt: string | null; accountMasked: string; scope: string };
}
export interface Facts {
  members: Source<Member>; gmail: Source<Mail>; events: Source<CatalogItem>; content: Source<CatalogItem>;
}
export interface Identity {
  confidence: "HIGH" | "MEDIUM" | "LOW"; email: string | null;
  candidates: { email: string; evidence: Evidence[] }[]; reason: string;
}
export interface Action {
  id: string; runId: string; businessKey: string; workflow: Workflow; subjectId: string;
  name: string; type: "EMAIL" | "POST_DRAFT"; reason: string; evidence: Evidence[];
  identity: Identity; riskLevel: "EXTERNAL_SEND"; permissionRequired: "HUMAN_APPROVAL";
  draft: string; subject: string; recommendations: CatalogItem[]; status: Status;
  createdAt: string; updatedAt: string; sourceFingerprint: string; revision: number;
  stopReason: string | null; nextAction: string; externalId: string | null;
  approvedHash: string | null; approvedAt: string | null; edited: boolean;
  externalMessageId: string | null;
}
export interface Run {
  id: string; workflow: "RIALA"; startedAt: string; completedAt: string;
  sourcesRead: Omit<Source<never>, "items">[]; facts: string[]; decisions: string[];
  actionIds: string[]; stopReason: string | null; outcome: string;
  humanVerificationMinutes: number | null; humanCorrections: number;
  managementMinutes: Partial<Record<"explanation" | "preparation" | "approval" | "correction" | "verification" | "reconciliation", number>>;
  measurementMode: "MANUAL_BASELINE" | "AI_ASSISTED" | null;
  cost: number | null; boundaryViolations: number; reproducibility: string;
  memberSummary?: { total: number; staffExcluded: number; activeMembers: number; unknownEligibility: number; seenMemberIds: number };
}
export interface Settings { eventLeadDays: number; maxSourceAgeMinutes: number; autoSendAllowed: false }
export interface Ledger {
  schemaVersion: 1; version: number; baselineAt: string | null; seenMemberIds: string[];
  runs: Run[]; actions: Action[]; settings: Settings;
  audit: { at: string; actionId: string; operation: string; reason: string }[];
  rate: Record<string, { start: number; count: number }>;
}
export const emptyLedger = (): Ledger => ({
  schemaVersion: 1, version: 0, baselineAt: null, seenMemberIds: [], runs: [], actions: [], audit: [], rate: {},
  settings: { eventLeadDays: 3, maxSourceAgeMinutes: 60, autoSendAllowed: false },
});
export interface Provider<T> { read(now: string): Promise<Source<T>> }
export interface Providers {
  members: Provider<Member>; gmail: Provider<Mail>; events: Provider<CatalogItem>; content: Provider<CatalogItem>;
}
export interface Sender {
  enabled: boolean;
  send(action: Action): Promise<{ id: string }>;
  readBack(action: Action): Promise<{ confirmed: boolean; id: string | null }>;
}
export interface Store {
  read(): Promise<Ledger>;
  transact<T>(fn: (ledger: Ledger) => T): Promise<T>;
}
