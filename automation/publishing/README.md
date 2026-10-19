# Sprint 6 publication capability

`JournalPublisher` is a trusted, host-side HTTP client for the existing Worker
`POST /api/posts` contract. It never gives the write token to the editorial model.
It requires an injected `authorize(intent)` function that checks persisted trusted
editorial verification and decision state, or a saved, authenticated owner command.
The intent's `mode` and other fields are data, not proof of authorization.

The operator-controlled `enabled` function defaults to `false`. Repeated calls
with the same identity and exact payload return the saved receipt; changed
content under an existing identity fails closed. Automatic identities are
`auto:<candidateKey>:<decisionRevision>`. Owner-command identities are
`telegram-<24 lowercase hexadecimal characters>`. The caller must provide a
stable `source_item_id` for URL-less articles using
`stableSourceItemId(identity)`; the Worker then has an atomic duplicate key even
if the process dies after POST. For URL-backed posts the Worker's canonical URL
is also an atomic duplicate key. A duplicate tombstone yields `visible:false`
and `url:null`, so a caller cannot describe it as a visible publication.

The private journal records the exact intent before the first POST. Each later
attempt checks the public paginated feed for that identity before resending
the same payload. Reconciliation reads have a page bound; a post outside the
bound is still protected by the Worker's unique keys and duplicate response.
Transport uncertainty, retryable status codes and invalid success responses
remain in the journal. Terminal 4xx errors become held records. API requests
are reserved in a private UTC-day budget before each GET or POST, with a
separate per-process cycle bound. The journal and budget contain no token.

`contentDigest` is SHA-256 of the UTF-8 bytes of canonical compact JSON:
recursively sort object keys, preserve array order, emit Unicode directly,
and use no whitespace. Input is the exact `CreatePostInput`; the schema keys
are ASCII and unpaired UTF-16 surrogates are rejected. Python can compute it
with:

```python
hashlib.sha256(
    json.dumps(payload, sort_keys=True, ensure_ascii=False,
               separators=(",", ":"), allow_nan=False).encode("utf-8")
).hexdigest()
```

The cross-language fixture in `automation/tests/publishing.test.ts` hashes
to `2325466ef9967ee35bfaff58a192fe3a97cc65a963ba49ac7c9dabd7c4b7e2ca`.
No model cost is incurred by this module; the Gateway adapter must enforce
its own model-spend limits before calling it. Real API or staging credentials
are not used by these tests.
