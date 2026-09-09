# RIALA Planner operations

Use **RIALAをチェック** to read all configured sources. The first run creates a baseline and records the seen member IDs; it does not mass-send welcome messages. Later runs prepare new-member, event, and daily content actions using stable business keys.

Review the approval queue. Only HIGH confidence exact identities can be batch-selected. MEDIUM and LOW identities remain human-review or stopped. Each card shows the recipient mask, evidence, recommendation reason, draft, and next action. Editing requires a reason and an explicit facts check. Hold and skip are durable decisions.

The send path re-reads sources immediately before every external effect, claims the action durably, sends once, and reads Gmail back. A timeout or failed readback is **結果不明**; do not retry until the external history is checked. `AUTO_SEND_ALLOWED` is false in v0.

If an integration is unavailable, configure the server-side adapter and durable store before treating the workflow as live. Snapshot adapters are useful for tests and review but can never send.

