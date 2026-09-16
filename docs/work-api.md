# Central Work API and Worker

Endpoint: `https://kotorinu-s-projects.vercel.app/api/riala/work`

GET returns `version`, `tasks`, `goals`, `runs`, `audit`, and the separately
versioned `execution` record. All data is server-side Redis; no AI-specific DB.
POST accepts JSON with `command` and the latest ledger `version`.
An interoperable OpenAPI description is at `/work-openapi.json`.
UI writes retain a requestId across uncertain retries to prevent duplicate creation.

| Credential | Commands |
| --- | --- |
| External AI Bearer WORK_OS_API_SECRET | initialize, createTask, updateTask, createGoal, updateGoal |
| Worker Bearer WORK_OS_WORKER_SECRET | claim, result |
| Existing operator Cookie | initialize, Task/Goal writes, accept, retry |

createTask: title, optional area, description, deadline, estimateMinutes,
definitionOfDone[], goalId, aiCapability. Unknown deadlines/estimates stay null;
new tasks enter BACKLOG. Their real execution time is set in task details.

createGoal: title, desiredState, achievementCriteria, optional targetDate,
parentId, horizon. Parent must exist. Achievement criteria are mandatory.

updateTask: id and supplied title/description/definitionOfDone/deadline/status.
Archive preserves the entity. updateGoal: id and title/achievementCriteria/status.
Existing goal target dates are not overwritten. No destructive delete endpoint.

claim: provider and optional taskId. One durable lease, fifteen minutes.
Missing description/criteria, known blockers, or saved completion records stop
execution. Expired work is not automatically retried.

result: run id, returned claim, output, evidence[], or blocker. Correct live
claim is mandatory. Output enters REVIEW, never automatic task completion.

accept: run id, factsChecked=true. Requires output/evidence, latest run and
operator authentication. AI_EXECUTE may finish; Draft/Hybrid/Decision does not
finish the human's remaining task. retry: run id, previousExecutionChecked=true;
only the latest blocked/expired attempt can create a new run, retaining history.

Execution sync: `/api/riala/work/execution`, operator Cookie only. GET returns
version/snapshot/updatedAt; POST accepts version and a serialized execution
snapshot. Closed-day history is append-only. 409 stops overwrites. A failed
write is not transport-retried because its outcome may be uncertain.

## Provider contract

The worker makes one HTTPS POST to an explicitly configured provider with
runId, task (title, description, definitionOfDone, sourceLinks, requiredInputs),
and permissions: externalSend=false, purchase=false, completionRequiresReview=true.

Expected response: `{ "output": "actual artifact", "evidence": ["actual source references"] }`.
There is no default paid LLM endpoint and no invented output when unavailable.
Configure only a provider approved for these task inputs, costs and permissions.

Set WORK_OS_URL, WORK_OS_WORKER_SECRET and WORK_OS_PROVIDER_URL in the local
environment. Optional WORK_OS_PROVIDER_TOKEN and WORK_OS_PROVIDER_NAME.

```powershell
node scripts/work-worker.mjs
```

One invocation handles one run and exits. It does not register a recurring
automation, send business messages, purchase services or spawn agents.
After a result-write failure, inspect the durable run before another attempt.
Do not log tokens or private outputs.

## Storage and installation

Retain the existing writable Redis REST credentials. Canonical keys are
work:core:v1 and work:execution:v1; no TTL, no FileStore fallback on Vercel.
RIALA, Calendar and Gmail keys remain unchanged.
Local restricted API credentials are in gitignored `.env.work-api.local`.
Neither `.env*` nor tmp/ is uploaded by Vercel.

The app provides a PWA manifest, PNG icons and a network-only Service Worker.
Offline navigations show a reconnection screen; personal/API responses are not
cached or replayed. Actual device installation remains a device-level check.

Calendar write scope is not added. `/api/riala/work/calendar` exports only
explicitly scheduled, centrally saved overrides as ICS. Import in Calendar
settings; edit existing Calendar events there. Export does not mark them synced.
