# Sprint 6 cross-branch reconciliation

Status: release candidate prepared on `sprint-6-site-integration`. No staging,
production, Cloudflare, OpenClaw, Telegram bot, or DNS change is performed by this
repository change.

## One Publisher and one canonical site intent

The retained Publisher is `automation/core/state.ts::Publisher`. The alternate
branch's `JournalPublisher`, inbox/journal and its HTTP-oriented import path are not
merged. They would create a second persistence and publication authority boundary.

The only object that reaches `Publisher.submitDiscoveryIntent()` is the core
`PublicationIntent v1` in `automation/core/intent.ts`:

| Field           | Canonical rule                                                                                                                           |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `intent_id`     | Stable Discovery `auto:<candidate_key>:<decision_revision>`; never derived from a delivery retry.                                        |
| `origin`        | `auto`; the post origin must match.                                                                                                      |
| `authorization` | `{ kind: 'discovery', approved: true }`; audit data alone never authorizes transport.                                                    |
| `editorial`     | Required; normalized candidate/revision identity, source attribution/time, and `{ version, outcome: 'approved' }` policy.                |
| `content_hash`  | SHA-256 of canonical `post` JSON only.                                                                                                   |
| `post`          | Valid shared `CreatePostInput`, strictly `news`, `auto`, URL-bearing, full body and non-empty references.                                |
| source identity | Canonical URL/source/source-item identity; Discovery source item is `waagd:` + SHA-256 of `intent_id`.                                   |
| idempotency     | Receipt binds intent ID, post hash and semantic identity. Changed content or editorial/source semantics under the same ID is a conflict. |

Automatic policy starts paused. The separate `WAAGD_DISCOVERY_INGRESS_TOKEN` remains
mandatory and is compared before any Publisher call; it is distinct from the Worker
write token. The Telegram adapter remains on `submitTelegramIntent()` and does not
share the automatic kill switch.

## Discovery compatibility importer

Discovery commit `7ac6bcb8` emits its existing bounded batch shape. Site code calls
it **Discovery export v1**, not an alternative site `PublicationIntent`. The strict
reader in `automation/discovery/importer.ts` verifies its producer, exact fields,
policy assertion, VERIFIED/READY editorial state, evidence, safe risks, UUID delivery
metadata, stable source ID and content hash. It then maps the data once to the
canonical core intent and invokes the one Publisher. No HTTP journal, Worker, poller
or second Publisher is added.

`content_hash` is byte-for-byte interoperable with Discovery Python:

```text
SHA-256(UTF-8(canonical-json(post)))
```

Canonical JSON sorts object keys lexically, retains array order, uses compact
separators, preserves Unicode, and rejects non-finite values or unpaired surrogates.
This is the same rule as Python `json.dumps(post, sort_keys=True,
ensure_ascii=False, separators=(',', ':'), allow_nan=False)`.

## Evidence and CI

The cross-repository Worker/D1 test runs the actual Python fixture script from the
pinned Discovery SHA, imports its generated export, publishes through the existing
Publisher, reads the real local Worker/D1 result, and validates the response through
the frontend feed parser. Redelivery yields the same post. CI checks out that pinned
producer with Python 3.13 before `npm run validate`.

The previous remote failure was not a product regression: independent regression
acceptance attempted to write `output/regression-001` without creating it. The test
now creates its own evidence directory, so fresh CI runners no longer depend on a
locally pre-existing ignored folder.

## Staging procedure (prepared, not run)

1. Provide only staging API origin, Worker write token, separate Discovery ingress
   token and a private `0700` Publisher state directory outside the repository.
2. Apply the already-reviewed forward migrations to staging D1. Do not point any
   command at production and do not put credentials in files, Git, logs or prompts.
3. Keep auto paused. Run the same Discovery producer export through the importer;
   confirm zero POST while paused. Explicitly resume auto, then verify one stored
   post, long escaped body, references, frontend feed, exact redelivery and changed
   content conflict.
4. Re-pause auto and replay a queued automatic submission: observe zero POST. Resume
   only after review and verify safe duplicate/receipt completion.
5. Separately pass a direct numeric-owner event from the existing OpenClaw ingress to
   the existing Telegram adapter. Do not start any new poller or change OpenClaw.

Rollback is: pause auto, preserve Publisher state/receipts for review, detach the
new Discovery handoff, and restore a compatible Worker/assets revision. Do not undo a
forward D1 migration or delete already-published content.
