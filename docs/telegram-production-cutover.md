# Telegram production cutover

This packet configures the existing OpenClaw receiver for the already deployed
Website production API. It does not create, replace, or run a Telegram bot,
webhook, polling loop, Worker, D1 database, or Discovery process.

## Immutable artifact

Install the patch artifact that contains `automation/openclaw/telegram-target.ts`.
Do not rewrite `v1.0.0`; record the new commit/tag selected by Release Engineering
in the Gateway change ticket before changing its package reference.

## Exact environment files

Create two service-account-owned files outside Git, each mode `0600`, and make their
state directories mode `0700`. They must not be merged, mounted into each other, or
loaded by the same service process.

| Environment | `WAAGD_API_ORIGIN`                        | `WAAGD_TELEGRAM_INGRESS_ENVIRONMENT` | State directory                       |
| ----------- | ----------------------------------------- | ------------------------------------ | ------------------------------------- |
| staging     | `https://waagd-staging.waagd.workers.dev` | `staging`                            | a dedicated staging-only directory    |
| production  | `https://weareallgonnadie.com`            | `production`                         | a dedicated production-only directory |

Each file also needs its matching `WAAGD_API_WRITE_TOKEN`, numeric
`WAAGD_TELEGRAM_ALLOWED_IDS`, and, only if the selected Website origin requires it,
the matching Cloudflare Access service credentials. Never copy a production token or
state directory into the staging service. The plugin rejects every origin other than
the two table values and rejects an origin/environment mismatch before registering
its hooks.

## Gateway change

1. Stop or reload the existing OpenClaw Gateway using its approved operator process.
   Do not start `automation/cli.ts telegram`, `getUpdates`, another webhook, another
   bot, or a second Gateway consumer.
2. Replace only the linkable WAAGD plugin artifact and point the existing Gateway
   service at the production-only private environment file. Retain the existing
   `@waagd_bot` receiver and its current owner/channel configuration.
3. Confirm startup logs show no target-validation error. A missing/incorrect
   `WAAGD_TELEGRAM_INGRESS_ENVIRONMENT`, non-HTTPS origin, non-root path, credential
   URL, query, fragment, or unapproved host must stop plugin registration.
4. Keep automatic publishing paused if desired: Telegram owner submissions use the
   separate `telegram_paused` policy and remain allowed while `auto_paused=true`.

## Controlled acceptance

Use one harmless public URL from an allowed owner in the existing direct chat. Verify
one authenticated `POST /api/posts`, one production feed card, and the returned
`https://weareallgonnadie.com/?post=<uuid>` permalink. Redeliver the identical
Telegram event: it must reply `ALREADY EXISTS` (or replay the saved receipt) and
create no second row. Then verify a non-owner, a group message, and an uploaded file
perform no publication; media must receive the existing unsupported-media reply.

If target validation or production acceptance fails, restore the previous plugin
artifact and the staging-only environment file through the existing Gateway service
manager. Preserve each state directory and receipts; do not delete D1 data or use a
second polling consumer.
