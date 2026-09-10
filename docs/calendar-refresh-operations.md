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

## Connecting Google (authorization-code flow, added 2026-09-10)

There are two ways to provide the read credential. Either is sufficient; the connected one wins when both exist.

**A. Connect in the app (preferred).** `POST /api/calendar/connect` (operator-authenticated, same-origin) returns a Google consent URL; TODAY shows a 「Google Calendarを接続」 action when an OAuth client and encryption key are configured and nothing is connected yet. Google returns to `/api/calendar/callback`, which exchanges the code and stores the refresh token **encrypted** in the Calendar Redis record. The refresh token never reaches the browser and is never written to a file.

- Redirect URI (register this exact string): `<RIALA_APP_ORIGIN>/api/calendar/callback`, e.g. `https://kotorinu-s-projects.vercel.app/api/calendar/callback`. It is built from `RIALA_APP_ORIGIN`, not from the request Host, so a spoofed Host cannot redirect a grant.
- Scope requested: `https://www.googleapis.com/auth/calendar.events.readonly` only. `access_type=offline` and `prompt=consent` so a refresh token is actually issued. A response granting anything broader — including `calendar` (write) or any Gmail scope — is refused and **not** stored.
- PKCE S256: the verifier is generated server-side, stored encrypted, and never sent to Google; only its challenge is.
- `state` is random 32 bytes; only its SHA-256 is persisted, it expires in 10 minutes, it is bound to the browser's Calendar-reader session, and it is consumed inside the same compare-and-swap that reads it, so a replayed callback finds nothing to redeem.
- Requires `CALENDAR_TOKEN_KEY`: 32 bytes, base64. There is no default and no fallback — without it, connecting is refused rather than storing a credential in the clear. Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` and set it in the provider UI only.

**B. Environment refresh token.** Set `GOOGLE_CALENDAR_REFRESH_TOKEN` as before. Used when no connection is stored, so an existing manual provisioning keeps working.

Rotation/revocation: clear the stored connection (or revoke the grant at https://myaccount.google.com/permissions) and reconnect. Changing `CALENDAR_TOKEN_KEY` invalidates the stored token, which then fails closed to the last good snapshot until reconnected — it does not silently read as empty.
