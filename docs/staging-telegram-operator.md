# WAAGD staging Telegram acceptance — operator packet

Scope: `waagd-staging` only. It uses the existing `@waagd_bot` OpenClaw
receiver and the existing `waagd-staging` Worker/D1. Do not deploy production,
alter DNS, create R2, start a poller, register a Telegram webhook, or modify
Shmul.

## Staging state already prepared

- Worker: `waagd-staging`, deployed version
  `19782463-4ee7-4598-962e-f8924df1fcf2` (source/media polish).
- D1: `waagd-staging` (`b943e33b-85ba-40e3-96b3-7ac5e9ef4578`), with
  migrations `0001_posts.sql` and `0002_url_less_news.sql`.
- Backup: `/Users/mikemmagik/Documents/waagd-staging-backups/waagd-staging-2026-10-21-pre-0002/waagd-staging-pre-migration.sql`.
  Its SHA-256 is recorded in the adjacent `manifest.txt`; the SQL is mode 0600.
- Immediate Worker rollback target: `51b64cc2-f5d9-4532-b9ef-d1f64acd6ac1`.

The public staging hostname is protected by Cloudflare Access. A browser login
or an Access service token is therefore required for staging evidence; a normal
Worker write token alone is insufficient.

## Required private inputs

Create or use the target MacBook's existing secret mechanism. Do not put values
in this repository, OpenClaw config, shell history, screenshots, chat, or logs.
The existing OpenClaw Gateway process must receive all of these variables:

```text
WAAGD_API_ORIGIN=https://waagd-staging.waagd.workers.dev
WAAGD_API_WRITE_TOKEN=<staging Worker write token>
WAAGD_CF_ACCESS_CLIENT_ID=<staging Access service-token client ID>
WAAGD_CF_ACCESS_CLIENT_SECRET=<staging Access service-token client secret>
WAAGD_TELEGRAM_ALLOWED_IDS=<one or more numeric owner IDs, comma-separated>
WAAGD_STATE_DIR=<absolute private directory outside this repository>
```

The Access service token must be allowed by the existing Cloudflare Access
application for the staging hostname. The owner ID is a numeric Telegram user
ID, not a username or chat title. Do not set either legacy automation flag:
`WAAGD_ENABLE_LEGACY_TELEGRAM_POLLER` and `WAAGD_ENABLE_LEGACY_DAILY` must stay
unset or `false`.

If the existing staging Worker secret cannot be recovered, rotate **only** its
staging `API_WRITE_TOKEN` and update the target MacBook's private secret store
with the identical new value. Never echo that value. A rotation is not needed
when the existing private value is already available to the operator.

## Target MacBook procedure

Run these read-only checks on the MacBook that hosts the existing OpenClaw
Gateway, before installing anything:

```bash
openclaw --version
openclaw gateway status --deep --require-rpc
openclaw plugins list --json
git -C /absolute/path/to/weareallgonnadie rev-parse HEAD
```

The first command must report `2026.10.3`. The current orchestration machine
does not host OpenClaw or its configuration, so the existing Gateway service
manager is the only place that can load the private variables above. Use that
existing manager to inject them and restart/reload that one Gateway instance;
do not start a second Gateway process. Confirm the state directory is owned by
the Gateway user and has mode 0700.

With the private environment available to the existing Gateway, install the
link-targeted plugin from the checked-out site repository:

```bash
openclaw plugins install --link /absolute/path/to/weareallgonnadie/automation --force
openclaw config set 'plugins.entries.waagd-telegram-ingress.hooks.allowConversationAccess' true --strict-json
openclaw plugins enable waagd-telegram-ingress --accept-capabilities
openclaw plugins reload waagd-telegram-ingress --wait
openclaw plugins inspect waagd-telegram-ingress --runtime --json
```

Review the local source before accepting capabilities. The plugin has only
`message_received` and `before_dispatch` hooks; it declares no channel, bot,
webhook, poller, tool, or media-download capability. Its exact source is
`automation/openclaw/telegram-ingress.ts`.

