# RIALA source of truth

| Fact | Source |
| --- | --- |
| Current member state | RIALA member source |
| Sent recipient, timestamp, subject, thread | Gmail sent metadata |
| Event and content catalog | Freshest configured source, with reference |
| Operating rules | Approved operations documentation |
| Planner run, action, approval, and readback | Durable Planner Store |

The legacy FANTS record is historical and exception-only. Missing, stale, incomplete, or disconnected sources are surfaced as blockers; they are never replaced with dummy success data.



Gmail incoming signal comes from a complete read of the operator's own mailbox over a bounded JST window (inbox and sent, seven days by default), persisted atomically under `gmail:last-good:v1` with the encrypted connection under `gmail:connection:v1`. A read is LIVE only after pagination finishes; a partial, looping, or unparseable read never replaces the last good one. Direction, reply state, and RIALA relevance are derived and carry their evidence. Gmail establishes what arrived and whether it has been answered — it does not decide what to do, and it never concludes that no reply is needed.
