# RIALA Planner operations

Use **RIALAをチェック** to read all configured sources. The first run creates a baseline and records the seen member IDs; it does not mass-send welcome messages. Later runs prepare new-member, event, and daily content actions using stable business keys.

Review the approval queue. Only HIGH confidence exact identities can be batch-selected. MEDIUM and LOW identities remain human-review or stopped. Each card shows the recipient mask, evidence, recommendation reason, draft, and next action. Editing requires a reason and an explicit facts check. Hold and skip are durable decisions.

The send path re-reads sources immediately before every external effect, claims the action durably, sends once, and reads Gmail back. A timeout or failed readback is **結果不明**; do not retry until the external history is checked. `AUTO_SEND_ALLOWED` is false in v0.

If an integration is unavailable, configure the server-side adapter and durable store before treating the workflow as live. Snapshot adapters are useful for tests and review but can never send.

## Redis activation

The server-only `@upstash/redis` client uses the complete `KV_REST_API_URL` / `KV_REST_API_TOKEN` pair supplied by the Vercel integration. Complete legacy `RIALA_REDIS_REST_*` and `UPSTASH_REDIS_REST_*` pairs are also accepted. TCP URLs and read-only tokens cannot configure the writable store. No credentials are returned by readiness.

Planner JSON remains at `riala:planner:v1`. Atomic Lua compare-and-swap checks the exact prior JSON before replacing it. No TTL is assigned. Concurrent conflicts re-read and retry at most six times; uncertain network writes fail closed without transport retries. Transaction callbacks must have no external effects.

Activation requires Production write, read, update, competing CAS, and later read with TTL=-1. The temporary `/api/ops/redis-verification` handler requires a signed operator session, Production, and SEND=false; it touches only its fixed synthetic verification key, expires on 2026-09-11, and must be removed after verification. Environment configuration alone is not READY. The free database must retain eviction-disabled settings; reaching its capacity must stop writes rather than evict Planner history.

