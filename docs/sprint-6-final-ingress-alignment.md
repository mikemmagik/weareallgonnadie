# Sprint 6 final Discovery ingress alignment

Status: release-candidate preparation only. This change neither deploys to
staging/production nor changes OpenClaw, Telegram, Cloudflare, DNS, or secrets.

## Canonical path

There is one PublicationIntent v1 contract in `automation/core/intent.ts` and
one publisher in `automation/core/state.ts::Publisher`. New Discovery output is
the direct core envelope produced by `waagd-discovery` commit
`9b2d95a002a28ca54265f290a4cd14eac7f009b9` and enters only through
`automation/discovery/ingress.ts::acceptDiscoveryPublicationIntent()`.

The ingress requires the separately provisioned Discovery ingress secret. Its
JSON `authorization` field is editorial evidence, not transport authority. The
secret remains distinct from the Worker write token and must never be committed,
logged, or supplied to an AI process.

`automation/discovery/importer.ts` is isolated legacy compatibility for the
retired bounded batch export from Discovery `7ac6bcb`; it is not part of the
Sprint 6 pipeline.

## Contract and delivery guarantees

Discovery sends exactly one `origin: "auto"` intent containing an approved
Discovery authorization, required editorial approval metadata, and a valid
`CreatePostInput`. Automatic posts must be `type: "news"`, carry the complete
English body and at least one verified reference. `type: "article"` is rejected.

`content_hash` is SHA-256 of the compact UTF-8 JSON document reconstructed in
the declared v1 field order: version, intent ID, origin, authorization,
editorial, and post. Both the Python producer and TypeScript core rebuild this
document before hashing, so input object key order cannot affect the result.

Receipts bind the intent ID, hash, and semantic source identity. Exact
redelivery returns the stored receipt without another Worker POST. A changed
payload under the same intent ID is a conflict. Automatic delivery starts
paused; pause blocks queued/replay automatic POSTs, while the separately
authorized Telegram owner route remains available.

## CI and acceptance evidence

The Sprint 6 workflow checks out the pinned Discovery commit outside the site
workspace, runs its real Python fixture producer, then verifies:

1. producer -> core validator -> trusted Publisher -> local Worker/D1 ->
   frontend feed parser;
2. exact redelivery makes no second POST;
3. changed content with the same intent ID conflicts; and
4. focused Publisher tests cover pause/replay and permitted Telegram delivery.

No operator staging test is repeated by CI. Before a staging decision, keep
auto paused and retain the private Publisher state directory. Rollback is to
pause automatic delivery, preserve receipts/outbox for review, and return to a
compatible site revision; do not delete published content or reverse a forward
D1 migration.

## Remaining production blockers

- operator-provided staging secrets and isolated state directory;
- observed existing OpenClaw event mapping and owner reply through the existing
  bot (no second poller);
- one combined staging acceptance with operator-owned evidence;
- separately approved R2/media implementation for Telegram file uploads; and
- explicit production deployment authorization.
