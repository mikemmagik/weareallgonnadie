# Existing OpenClaw Telegram ingress

This repository does not install, configure, reload, or otherwise change OpenClaw.
It does not create a Telegram bot, call `getUpdates`, register a webhook, or run a
second polling consumer. Those actions remain outside the release and require a
separate operator decision.

## Supported site boundary

For OpenClaw `v2026.10.3`, this repository supplies the linkable plugin package
at `automation/`. Its `message_received` hook records attachment evidence and
its `before_dispatch` hook returns the adapter reply through OpenClaw's existing
reply path. It maps only documented fields: `channel`, `isGroup`, `senderId`,
`messageId` and `content`. Telegram's direct-chat message ID is used as the
stable provider identity because this hook version does not expose
`providerUpdate`.

The plugin has no channel ownership: it does not create a bot, call Telegram,
receive a token, poll, register a webhook, or download media. The adapter still
verifies the numeric owner allowlist, rejects media without fetching it, invokes
the sole Publisher, and returns its permalink text. It never invokes an
editorial model.

Follow the staging-only [operator packet](../../docs/staging-telegram-operator.md).
The target MacBook's installed Gateway must still prove the actual event and
reply path during the live acceptance before Telegram is called integrated.

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
