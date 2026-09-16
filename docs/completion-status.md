# Work OS completion status — 2026-09-17

The requested scope is the entire Work OS: daily task management, central durable
data, Calendar, AI execution, and interchangeable external AI access. This is
The implemented application scope is deployed. Unconfigured external sources
and an unattended AI provider remain explicit dependencies below.

## Verified this session

- The existing task/goal/calendar/execution test suite passes locally.
- Production public `/api/riala` reports operator authentication and durable
  storage configured. An anonymous request cannot verify a ledger read.
- Production public configuration reports members, events and content sources
  unconfigured. Their dependent recommendations cannot run on real data.
- Planner Gmail reads can now use the encrypted app OAuth connection with exact
  `gmail.readonly` scope. The adapter still reads only RIALA sent metadata for
  90 days, at most 200 messages. It never borrows this grant for sending.
- Logout clears operator, Calendar and Gmail device sessions even if the store
  is missing or the operator session expired. Origin checks remain mandatory.

## Still required

| Requirement | Remaining work / evidence |
| --- | --- |
| Central Task and Goal CRUD | Implemented in work:core:v1 with version conflicts, requestId deduplication, Task/Goal UI registration/editing and archive/state transitions. Production saved 45 approved tasks and 13 goals; a separate authenticated request read them back. |
| Calendar | Authenticated production TODAY displayed the refreshed current Calendar and its events. Unattended scheduled success remains unverified. Direct writes require a write grant; confirmed saved time blocks can be exported as ICS. |
| AI Worker | Durable queue, single claims, fifteen-minute leases, results/evidence, blockers, human review and retained retry history implemented. The current Codex task claimed existing t-sales-004, saved its actual feedback-mapping artifact and read it back as REVIEW at ledger version 3. A reusable automatic provider endpoint is not configured; scripts/work-worker.mjs provides the adapter without a default paid service. |
| External AI | Separate scoped Bearer credentials configured as Sensitive server settings. Work API and OpenAPI description implemented; external AI cannot accept artifacts or send messages. Authenticated live central initialization/readback and Worker claim/result/readback verified. |
| RIALA sources | Obtain owner-supported read endpoints/exports for members, events and content, with stable IDs, timestamps, completeness and source references. Credentials belong only in server environment settings. |
| RIALA live baseline | Authenticated scan, saved Run and a separate-request ledger read. Tests with mocked Google/Redis do not verify a production baseline. |
| PWA | Manifest, valid PNG icons and network-only Service Worker implemented; production assets return 200. Actual device installation/offline transition still needs a device-level check. No API cache or offline mutation replay. |

Production-target deployments and central data/artifact writes were performed. No external business message was sent. External
messages remain individually human-approved; `autoSendAllowed` stays false.

## Execution history and planning

The execution provider now loads/saves work:execution:v1. Existing device state
is imported when the central record is empty; a differing device copy is
preserved before adopting central state. Version conflicts stop uploads rather
than overwriting another device. Closed-day history is append-only. Actual
first-device migration was verified through the authenticated production UI:
GOAL TREE confirmed the central save, and TASK MAP subsequently loaded the
execution record from central storage. The existing saved operator credential
was used through the browser login; it was not extracted or rotated.

All Task/Goal consumers now read the shared WorkProvider. Task details use the
shared reschedule flow (including ending the prior work session and work-date
sync). Explicitly scheduled Backlog tasks with a confirmed deadline enter the
execution plan. Dates, estimates, training achievements and user progress are
never fabricated. Calendar change overrides can be exported as ICS; direct
Google writes remain unavailable under the existing read-only grant.

Local tests: 200 passing, including core/API role separation, stale version
conflicts, uncertain-create deduplication, run leases/evidence, six feedback
links and ICS JST conversion/escaping. Local and remote production builds
passed. Browser verification observed the task and goal forms, the correct
current week (9/13–9/19), authenticated central data and execution migration,
and the real t-sales-004 artifact with all six feedback mappings and evidence.
No test task or invented goal was registered in production. Unattended
provider execution is not covered by that verification.

Runtime commit 3e03512 was pushed to main. Its production deployment
dpl_CbmE94SLPrapRsXAE4YqAHzcdqVa is Ready; the canonical application at
https://kotorinu-s-projects.vercel.app serves the verified application.

The older production-connection notes describe earlier setup states. Read the
later Redis/Calendar operational runbooks before concluding that those services
were never connected. The current anonymous Planner readiness does not report
the independently stored Calendar or Gmail read connection status.
