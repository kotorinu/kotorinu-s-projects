# Gmail Read v0 — activation runbook

Status on 2026-09-11: implemented and tested; **production blocked** on Google Cloud steps that only the operator can perform. Read-only throughout. No send, draft, modify, trash, or label change exists in this path.

## What it is for

So that the operator does not have to explain incoming mail out loud. The planner reads its own signal: what arrived, from whom, about what, and whether it is still waiting on a reply.

## Scope

`https://www.googleapis.com/auth/gmail.readonly`, and exactly that. Bodies are the point — `gmail.metadata` cannot read them, and deciding whether a reply is owed requires reading what was said. A grant that comes back with anything else, including `gmail.modify`, `gmail.compose`, `gmail.send`, or full `mail.google.com`, is refused and **not stored**.

This is a separate connection from Calendar. Calendar's grant stays `calendar.events.readonly`; no Gmail scope is ever added to it. Revoking or losing one connection does not affect the other, and the two encrypted tokens use different keys and different AAD.

## Read window

Inbox **and** sent, last seven days, capped at 200 messages over at most 8 pages. Sent mail is inside the window deliberately: reading only the inbox would make every thread look unanswered. No RIALA document specifies a window, so seven days is the conservative default (the existing sent-history reconciliation separately uses 90 days and is unchanged).

A read is LIVE only when pagination finished. A repeated page token, a duplicate message id, an unparseable message, or an HTTP failure discards the whole attempt — half an inbox looks exactly like a quiet inbox.

## Storage

Two Redis keys, on the same server-only `@upstash/redis` client and compare-and-swap the Planner store was verified with:

- `gmail:connection:v1` — the encrypted refresh token, its scope, and when it was connected. Also holds the single-use pending OAuth state.
- `gmail:last-good:v1` — the last **successful** read, plus the last failure and the scheduler's invoked/succeeded timestamps.

A failed read never overwrites the last good one; it records the failure beside it and the UI says the data is stale and why.

## Manual steps in Google Cloud (operator only)

1. **APIとサービス → ライブラリ → Gmail API → 有効にする.** Same project as the Calendar client.
2. **認証情報 → 既存のOAuth 2.0 クライアント ID を開く → 承認済みのリダイレクト URI に追加**:
   `https://kotorinu-s-projects.vercel.app/api/gmail/callback`
   The Calendar redirect URI stays as it is; this is an addition, not a replacement.
3. **OAuth同意画面 → データアクセス（スコープ）→ `.../auth/gmail.readonly` を追加.** Gmail readonly is a restricted scope: while the app is in testing it works for the listed test users, and Google requires verification before it can be offered to others. This app has one user.
4. **Vercel → Settings → Environment Variables (Production)**: add `GMAIL_TOKEN_KEY`, 32 bytes base64 —
   `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.
   Optionally `GMAIL_CLIENT_ID` / `GMAIL_CLIENT_SECRET` to give Gmail its own OAuth client; otherwise the Calendar client is reused.
5. Redeploy, then in the app: RIALA area → operator login → **Gmailを接続** → consent → back to the RIALA page.

## Scheduler

`/api/cron/gmail` at `20 19 * * *` UTC = 04:20 JST, twenty minutes after the Calendar read so the two do not contend. Bearer `CRON_SECRET` only; a query-string secret is refused. The response carries counts and timestamps and never a subject, an address, or a line of a message.

Vercel Hobby allows two cron jobs and may invoke a daily job up to 59 minutes late, so 04:20 is a target, not a guarantee. As with Calendar, an invocation is not evidence: only `scheduled.lastSucceededAt` after an unattended run counts.

## What it deliberately does not do

It does not decide that a reply is unnecessary. Reply state is reported as observed — their message is newest, ours is newest, or only ours exists — and the planner decides. Relevance is `RIALA_RELEVANT` / `POSSIBLY_RIALA` / `UNKNOWN`, each with the evidence that produced it; `NOT_RIALA` is reachable only through an explicit operator exclusion, so nothing is dropped on a guess.
