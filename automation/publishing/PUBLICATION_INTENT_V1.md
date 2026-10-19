# PublicationIntent v1

`publication-intents.json` is a private data-only batch:

```json
{
  "version": 1,
  "producer": "waagd-discovery",
  "intents": [/* PublicationIntent v1 */]
}
```

The normative item schema is [publication-intent-v1.schema.json](publication-intent-v1.schema.json).
A `PublicationIntent v1` has exact, closed keys. Its stable `intent_id` is
`auto:<candidate_key>:<decision_revision>`, and `content_hash` is the SHA-256
of the canonical UTF-8 JSON `post` object. The `post` is an `auto` `news` post
with a source URL and a non-empty editorial body. `source_item_id` must be the
stable hash derived from `intent_id`.

The hand-off preserves candidate, delivery, decision, verification, editorial,
publisher, source-time, risk, evidence and policy metadata in the private
journal. A delivery is separate from publication: changing a `delivery_id` for
the same content is a redelivery, not a new article. Reusing an `intent_id` with
a different canonical `post` or `content_hash` fails closed as an identity
conflict.

`authorization` records the producer's trusted-policy assertion for audit. It
is not a bearer capability: the site still calls the injected, local
`JournalPublisher.authorize` function before any Worker request. The importer
rejects anything other than `VERIFIED`, `READY_FOR_REVIEW`, auto-publish
assertion, valid evidence, and no high or critical editorial risks. It does not
infer verification from a HTTP response.

Fixtures:

- [valid intent batch](fixtures/publication-intent-v1-valid.json)
- [tampered content hash](fixtures/publication-intent-v1-invalid-content-hash.json)