In the same private environment, initialise the Publisher policy explicitly:

```bash
cd /absolute/path/to/weareallgonnadie
node automation/cli.ts policy auto pause
```

This writes only local private Publisher state. It does not contact the Worker
and leaves authorized Telegram submissions enabled.

## One staging acceptance

1. Record the visible-post count using the staging Access service token, without
   printing either secret:

   ```bash
   curl --fail --silent --show-error \
     -H "CF-Access-Client-Id: $WAAGD_CF_ACCESS_CLIENT_ID" \
     -H "CF-Access-Client-Secret: $WAAGD_CF_ACCESS_CLIENT_SECRET" \
     'https://waagd-staging.waagd.workers.dev/api/posts?limit=100'
   ```

2. From the numeric owner account, send one public article URL as plain direct
   text to the existing `@waagd_bot`. Do not use a group. Expect one
   `PUBLISHED` reply containing `https://waagd-staging.waagd.workers.dev/?post=<id>`.
   This proves the actual OpenClaw event fields, supported host reply path,
   metadata path, sole Publisher, Worker, D1 and permalink together.

3. In an Access-authorized browser session, open that permalink and confirm the
   card appears in the feed. Repeat the authenticated API read and confirm one
   new post with the returned ID.

4. Send the identical URL again from the owner. It is a new Telegram message
   but must reply `ALREADY EXISTS` and the post count must not increase. For a
   true provider-update redelivery test, use the existing OpenClaw operator
   facility to redeliver that same provider update; do not add a poller or raw
   webhook test harness. It must return the same receipt and create no post.

5. From an unlisted sender, send a public URL directly. Confirm there is no
   new post. From the owner, send a photo or video (with or without a URL) and
   confirm `UNSUPPORTED MEDIA` with no new post and no file URL in any reply.

6. Send `/status` from the owner and confirm automatic publication is `paused`.
   Send one more owner URL and confirm Telegram still publishes/duplicates
   normally while Discovery stays paused. Do not run `/resume auto`.

Preserve only private operator evidence: timestamp, post ID, Worker version,
sanitized OpenClaw runtime inspection, and before/after counts. Do not preserve
secrets, Access redirect URLs, raw Telegram payloads, or owner identifiers in
the repository.

## Source and media polish verification

This deployment does not change `PublicationIntent v1`, owner allowlisting,
Publisher state, OpenClaw, or D1 data. It changes presentation and metadata
attribution only:

- `origin=telegram` remains the audit channel; `source` is now resolved from
  the original public URL.
- `fd2434ea-9a24-4ad5-b69b-dd4e3c0ec85b` is intentionally still stored as
  `source=Telegram`, but its card must show **Bangkok Post** from its original
  URL. Open its staging permalink while signed in through the existing Access
  flow; do not edit or republish the row.
- For a new owner URL, confirm that the card source is the publisher/domain
  rather than `Telegram`. Exact YouTube, Instagram, TikTok and Reddit hosts
  retain the existing consent-gated embed path; an unsupported path becomes an
  original-link fallback card and never auto-plays.

## Rollback

1. Disable the linked plugin with the existing OpenClaw control path. Keep the
   existing bot and its original ingress running; do not add a replacement.
2. Keep auto paused and retain the private Publisher state directory for review.
3. If Worker rollback is needed, run this against staging only after reviewing
   the staged version list:

   ```bash
   npx wrangler rollback 51b64cc2-f5d9-4532-b9ef-d1f64acd6ac1 \
     --name waagd-staging \
     --message 'Rollback WAAGD staging Telegram acceptance'
   ```

4. Do not restore D1 casually. `0002_url_less_news.sql` is forward-compatible.
   If a database restore is approved, verify the backup SHA-256 first and use
   the saved SQL only against `waagd-staging` in a maintenance window; never
   use it against `waagd-production`.
