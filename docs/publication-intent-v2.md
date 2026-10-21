# PublicationIntent v2 — trusted publisher route

`PublicationIntent v1` remains frozen and is accepted exactly as before. v2 is
a separate closed envelope: v2 fields are never inferred for v1. Automatic
v2 uses trusted Discovery ingress and `origin=auto`; Telegram remains separate
with `editorial=null` and cannot claim either route.

## Exact v2 editorial fields

v2 retains every v1 top-level and post field, with `version: 2`. Its automatic
editorial object adds closed `review_route` and `trusted_publisher` fields:

```json
{
  "review_route": "independently_verified | trusted_publisher",
  "trusted_publisher": {
    "publisher_id": "allowlist identifier",
    "publisher_name": "display name",
    "trusted_rss_url": "exact HTTPS RSS provenance",
    "article_url": "verified final HTTPS article URL",
    "article_host": "exact lower-case article host",
    "verified_at": "UTC RFC3339 milliseconds",
    "safety_gates": {
      "publisher_identity": true,
      "safe_retrieval": true,
      "sensitive_content": "clear"
    }
  }
}
```

`independently_verified` requires `trusted_publisher: null`. `trusted_publisher`
requires the complete object, exact article-host match and a post canonical URL
that normalizes to `article_url`. It proves publisher identity and safety gates,
never independent fact verification. Unknown routes/fields, v1 route fields,
unsafe URLs, bad hashes and incomplete provenance are denied. The v2 hash uses
the frozen v1 document order plus these two editorial fields.

## Hash wire format and fixtures

`content_hash` is excluded from the SHA-256 input. The producer builds a compact
UTF-8 JSON object in this exact order (not the order received over HTTP):

1. root: `version`, `intent_id`, `origin`, `authorization`, `editorial`, `post`;
2. authorization: `kind`, `approved`;
3. editorial: v1 fields `decision_id`, `source_event_id`,
   `source_attribution`, `approved_at`, `publication_policy`, then v2
   `review_route`, `trusted_publisher`;
4. policy: `version`, `outcome`; trusted provenance: `publisher_id`,
   `publisher_name`, `trusted_rss_url`, `article_url`, `article_host`,
   `verified_at`, `safety_gates`; safety gates: `publisher_identity`,
   `safe_retrieval`, `sensitive_content`;
5. post: `type`, `url`, `canonical_url`, `source_item_id`, `title`, `source`,
   `origin`, `preview`, `embed`, `body`, `references`.

Use compact JSON (`ensure_ascii=False`, `allow_nan=False` in Python; UTF-8) and
SHA-256 lowercase hex. Object keys received in another order are rebuilt in the
order above before hashing. The committed cross-repository test vectors are:

- `automation/tests/fixtures/publication-intent-v2-trusted-publisher.json`
- `automation/tests/fixtures/publication-intent-v2-independently-verified.json`

They include the expected hash and are valid end-to-end publisher envelopes,
not illustrative partial snippets.

## D1 quota and audit

Migration `0003_publication_intent_v2_quota.sql` adds immutable
`publication_audit` and `automatic_publication_slots`. A D1 insert trigger uses
`strftime('%Y-%m-%d','now')` (the D1 UTC clock), reserves one of five daily
slots only for a new `origin=auto` post, and aborts the sixth transaction with 429. Duplicates never reserve a slot; deletion never removes one; Telegram has
no slot path. Publisher v1/v2 receipts persist the audit envelope; v1 route is
`null`, not a fabricated verified label.

## Staging operator packet

Keep `auto_paused=true`. Before any authorized staging migration:

1. Export only the `waagd-staging` D1 database to an operator-controlled
   private location, record its SHA-256 and verify that the export can be read.
   Keep the export and its hash outside Git and chat transcripts.
2. Confirm the target Worker is `waagd-staging`, the target D1 binding is the
   staging database, and `d1_migrations` contains only the expected earlier
   migrations. Apply only `0003_publication_intent_v2_quota.sql`.
3. Read back the migration marker, `publication_audit`,
   `automatic_publication_slots`, and the three `0003` triggers. Check existing
   posts count and IDs are unchanged. Existing posts are intentionally not
   backfilled and therefore consume no historic slots.
4. Deploy a reviewed staging Worker only after this check. Keep Discovery auto
   paused. Sanity-check one read-only feed request and no automatic write.

The migration is additive, so rolling the Worker back to v0.1.1 is compatible
with the retained schema and does not require D1 restoration. Do not down-migrate
or delete audit/slot rows to "free" a quota. Restore the verified export only
for a separately approved database incident; otherwise use a reviewed forward
corrective migration if a trigger must later change. Do not send Discovery,
Telegram, LLM, OpenClaw, production, or DNS traffic for this change.

## Minimal Discovery change

After Site acceptance only, Discovery should emit v2 for trusted publisher
decisions using its exact configured publisher ID/RSS/final URL/host and its
existing safety result. It must set the post canonical URL to the final article
URL and calculate the documented v2 hash. Independently VERIFIED output stays
v1 or is explicitly v2 `independently_verified`; trusted publisher must never
be relabelled VERIFIED.
