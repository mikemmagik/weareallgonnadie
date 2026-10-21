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

## D1 quota and audit

Migration `0003_publication_intent_v2_quota.sql` adds immutable
`publication_audit` and `automatic_publication_slots`. A D1 insert trigger uses
`strftime('%Y-%m-%d','now')` (the D1 UTC clock), reserves one of five daily
slots only for a new `origin=auto` post, and aborts the sixth transaction with 429. Duplicates never reserve a slot; deletion never removes one; Telegram has
no slot path. Publisher v1/v2 receipts persist the audit envelope; v1 route is
`null`, not a fabricated verified label.

## Staging operator packet

Keep `auto_paused=true`. Before any authorized staging migration, export only
the staging D1 database, verify its SHA-256 outside Git, apply only `0003`, and
read back migrations/triggers/slot rows. The migration is additive: Worker
rollback does not require D1 restore; use a reviewed forward corrective
migration if a trigger must later be disabled. Do not send Discovery, Telegram,
LLM, OpenClaw, production, or DNS traffic for this change.

## Minimal Discovery change

After Site acceptance only, Discovery should emit v2 for trusted publisher
decisions using its exact configured publisher ID/RSS/final URL/host and its
existing safety result. It must set the post canonical URL to the final article
URL and calculate the documented v2 hash. Independently VERIFIED output stays
v1 or is explicitly v2 `independently_verified`; trusted publisher must never
be relabelled VERIFIED.
