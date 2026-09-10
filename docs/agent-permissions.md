# Agent permissions

The Planner may read the configured RIALA member, event, and content sources; classify explicit interests; create drafts; persist evidence and run state; and present approval work.

Gmail read (v0, 2026-09-11) widens what was previously sent-metadata only. The Planner may now read **message bodies** in the operator's own mailbox, because deciding whether a reply is owed requires reading what was said. The boundary that replaces "sent metadata only" is: a bounded window (inbox and sent, default seven days, capped at 200 messages) under `gmail.readonly` and nothing else. It is still not permission to read all mail — no unbounded history, no other mailbox, no attachment contents.

The Planner may send an external email only after an authenticated operator explicitly approves the exact recipient, subject, body, evidence fingerprint, and revision. It must re-read and read back. It may not infer identities, create addresses, read outside the bounded Gmail window, expose tokens, auto-send, retry an unknown result, delete history, contact legacy FANTS as a default channel, or create paid integrations.

Gmail reading never mutates: no send, draft, modify, trash, or label change, and reading a message does not clear its UNREAD label. This is enforced by the token's scope, not only by the code. Message bodies are stored server-side for the Planner and are never returned to a browser, written to a log, or included in a scheduler response; classification evidence names the term that matched rather than quoting the passage around it.

