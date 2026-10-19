# Existing OpenClaw Telegram ingress

This repository does not install, configure, reload, or otherwise change OpenClaw.
It does not create a Telegram bot, call `getUpdates`, register a webhook, or run a
second polling consumer. Those actions remain outside the release and require a
separate operator decision.

## Supported site boundary

The existing `@waagd_bot` ingress may pass an already admitted direct Telegram event
to `handleOpenClawTelegramInbound()` in `automation/telegram/handler.ts`. The adapter
accepts only these technical facts:

- `channel: "telegram"` and `direct: true`;
- numeric sender ID, message ID, and provider update ID;
- plain message content; and
- optional media presence only, which is rejected without fetching a file.

The caller keeps responsibility for receiving the event and returning the adapter's
reply through its own documented OpenClaw reply path. The adapter verifies the
numeric owner allowlist again, derives a durable update identity, accepts one or more
public URLs, prepares safe technical metadata/embed fallback cards, publishes through
the sole Publisher, and returns the permalink. It never invokes an editorial model.

An operator must map the installed OpenClaw version's actual inbound fields to this
small shape and confirm the reply path in a staging-only test. This repository has
unit and local Worker/D1 coverage but does not claim a live OpenClaw integration.

## Safety constraints

- Do not enable `automation/cli.ts telegram` or
  `WAAGD_ENABLE_LEGACY_TELEGRAM_POLLER` for `@waagd_bot`.
- Do not install the retired project poller plugin, create another bot, or add a
  webhook/polling owner.
- Keep `WAAGD_TELEGRAM_ALLOWED_IDS` as numeric owner IDs in private runtime
  configuration; never authorize by username or message text.
- Direct file attachments receive `UNSUPPORTED MEDIA`; R2, file downloads and media
  storage are not planned in this release.
- Keep the Publisher state directory and Worker/Discovery secrets outside Git,
  messages, logs, and model context.

## Operator acceptance, not performed here

After explicit staging authorization, send one owner URL through the existing ingress
and verify a permalink reply, redeliver the same event, then confirm an unauthorized
sender and a binary attachment create no post. Keep auto paused while performing the
Telegram check; Telegram owner URLs intentionally remain independent of that
Discovery control. No production deployment follows from this document.
