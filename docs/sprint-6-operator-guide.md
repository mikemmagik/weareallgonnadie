# Sprint 6 operator guide

This guide describes the site-side integration boundary. It does not authorize a
deployment, a DNS change, a Cloudflare resource change, a bot change, or a change to
the existing OpenClaw runtime.

## Publication flows

There are two separate flows:

1. **Automatic:** WAAGD Discovery produces an approved `PublicationIntent` version 1;
   the trusted Site Publisher validates it, writes a durable receipt, and uses the
   existing authenticated `POST /api/posts` API. The editorial/AI process never owns
   the site write token.
2. **Owner Telegram:** the existing bot/OpenClaw ingress passes a normalized incoming
   event to the Telegram Submission Adapter. The adapter verifies the numeric Telegram
   user ID and private chat before asking the same trusted Publisher to submit it.

The two flows have different authorization evidence and do not share a pause switch.
`/pause auto` and `/resume auto` control automatic publication only; owner Telegram
commands remain available. The Site Publisher state directory stores receipts and
retriable requests outside this repository, with the existing ownership and permission
checks.

## Existing-bot boundary

Do not run `automation/cli.ts telegram`, enable the legacy poller service, register a
new bot, or call `getUpdates` for the existing `@waagd_bot`. The adapter is a pure
event handler for the bot's already-installed OpenClaw ingress. Wire that ingress to
the adapter only after checking the installed OpenClaw version and making a backup of
its current configuration. This repository does not alter that runtime.

Only the configured allowlist of numeric user IDs may publish. A username is display
metadata, never authorization. Groups, bot senders, edited messages, and unrecognized
events are ignored. The adapter derives a stable identity from the Telegram event;
redelivery therefore returns the existing publication rather than creating another.

## Owner commands

- `/start`, `/help`: show the supported owner workflow.
- `/status`: show the latest durable receipt for the private owner chat.
- `/preview`: save the next eligible submission as a draft (or show the current
  draft, depending on the adapter response).
- `/publish`: send the saved draft.
- `/delete <post-id>`: soft-delete through the existing authenticated API.
- `/pause auto`, `/resume auto`: change only the automatic-publication kill switch.

Direct owner messages publish without the Discovery editorial gate. A public URL,
plain text, or URL followed by a comment is supported. Plain text becomes a `news`
post with no source URL, a non-empty body, and an event-derived identity. URLs retain
their original link, safe metadata handling, link card/provider behavior, and any
comment as the body.

For direct Telegram photo, video, or document uploads, the current release returns a
truthful unsupported-media response and does not create a post. It never stores a
Telegram bot-token file URL. A future R2 implementation must be separately approved
and must validate byte limits, declared and sniffed MIME type, file signatures,
allowlisted formats, authorization, object visibility, and duplicate identity before
it can report success.

## Discovery handoff

The legacy repository collector (`daily`) is a compatibility workflow, not the live
automatic source. It stays disabled unless an operator explicitly uses the documented
legacy compatibility opt-in. Do not schedule it while WAAGD Discovery is connected.
After staging acceptance of the new intent path, remove the legacy discovery collector
in a separately reviewed change while retaining generic API, retry, deduplication, and
state modules.

An accepted auto intent maps to the existing post API as follows:

| Intent field             | Stored post field                    |
| ------------------------ | ------------------------------------ |
| approved headline        | `title`                              |
| full article             | `body`                               |
| original event URL       | `url` and normalized `canonical_url` |
| event/source attribution | `source` and stable `source_item_id` |
| verified source list     | `references`                         |
| trusted auto flow        | `origin: "auto"`, `type: "news"`     |

The article body is escaped as text by the site. Do not present satire or generated
editorial phrasing as a quotation from the source.

## Staging runbook and rollback

Staging requires an operator-provided staging origin, staging-only write token, and an
existing migrated Worker/D1 binding. Never point these commands at production or infer
credentials from a developer shell. First run `npm run validate`; then run the two
deterministic Sprint 6 E2E scenarios with the staging configuration supplied through a
private environment file. Check the resulting permalink in the staging frontend and
the adapter confirmation in the existing bot.

Required negative cases are malformed intent, absent API token, unauthorized owner,
timeout/API failure and retry, duplicate/redelivery, auto kill switch, unsupported
media, rollback of a failed draft, and URL-less text. No staging or production action
is performed by repository validation.

To roll back before a schema migration, disable auto publication, stop the new ingress
handoff, and return the existing bot to its prior routing. To roll back application
code after a migration, restore a compatible Worker/assets revision; do **not** revert
the D1 schema. The URL-less-news migration is backward compatible with existing rows.
Leave already-published content intact and preserve the local receipt/state directory
for review and replay decisions.
