# RIALA source of truth

| Fact | Source |
| --- | --- |
| Current member state | RIALA member source |
| Sent recipient, timestamp, subject, thread | Gmail sent metadata |
| Event and content catalog | Freshest configured source, with reference |
| Operating rules | Approved operations documentation |
| Planner run, action, approval, and readback | Durable Planner Store |

The legacy FANTS record is historical and exception-only. Missing, stale, incomplete, or disconnected sources are surfaced as blockers; they are never replaced with dummy success data.

