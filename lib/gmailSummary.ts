import type { ClassifiedThread, RialaRelevance, ReplyState } from "./server/gmailRead";

/**
 * The projection that may leave the server.
 *
 * Message bodies are deliberately absent. The planner reads them server-side;
 * a browser only needs to know what is waiting and why it was flagged. Keeping
 * bodies out of every response also keeps them out of anything that might log
 * one.
 */
export interface GmailThreadSummary {
  threadId: string;
  subject: string;
  relevance: RialaRelevance;
  replyState: ReplyState;
  lastMessageAt: string;
  lastIncomingAt: string | null;
  lastOutgoingAt: string | null;
  messageCount: number;
  unreadCount: number;
  participantCount: number;
  evidence: { rule: string; detail: string }[];
}

export interface GmailSummary {
  status: string;
  reason: string | null;
  /** Which step failed, its HTTP status, and the category. Never mail content. */
  diagnostic: { stage: string; httpStatus: number | null; category: string } | null;
  stale: boolean;
  readAt: string | null;
  accountMasked: string | null;
  window: { start: string; end: string; days: number } | null;
  counts: {
    messages: number;
    threads: number;
    relevant: number;
    possible: number;
    unknown: number;
    notRelevant: number;
    awaitingOurReply: number;
    unread: number;
  };
  threads: GmailThreadSummary[];
}

export function summarizeThread(thread: ClassifiedThread): GmailThreadSummary {
  return {
    threadId: thread.threadId,
    subject: thread.subject,
    relevance: thread.relevance,
    replyState: thread.replyState,
    lastMessageAt: thread.lastMessageAt,
    lastIncomingAt: thread.lastIncomingAt,
    lastOutgoingAt: thread.lastOutgoingAt,
    messageCount: thread.messageIds.length,
    unreadCount: thread.unreadCount,
    participantCount: thread.participants.length,
    evidence: thread.evidence,
  };
}

const countBy = (threads: ClassifiedThread[], relevance: RialaRelevance) => threads.filter(t => t.relevance === relevance).length;

export function summarizeGmail(result: {
  record: { readAt: string; accountMasked: string; window: { start: string; end: string; days: number }; messages: unknown[]; threads: ClassifiedThread[] } | null;
  status: string; reason: string | null; stale: boolean; readAt: string | null;
  diagnostic?: { stage: string; httpStatus: number | null; category: string } | null;
}): GmailSummary {
  const record = result.record;
  const threads = record?.threads ?? [];
  // Everything the planner might act on first: relevant or possibly relevant,
  // most recent first. UNKNOWN stays in the counts rather than being hidden.
  const ranked = [...threads].sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
  return {
    status: result.status,
    reason: result.reason,
    diagnostic: result.diagnostic ?? null,
    stale: result.stale,
    readAt: result.readAt,
    accountMasked: record?.accountMasked ?? null,
    window: record?.window ?? null,
    counts: {
      messages: record?.messages.length ?? 0,
      threads: threads.length,
      relevant: countBy(threads, "RIALA_RELEVANT"),
      possible: countBy(threads, "POSSIBLY_RIALA"),
      unknown: countBy(threads, "UNKNOWN"),
      notRelevant: countBy(threads, "NOT_RIALA"),
      awaitingOurReply: threads.filter(t => t.replyState === "AWAITING_OUR_REPLY").length,
      unread: threads.reduce((total, t) => total + t.unreadCount, 0),
    },
    threads: ranked.slice(0, 100).map(summarizeThread),
  };
}
