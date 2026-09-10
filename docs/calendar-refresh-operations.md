# Calendar freshness — activation runbook

Status on 2026-09-10: local implementation and tests complete; **production blocked**. Main at investigation: `565296d4c5170c9004810358ff731207fa3e5d96`. No activation write is authorized by this document.

## Schedule and precision

`vercel.json` registers `/api/cron/calendar` at `0 19 * * *` in UTC: the following JST day at 04:00. Japan has no DST. The current Vercel team is Hobby; it may invoke a daily cron anywhere from the scheduled minute through 59 minutes later. It does not meet the hard requirement. Pro has per-minute scheduling; invocation minute is distinct from successful Google completion time. Do not claim that changing the plan guarantees successful completion by 04:00:00. The user's examples allow readAt 04:01/04:02; record the actual completion time. If an absolute completion deadline is intended, agree a lead time/SLA before activation.

Official source: https://vercel.com/docs/cron-jobs/usage-and-pricing . Vercel does not retry failed cron invocations: https://vercel.com/docs/cron-jobs/manage-cron-jobs . Recovery is on open/focus or manual retry.

## One read service, three triggers

- Scheduled: force a complete read once per successful JST day. An immediately preceding completed manual read does not suppress the 04:00 read.
- TODAY open/foreground: load saved data immediately, then refresh only if 15 minutes old, failed, incomplete in coverage, or a prior worker expired. No recurring Google polling.
- Calendar更新: bypass the freshness threshold. A shared 60-second cooldown bounds repeated manual/failed attempts. A 90-second Redis lease prevents overlapping Google reads; an expired worker cannot overwrite the next worker. A busy client performs at most three cache-only follow-ups.

The fixed read window is JST today-1 through today+7 inclusive; the API sends start midnight +09:00 through midnight after the final day (exclusive). Recurrences expand into instances. All pages must finish; repeated tokens, duplicate IDs, invalid events, more than 20 pages/5,000 day segments, HTTP failures or the shared 30-second Google deadline reject the whole result. Timed offsets convert to JST; multi-day and all-day events split by day with original IDs. Calendar-only events and existing color mapping remain intact.

## Storage and authentication

Reuse the approved Redis REST connection (`RIALA_REDIS_REST_URL`, `RIALA_REDIS_REST_TOKEN`), supporting HTTPS GET and EVAL/CAS. Calendar uses `calendar:read:v1:<source-hash>`; Planner keeps `riala:planner:v1`. Neither key expires; do not enable eviction. Calendar's snapshot, readAt, inclusive coverage and sourceMode=LIVE commit atomically only after validation. Failure metadata and invocation/success times are stored separately in the same record. Failed reads retain snapshot bytes and prior readAt.

Set Production-only secrets after approval: `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET`, `GOOGLE_CALENDAR_REFRESH_TOKEN`, `CRON_SECRET` (random >=32 characters). Optional `GOOGLE_CALENDAR_ID` defaults to primary; timezone is fixed to Asia/Tokyo. Obtain an independent read-only Google grant (`calendar.events.readonly`, or `calendar.readonly`), never a write token. Google endpoint reference: https://developers.google.com/workspace/calendar/api/v3/reference/events/list . No description, attendees or email addresses are requested by this read path.

The existing operator login also issues a 30-day Calendar reader cookie. It is limited to Calendar reads/cache refresh, has HttpOnly/Secure/SameSite=Strict flags, and cannot authorize RIALA operations. Operator access remains 8 hours. Login is needed on a new/expired device; Google refresh credentials never reach the browser. Logout/secret rotation revokes access as described in agent-permissions.md. Authenticated POST refresh checks Origin and JSON. Private response headers are no-store. Cron is Bearer-only and returns metadata, never event details. No real credential is included in tests.

## Production acceptance after approval

1. Resolve the scheduler precision block; do not silently deploy Hobby as a 04:00 guarantee.
2. Provision/approve durable Redis and set server secrets through the provider UI, not chat. Approve the reviewed patch for GitHub/main and Production deployment. Keep RIALA_SEND_ENABLED=false.
3. Verify the registered job in Production. Invoke its authenticated path once using the platform's Run action (no real event edits). Confirm actual Google read, successful Redis CAS, independent read, sourceMode, coverage and readAt. This manual invocation is not evidence of the automatic 04:00 run.
4. On an authenticated device, open TODAY, observe saved data, manual-refresh existing events, reload, and verify the new readAt/Calendar times and colors. Record aggregate counts/timestamps only.
5. After the next scheduled 04:00, verify the scheduler log and lastInvokedAt/lastSucceededAt, then TODAY/reload. Only then mark Calendar REFRESH PASS. Check failures with local fixtures, never by editing a user's real event or revoking production credentials for a test.

If Google/Redis fails, TODAY retains last-good in-memory data; a reachable Redis returns last successful data across reloads. If Redis is also unavailable during a new page load, only the bundled static snapshot is available. It stays explicitly labelled Snapshot; this is a known offline limit, not live freshness.
