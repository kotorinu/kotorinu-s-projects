<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Product map

- AI Work OS is a decision surface for daily execution. RIALA Planner exists to reduce operator explanation time, not to add another task dashboard.
- RIALA North Star: read current member, Gmail, event, content, and operating-rule sources; prepare only evidence-backed work; return only human decisions.
- Keep changes scoped to RIALA unless a shared primitive is required. Do not redesign TODAY, TASK MAP, GOAL TREE, PDCA, Sales, GENESIS, or Calendar UI.

## Source of truth

- RIALA member state comes from the current RIALA source.
- Sent history comes from the external channel (Gmail). Legacy FANTS is historical/exception-only.
- Events and content come from their freshest configured source and retain a source reference.
- Planner runs and approvals live in the configured durable store. Google Calendar remains the WHEN source for existing planning UI.
- If a source is missing, stale, incomplete, or ambiguous, show the blocker and stop the dependent action. Never manufacture an email, name, URL, event, or duration.

## Permissions and safety

- Read scope is limited to RIALA-related Gmail sent metadata. Never expose access or refresh tokens to the client or commit secrets.
- External send is always human-approved in v0. `autoSendAllowed` must remain false.
- Approval binds recipient, body, evidence, source fingerprint, and revision. Re-read sources immediately before send and read back the external state afterward.
- Unknown send results are not retried. Duplicate risk, identity uncertainty, permission failure, or readback failure stops the action.
- Do not add a paid service, broaden permissions, delete history, or send external messages without explicit authorization.

## Testing and definition of done

- Run `npm.cmd test`, `npm.cmd run lint`, and `npm.cmd run build` for RIALA changes when the environment permits.
- Cover high/medium/low identity, evidence-backed welcome drafts, already-sent exclusion, event duplicate prevention, no-match content, stale sources, approval mismatch, unknown send result, and readback.
- A feature is complete only when read → decide → evidence → approval → action → readback → durable state is connected, and unavailable integrations are visibly stopped.
- Keep operational notes in `docs/product-north-star.md`, `docs/source-of-truth.md`, `docs/riala-operations.md`, `docs/agent-permissions.md`, and `docs/postmortems.md`.

