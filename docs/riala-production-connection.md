# RIALA Production connection — 2026-09-10

This deployment hardens the read-only connection path. It does **not** certify a successful real-data baseline.

## Observed sources

- Production: https://kotorinu-s-projects.vercel.app/area/riala
- Members: https://community.riala.jp/admin/users shows 21 general-user rows (17 active, 4 unpaid). Staff management is permission-disabled; CSV export is marked not yet available. This page does not expose a stable ID/email for every row. Member profile links elsewhere contain UUIDs, but name-based joins do not establish identity or completeness. These browser observations are not a production baseline.
- Events: https://community.riala.jp/events shows two upcoming September events, with title, description, schedule and anchored links. Backend IDs, source modification timestamps and complete export are unconfirmed. The event administration menu is permission-disabled.
- Content: the RIALA home links to https://riala-learning.vercel.app/ with 123 displayed content entries and explicit categories/tool/use-case tags. Per-content links exist; modification timestamps and a supported catalog feed are unconfirmed. The learning domain is now allowed for recommendation links. No catalog was copied into the repository.
- Available GitHub searches did not locate the community backend or learning catalog. The similarly named public `kawakami-yuya/riala` repository contains no application source at its root. Do not assume it is the deployed backend.

## Minimal remaining setup

1. A dedicated durable Redis REST database supporting GET and EVAL/CAS, with no eviction/expiry for `riala:planner:v1`. Existing Vercel storage listed only `kotone-staff-memory` Blob; no Redis was connected or available in the displayed team inventory. Do not substitute Blob or FileStore. Set `RIALA_REDIS_REST_URL` and sensitive `RIALA_REDIS_REST_TOKEN` for Production. No service purchase is authorized by this document.
2. RIALA backend owner provides an authenticated read-only endpoint/export, ideally a consistent snapshot of members plus separate event/content endpoints. Confirm pagination is exhausted, stable database IDs, role/status semantics and timestamps. A browser adapter requires a separately authorized runtime and session renewal; a logged-in desktop tab cannot be used directly by a Vercel function. Do not treat a hand-copied browser list as LIVE or automate scraping by default.
3. Gmail OAuth client and user consent with only `https://www.googleapis.com/auth/gmail.readonly`, offline access and a refresh token. Set sensitive `RIALA_GMAIL_CLIENT_ID`, `RIALA_GMAIL_CLIENT_SECRET`, `RIALA_GMAIL_READ_REFRESH_TOKEN`. The read token must not include send/modify scopes. No send refresh token is required. Read scope is account-wide at Google's authorization boundary; application queries are limited to `in:sent RIALA`, 90 days, <=200 messages and metadata only. `gmail.metadata` cannot use the required `q` filter: https://developers.google.com/gmail/api/reference/rest/v1/users.messages/list . Offline authorization: https://developers.google.com/identity/protocols/oauth2/web-server#offline . Never put tokens into this document, PRs, or chat.

## Source contract and unknowns

`JsonSourceProvider` remains a contract adapter until an actual authenticated endpoint is supplied and verified. Required envelope: `sourceId`, actual `readAt`, `complete: true`, unique-ID `items`. Truncated, stale (>60 minutes), invalid or failed reads must not establish readiness. URL/token presence is only configuration, not evidence of connection.

Member `registeredAt`, `email`, `emailVerified`, `active`, and `isStaff` may be null. `interests` is [] unless explicit evidence exists. Unknown eligibility never qualifies for automated candidate creation. Unknown registration date requires review. Catalog `sourceUpdatedAt` may be null; do not replace it with observation time. Unknown summaries can be `UNKNOWN`, unknown topics [] and unknown URLs null. Missing event start time cannot qualify for an event invitation.

## One-time production baseline verification

After Redis and real member/Gmail sources are ready, redeploy, authenticate through the operator form and click **RIALAをチェック exactly once**. Check the saved Run, then reload through a separate request. Readiness is based on the most recent complete/fresh read; Store readiness requires a successful ledger read. Event/Content failures stop only their recommendations and remain recorded as decisions; they do not block the member baseline.

Expected: `baselineAt` persisted, `memberSummary` totals/staff/active/unknown counts, `seenMemberIds` count, exact Source `readAt`, Gmail masked account/count/latest timestamp/scope, and zero initial welcome actions. Do not seed fake members or real PII fixtures into Production. If no later real new member exists, use fixture tests only and label the result accordingly.

## Security and remaining send restriction

Operator authentication uses an 8-hour HMAC cookie with HttpOnly, Secure and SameSite=Strict. Mutation routes verify Origin and require JSON; malformed JSON never reflects the supplied text. Login/scan/operator rates use the persistent store, with 429 and Retry-After. The public configuration response exposes booleans only. Gmail tokens, bodies and provider errors are not logged. `RIALA_SEND_ENABLED=false` is mandatory for this phase. The disabled-send route rejects approval before reads or external effects.

Tests include API origin/auth/expiry/tampering/malformed JSON/rate limits, independent Redis readers against a mocked REST store, FileStore prohibition on Vercel, no-effect send OFF, real Gmail adapter metadata/profile requests with mocked Google responses, unknown fields, baseline and optional source failures. These are local tests, not proof of real Redis/Gmail/RIALA connectivity. Production authenticated E2E, actual account consent, live baseline, real-new-member identity and external readback remain unverified until their dependencies exist. Do not enable SEND based on this patch.
